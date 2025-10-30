/*
 * src/fileHandler.js
 * This module is responsible for reading and serving static files
 * from the 'public' directory (e.g., HTML, CSS, client-side JS).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Define the base directory for public files
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Map file extensions to MIME types
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function serveStaticFile(req, res, requestedPath) {
  // Security: Prevent directory traversal attacks
  const normalizedPath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalizedPath);

  // Security check: Ensure the resolved path is still within the PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        console.warn(`File not found: ${filePath}`);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        console.error(`Error reading file ${filePath}:`, err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
}

module.exports = { serveStaticFile };
