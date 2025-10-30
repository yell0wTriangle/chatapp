/*
 * public/js/chat.js
 *
 * UPDATED:
 * - (Gemini Fix) Swapped to sessionStorage for tab-specific tokens.
 * - (Gemini Fix) Pointed WebSocket to the live Render backend URL.
 */

document.addEventListener("DOMContentLoaded", () => {
  const messageContainer = document.getElementById("message-container");
  const chatForm = document.getElementById("chat-form");
  const messageInput = document.getElementById("message-input");
  const sendButton = document.getElementById("send-button");
  const roleStatus = document.getElementById("role-status");
  const participantCount = document.getElementById("participant-count");
  const writerList = document.getElementById("writer-list");
  const readerList = document.getElementById("reader-list");

  let currentUser = null;
  let socket = null;

  // Read from sessionStorage
  const token = sessionStorage.getItem("chatToken");
  if (!token) {
    window.location.href = "/";
    return;
  }

  // --- DEPLOYMENT FIX ---
  // !! This is your actual Render backend URL (hostname only)
  const BACKEND_HOST = "chatapp-9gjc.onrender.com";

  // Use the new backend host for the WebSocket connection
  // This correctly creates: wss://chatapp-9gjc.onrender.com
  socket = new WebSocket(`wss://${BACKEND_HOST}?token=${token}`);
  // --- END FIX ---

  socket.onopen = () => {
    console.log("WebSocket connection established.");
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "init":
        currentUser = data.currentUser;
        initializeChat(data.history, data.clients);
        updateRoleUI(currentUser.role);
        break;
      case "userListUpdate":
        renderParticipantList(data.clients);
        break;
      case "messageQueued":
        const pendingMsgEl = document.getElementById(`msg-temp-${data.tempId}`);
        if (pendingMsgEl) {
          const statusEl = pendingMsgEl.querySelector(".message-status");
          if (statusEl) {
            statusEl.textContent = data.reason;
          }
        }
        break;
      case "newMessage":
        const existingMsgEl = document.getElementById(
          `msg-temp-${data.message.tempId}`
        );
        if (existingMsgEl) {
          existingMsgEl.classList.remove("opacity-70");
          existingMsgEl.id = `msg-${data.message.id}`;
          const statusEl = existingMsgEl.querySelector(".message-status");
          if (statusEl) {
            statusEl.textContent = new Date(
              data.message.timestamp
            ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            statusEl.classList.remove("text-yellow-400");
            statusEl.classList.add("text-matrix-text-secondary");
          }
        } else {
          renderMessage(data.message, false, false);
        }
        break;
      case "system":
        renderSystemMessage(data.message);
        break;
      case "error":
        showInputError(data.message);
        break;
      case "forceDisconnect":
        renderSystemMessage(data.message);
        messageInput.disabled = true;
        sendButton.disabled = true;
        roleStatus.textContent = "Disconnected";
        roleStatus.classList.add("text-red-500");
        socket.close(); // Close the socket
        break;
    }
  };

  socket.onclose = (event) => {
    if (event.code !== 1000) {
      console.log("WebSocket connection closed:", event.reason);
      renderSystemMessage(
        `Connection closed: ${event.reason || "Network error"}. Please refresh.`
      );
      messageInput.disabled = true;
      sendButton.disabled = true;
      roleStatus.textContent = "Disconnected";
    }
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
    renderSystemMessage("A connection error occurred.");
  };

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (currentUser && currentUser.role === "Reader") {
      showInputError("Readers are not allowed to send messages.");
      return;
    }

    const messageContent = messageInput.value;
    if (messageContent.trim() && socket.readyState === socket.OPEN) {
      const tempId =
        Date.now().toString() + Math.random().toString(36).substr(2, 9);

      const pendingMessage = {
        id: null,
        tempId: tempId,
        user: {
          email: currentUser.email,
          name: currentUser.name,
          avatar: currentUser.avatar,
        },
        content: messageContent,
        timestamp: new Date().toISOString(),
      };

      renderMessage(pendingMessage, true, true);

      socket.send(
        JSON.stringify({
          type: "chatMessage",
          content: messageContent,
          tempId: tempId,
        })
      );

      messageInput.value = "";
    }
  });

  // --- UI Rendering Functions ---

  function initializeChat(history, clients) {
    messageContainer.innerHTML = "";
    renderSystemMessage("Welcome to the chat!");
    history.forEach((msg) =>
      renderMessage(msg, msg.user.email === currentUser.email, false)
    );
    renderParticipantList(clients);
  }

  function renderParticipantList(clients) {
    writerList.innerHTML = "";
    readerList.innerHTML = "";
    participantCount.textContent = `${clients.length} online`;

    clients.sort((a, b) => a.name.localeCompare(b.name));

    clients.forEach((client) => {
      const isYou = client.email === currentUser.email;
      const list = client.role === "Writer" ? writerList : readerList;
      const icon = client.role === "Writer" ? "edit" : "visibility";

      const userHtml = `
        <div class="flex items-center gap-3 px-3 py-2 rounded-lg ${
          isYou
            ? "bg-matrix-green/10 border border-matrix-green/50"
            : "hover:bg-matrix-grid"
        }">
          <div class.relative">
            <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8" style="background-image: url('${
              client.avatar
            }');"></div>
            <span class="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-matrix-panel"></span>
          </div>
          <p class="text-sm font-medium leading-normal ${
            isYou
              ? "text-matrix-green font-semibold"
              : "text-matrix-text-primary"
          }">
            ${client.name} ${isYou ? "(You)" : ""}
          </p>
          <span class="material-symbols-outlined text-xl ml-auto ${
            isYou ? "text-matrix-green" : "text-matrix-text-secondary"
          }">
            ${icon}
          </span>
        </div>`;
      list.innerHTML += userHtml;
    });
  }

  function renderMessage(msg, isYou, isPending) {
    const messageId = isPending ? `msg-temp-${msg.tempId}` : `msg-${msg.id}`;
    const timeOrStatus = isPending
      ? "Pending..."
      : new Date(msg.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

    const statusColor = isPending
      ? "text-yellow-400"
      : "text-matrix-text-secondary";
    const pendingClass = isPending ? "opacity-70" : "";
    const avatar =
      msg.user.avatar || "https://api.dicebear.com/8.x/lorelei/svg";
    const displayName = isYou ? "You" : msg.user.name || msg.user.email;

    const messageHtml = `
      <div class="flex gap-3 ${pendingClass}" id="${messageId}">
        ${
          !isYou
            ? `<div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 flex-shrink-0" style="background-image: url('${avatar}');"></div>`
            : '<div class="w-10 flex-shrink-0"></div>'
        }
        
        <div class="flex flex-1 flex-col items-stretch gap-1 ${
          isYou ? "items-end" : ""
        }">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 ${
            isYou ? "flex-row-reverse" : ""
          }">
            <p class="text-matrix-green text-base font-bold leading-tight">${displayName}</p>
            <p class="message-status text-sm font-normal leading-normal ${statusColor}">${timeOrStatus}</p>
          </div>
          <div class="bg-matrix-panel border border-matrix-border rounded-lg p-3 ${
            isYou ? "bg-matrix-green/10" : ""
          } max-w-max ${isYou ? "self-end" : ""}">
            <p class="text-matrix-text-primary text-base font-normal leading-normal">${
              msg.content
            }</p>
          </div>
        </div>
        
        ${
          isYou
            ? `<div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 flex-shrink-0" style="background-image: url('${avatar}');"></div>`
            : '<div class="w-10 flex-shrink-0"></div>'
        }
      </div>
    `;
    messageContainer.innerHTML += messageHtml;
    scrollToBottom();
  }

  function renderSystemMessage(text) {
    const systemHtml = `
      <div class="py-2">
        <div class="w-full border-t border-matrix-border"></div>
        <p class="text-matrix-text-secondary text-sm font-normal leading-normal py-3 text-center">${text}</p>
        <div class="w-full border-t border-matrix-border"></div>
      </div>
    `;
    messageContainer.innerHTML += systemHtml;
    scrollToBottom();
  }

  function updateRoleUI(role) {
    if (role === "Reader") {
      roleStatus.textContent = "You are a Reader (view only)";
      roleStatus.classList.add("text-yellow-400");
      messageInput.placeholder = "Readers cannot send messages...";
      messageInput.disabled = true;
      sendButton.disabled = true;
      sendButton.classList.add("opacity-50", "cursor-not-allowed");
    } else {
      roleStatus.textContent = "You are a Writer (can send messages)";
      roleStatus.classList.add("text-matrix-green");
      messageInput.placeholder = "Type your message here...";
      messageInput.disabled = false;
      sendButton.disabled = false;
    }
  }

  function showInputError(message) {
    const originalText = roleStatus.textContent;
    const originalColor = roleStatus.className;

    roleStatus.textContent = message;
    roleStatus.className =
      "text-red-400 text-sm font-normal leading-normal pb-2 px-2 text-center";

    setTimeout(() => {
      roleStatus.textContent = originalText;
      roleStatus.className = originalColor;
    }, 3000);
  }

  function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }
});
