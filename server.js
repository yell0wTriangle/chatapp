/*
 * server.js
 *
 * This is the main entry point for the Node.js application.
 * It's configured to run on a hosting platform like Render,
 * using the provided PORT and listening on host 0.0.0.0.
 */

const http = require("http");
const { requestHandler } = require("./src/router");
const { setupWebSocketServer } = require("./src/chatServer");

// Render provides the PORT variable via environment.
// Listen on 0.0.0.0 to accept connections from outside the container.
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const server = http.createServer(requestHandler);

// Attach the WebSocket server to the HTTP server
setupWebSocketServer(server);

server.listen(PORT, HOST, () => {
  // This log will appear in your Render service logs
  console.log(`Server is live and listening on http://${HOST}:${PORT}`);
});
