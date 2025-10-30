/*
 * src/authHandler.js
 *
 * UPDATED:
 * - Imports `users` and `createUser` from the new `src/db.js`.
 * - Exports `generateToken` so `chatServer.js` can use it.
 * - `generateToken` now includes `name` and `avatar`.
 * - `handleSignup` now uses `createUser` to make a full user object.
 *
 * - (Gemini Fix) Imported `isWriterActive` from sessionState.js
 * to block login/signup if a Writer is already active.
 */

const crypto = require("crypto");
// --- FIX ---
// Import from our new shared database file
const { users, createUser } = require("./db.js");
// Import the state-checker function
const { isWriterActive } = require("./sessionState.js");
// --- END FIX ---

// Helper function to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

// --- FIX ---
// Now generates a token with the 'name' and 'avatar' fields
function generateToken(user) {
  const tokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name, // Add name
    avatar: user.avatar, // Add avatar
  };
  return Buffer.from(JSON.stringify(tokenPayload)).toString("base64");
}
// --- END FIX ---

async function handleLogin(req, res) {
  try {
    const { email, password } = await parseJsonBody(req);
    const user = users.get(email);

    if (user && user.password === password) {
      // --- FIX: Check if a Writer is already active ---
      if (user.role === "Writer" && isWriterActive()) {
        res.writeHead(409, { "Content-Type": "application/json" }); // 409 Conflict
        return res.end(
          JSON.stringify({
            message:
              "A Writer is already active. Log in as a Reader or try again later.",
          })
        );
      }
      // --- END FIX ---

      const token = generateToken(user);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Login successful!", token }));
    } else {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Invalid credentials" }));
    }
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: error.message }));
  }
}

async function handleSignup(req, res) {
  try {
    const { email, password, role } = await parseJsonBody(req);

    if (!email || !password || !role) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ message: "Email, password, and role are required" })
      );
    }

    if (users.has(email)) {
      res.writeHead(409, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "User already exists" }));
    }

    // --- FIX: Check if a Writer is already active ---
    if (role === "Writer" && isWriterActive()) {
      res.writeHead(409, { "Content-Type": "application/json" }); // 409 Conflict
      return res.end(
        JSON.stringify({
          message:
            "A Writer is already active. You can sign up as a Reader or try again later.",
        })
      );
    }
    // --- END FIX ---

    // --- FIX ---
    // Use our new createUser function
    const newUser = createUser(email, password, role);
    users.set(email, newUser);
    console.log("New user created:", newUser);
    // --- END FIX ---

    const token = generateToken(newUser);
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Signup successful!", token }));
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: error.message }));
  }
}

// --- FIX ---
// Export generateToken so chatServer can create new tokens
module.exports = { handleLogin, handleSignup, generateToken };
// --- END FIX ---
