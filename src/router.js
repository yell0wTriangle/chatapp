/*
 * src/router.js
 * This module handles all incoming HTTP requests and routes them
 * to the appropriate handler (e.g., file handler or API handler).
 *
 * UPDATED:
 * - Added CORS headers to allow requests from the Vercel frontend.
 */

const { serveStaticFile } = require("./fileHandler");
const { handleLogin, handleSignup } = require("./authHandler");

function requestHandler(req, res) {
  // --- ADD THIS CORS HEADER BLOCK ---
  // This allows your Vercel domain to make requests to your Render domain.
  // For production, you could restrict this to your actual Vercel URL.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle the browser's "preflight" OPTIONS request.
  if (req.method === "OPTIONS") {
    res.writeHead(204); // 204 No Content
    res.end();
    return;
  }
  // --- END CORS BLOCK ---

  console.log(`Incoming request: ${req.method} ${req.url}`);

  // API Routes for authentication
  if (req.method === "POST" && req.url === "/api/login") {
    return handleLogin(req, res);
  }

  if (req.method === "POST" && req.url === "/api/signup") {
    return handleSignup(req, res);
  }

  // Page Routes (serve specific HTML files)
  if (req.method === "GET") {
    // Sanitize URL to remove query parameters for routing
    const route = req.url.split("?")[0];

    switch (route) {
      case "/":
      case "/login":
        // Serve the main login/signup page
        return serveStaticFile(req, res, "/index.html");
      case "/chat":
        // Serve the chat page
        return serveStaticFile(req, res, "/chat.html");
      case "/profile":
        // Serve the profile page
        return serveStaticFile(req, res, "/profile.html");
    }
  }

  // Static File Server (for CSS, client-side JS, images, etc.)
  if (
    req.method === "GET" &&
    (req.url.startsWith("/css/") || req.url.startsWith("/js/"))
  ) {
    return serveStaticFile(req, res, req.url);
  }

  // 404 Not Found for any other routes
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 Not Found");
}

module.exports = { requestHandler };
