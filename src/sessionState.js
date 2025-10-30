/*
 * src/sessionState.js
 *
 * This module holds the shared state for active WebSocket connections (clients)
 * so that both the HTTP auth handler and the WebSocket server can access it.
 * This is the single source of truth for "who is online."
 */

// The single source of truth for active clients
const clients = new Map();

/**
 * Checks if a user with the 'Writer' role is currently in the active clients map.
 * @returns {boolean} True if a Writer is active, false otherwise.
 */
function isWriterActive() {
  for (const client of clients.values()) {
    if (client.role === "Writer") {
      return true;
    }
  }
  return false;
}

module.exports = { clients, isWriterActive };
