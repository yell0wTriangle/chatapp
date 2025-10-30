/*
 * src/chatServer.js
 *
 * UPDATED:
 * - (Issue 1) Implemented a "reconnection grace period"
 * to prevent "left"/"joined" messages on page reloads/navigation.
 * - Added `disconnectTimers` Map.
 * - `on('close')`: Now starts a 5-second timer
 * instead of immediately broadcasting a 'left' message.
 * - `on('connection')`: Now checks for and clears this
 * timer, suppressing the 'joined' message for
 * fast reconnections.
 *
 * - (Issue 2) Isolated profile updates to stop them from
 * interfering with the main chat session.
 * - `on('connection')`: Checks for a `purpose=profile`
 * query param.
 * - If `purpose=profile`, the server *only* handles the
 * `profileUpdate` message and does *not* add the user
 * to the main chat, fixing the duplicate session bug.
 *
 * - (Gemini Fix) Imported `clients` map from sessionState.js
 * to share active user state with authHandler.js.
 */

const { WebSocketServer } = require("ws");
const url = require("url");
const crypto = require("crypto");
const { users } = require("./db.js");
const { generateToken } = require("./authHandler.js");

// --- FIX ---
// Import shared state instead of using a local clients map
const { clients } = require("./sessionState.js");
// --- END FIX ---

const chatHistory = [];
// const clients = new Map(); // This is now imported from sessionState.js
const disconnectTimers = new Map(); // For reconnection grace period

let readerCount = 0;
let isWriting = false; // The Write Lock
const writerQueue = [];

function setupWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    let userInfo;
    let purpose;
    try {
      const query = url.parse(req.url, true).query;
      const token = query.token;
      purpose = query.purpose; // Check for special connection purpose

      if (!token) throw new Error("No token provided.");
      userInfo = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
      if (!userInfo.id || !userInfo.email || !userInfo.role) {
        throw new Error("Invalid token payload.");
      }
      userInfo.ws = ws;
    } catch (error) {
      console.error("Failed to authenticate client:", error.message);
      ws.close(1008, "Authentication failed");
      return;
    }

    // --- FIX 2: Handle special-purpose connections (like profile update) ---
    if (purpose === "profile") {
      console.log(`Handling isolated profile update for ${userInfo.email}`);
      handleProfileUpdateConnection(ws, userInfo);
      return; // Stop processing as a full chat client
    }
    // --- End Fix 2 ---

    console.log(`Client connecting: ${userInfo.email} as ${userInfo.role}`);

    // --- FIX 1: Reconnection Grace Period Logic ---
    let isReconnection = false;
    if (disconnectTimers.has(userInfo.email)) {
      console.log(`Client reconnected within grace period: ${userInfo.email}`);
      isReconnection = true;
      clearTimeout(disconnectTimers.get(userInfo.email));
      disconnectTimers.delete(userInfo.email);
    }
    // --- End Fix 1 ---

    // --- Handle Duplicate Sessions ---
    let oldClient = null;
    for (const client of clients.values()) {
      if (client.email === userInfo.email) {
        oldClient = client;
        break;
      }
    }

    if (oldClient) {
      console.log(
        `Found existing connection for ${userInfo.email}. Disconnecting old session.`
      );
      oldClient.ws.send(
        JSON.stringify({
          type: "forceDisconnect",
          message:
            "You have logged in from a new location. This session is being disconnected.",
        })
      );
      oldClient.ws.close(1000, "Logged in from new location");
      clients.delete(oldClient.ws);
      if (oldClient.role === "Reader") {
        readerCount--;
      }
    }

    clients.set(ws, userInfo);
    console.log(`Client connected: ${userInfo.name} (${userInfo.email})`);

    // --- Readers-Writers Logic: On Connection ---
    if (isWriting) {
      ws.send(
        JSON.stringify({
          type: "system",
          message: "Server is busy with a write, retrying connection...",
        })
      );
      setTimeout(() => ws.close(1013, "Server busy, please retry"), 1000);
      return;
    }

    if (userInfo.role === "Reader") {
      readerCount++;
      console.log(`Reader joined. Total readers: ${readerCount}`);
    }

    ws.send(
      JSON.stringify({
        type: "init",
        currentUser: userInfo,
        history: chatHistory,
        clients: getClientList(),
      })
    );

    broadcastUserList();

    // --- FIX 1: Only broadcast "joined" if it's not a reconnection ---
    if (!isReconnection) {
      broadcastSystemMessage(`${userInfo.name} (${userInfo.role}) has joined.`);
    }
    // --- End Fix 1 ---

    // --- Handle Incoming Messages (Chat) ---
    ws.on("message", (message) => {
      const parsedMessage = JSON.parse(message);
      const user = clients.get(ws);

      switch (parsedMessage.type) {
        case "chatMessage":
          if (user.role === "Reader") {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Readers cannot send messages.",
              })
            );
            return;
          }
          handleWriteRequest(ws, parsedMessage);
          break;
        // Profile update is now handled by handleProfileUpdateConnection
      }
    });

    // --- On Close ---
    ws.on("close", (code, reason) => {
      const user = clients.get(ws);
      if (user) {
        // Remove from active clients
        clients.delete(ws);

        if (user.role === "Reader") {
          readerCount--;
          console.log(`Reader left. Total readers: ${readerCount}`);
        }

        // Don't broadcast "left" if it was a forced disconnect
        if (code === 1000 && reason === "Logged in from new location") {
          console.log(`Client force-disconnected: ${user.name}`);
          broadcastUserList(); // Still update user list
          return; // Don't start a timer
        }

        // --- FIX 1: Start "left" timer ---
        console.log(
          `Client disconnected: ${user.name}. Starting 2-minute grace period.`
        );
        // Clear any old timer just in case
        if (disconnectTimers.has(user.email)) {
          clearTimeout(disconnectTimers.get(user.email));
        }

        const timer = setTimeout(() => {
          console.log(
            `Grace period expired for ${user.name}. Broadcasting left message.`
          );
          broadcastSystemMessage(`${user.name} has left.`);
          broadcastUserList(); // Update list *after* grace period
          disconnectTimers.delete(user.email);
        }, 120000); // 120 second (2 minute) grace period

        disconnectTimers.set(user.email, timer);
        // --- End Fix 1 ---

        if (readerCount === 0 && !isWriting && writerQueue.length > 0) {
          console.log("Last reader left. Checking writer queue.");
          processWriterQueue();
        }
      }
    });

    ws.on("error", (error) => console.error("WebSocket error:", error));
  });
  console.log("Readers-Writers WebSocket server is set up.");
}

