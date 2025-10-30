/*
 * src/db.js
 *
 * This file acts as our in-memory "database" for users.
 * By centralizing it here, both authHandler.js and chatServer.js
 * can import and modify the same user data, keeping it in sync.
 */

const crypto = require("crypto");

const users = new Map();

// Helper to create a user, including new 'name' and 'avatar' fields
function createUser(email, password, role) {
  const name = email.split("@")[0]; // Default name from email
  return {
    id: crypto.randomUUID(),
    email: email,
    password: password, // In a real app, HASH this
    role: role,
    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize
    avatar: `https://api.dicebear.com/8.x/lorelei/svg?seed=${email}`,
  };
}

// Add our default test users
users.set(
  "writer@example.com",
  createUser("writer@example.com", "password", "Writer")
);
users.set(
  "reader@example.com",
  createUser("reader@example.com", "password", "Reader")
);

module.exports = { users, createUser };