// --- FIX 2: Isolated Handler for Profile Updates ---
function handleProfileUpdateConnection(ws, userInfo) {
  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);

    if (parsedMessage.type === "profileUpdate") {
      const newName = parsedMessage.newName;
      if (newName && newName.trim().length > 0) {
        console.log(
          `Updating profile for ${userInfo.email} via isolated connection. New name: ${newName}`
        );
        const oldName = userInfo.name;

        // 1. Update "persistent" user DB
        const dbUser = users.get(userInfo.email);
        if (dbUser) {
          dbUser.name = newName;
        }

        // 2. Update all active chat clients
        const activeClient = Array.from(clients.values()).find(
          (c) => c.email === userInfo.email
        );
        if (activeClient) {
          activeClient.name = newName;
        }

        // 3. Broadcast the change to all users
        broadcastUserList();
        broadcastSystemMessage(`${oldName} is now known as ${newName}.`);

        // 4. Send a new token back to the sender
        const newToken = generateToken(dbUser);
        ws.send(
          JSON.stringify({
            type: "profileUpdateSuccess",
            newToken: newToken,
          })
        );
      }
    }
    // After processing, close this temporary socket
    ws.close();
  });

  ws.on("close", () =>
    console.log(`Profile update connection closed for ${userInfo.email}`)
  );
  ws.on("error", (e) => console.error("Profile update socket error:", e));
}
// --- End Fix 2 ---

// --- 8. Core Synchronization Functions ---

function handleWriteRequest(ws, messageData) {
  if (isWriting || readerCount > 0) {
    let reason = "";
    if (isWriting) {
      reason = "Another writer is active.";
    } else if (readerCount > 0) {
      reason = `Waiting for ${readerCount} reader(s) to finish.`;
    }

    writerQueue.push({ ws, messageData });
    console.log(`Writer ${clients.get(ws).email} queued. (Reason: ${reason})`);

    ws.send(
      JSON.stringify({
        type: "messageQueued",
        tempId: messageData.tempId,
        reason: `Queued: ${reason}`,
      })
    );
  } else {
    isWriting = true;
    console.log(
      `Lock Acquired. Granting write access to ${clients.get(ws).email}`
    );
    processWrite(ws, messageData);
  }
}

function processWrite(ws, messageData) {
  console.log(`Writer ${clients.get(ws).email} entered critical section.`);
  const user = clients.get(ws);

  const newMessage = {
    id: crypto.randomUUID(),
    tempId: messageData.tempId,
    user: { email: user.email, name: user.name, avatar: user.avatar },
    content: messageData.content,
    timestamp: new Date().toISOString(),
  };

  chatHistory.push(newMessage);
  broadcast(JSON.stringify({ type: "newMessage", message: newMessage }));

  setTimeout(() => {
    isWriting = false;
    console.log(
      `Writer ${clients.get(ws).email} exited critical section. Lock Released.`
    );
    processWriterQueue();
  }, 50);
}

function processWriterQueue() {
  if (!isWriting && readerCount === 0 && writerQueue.length > 0) {
    isWriting = true;
    const nextWriter = writerQueue.shift();
    console.log(
      `Lock Acquired. Granting write access to queued writer ${
        clients.get(nextWriter.ws).email
      }`
    );
    processWrite(nextWriter.ws, nextWriter.messageData);
  } else {
    console.log(
      `Queue check: Cannot process. (Writing: ${isWriting}, Readers: ${readerCount}, Queue: ${writerQueue.length})`
    );
  }
}

// --- 9. Utility Functions ---

function getClientList() {
  return Array.from(clients.values()).map((user) => ({
    email: user.email,
    role: user.role,
    name: user.name,
    avatar: user.avatar,
  }));
}

function broadcast(message) {
  clients.forEach((user, ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

function broadcastUserList() {
  broadcast(
    JSON.stringify({ type: "userListUpdate", clients: getClientList() })
  );
}

function broadcastSystemMessage(message) {
  broadcast(JSON.stringify({ type: "system", message }));
}

module.exports = { setupWebSocketServer };
