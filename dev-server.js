/**
 * Local preview server (no Vercel account needed).
 * Serves /public and runs the /api routes. Uses a temporary in-memory database,
 * so content resets whenever you stop the server.
 */
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin12345";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "local-dev-secret";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".apk": "application/vnd.android.package-archive", ".zip": "application/zip" };
const ROUTES = ["data", "download", "request", "auth", "admin"];

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];

    if (url.startsWith("/api/")) {
      const name = url.slice(5);
      if (!ROUTES.includes(name)) { res.statusCode = 404; return res.end("Not found"); }
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
        require(path.join(__dirname, "api", name))(req, res);
      });
      return;
    }

    const file = path.normalize(path.join(PUBLIC, url === "/" ? "index.html" : decodeURIComponent(url)));
    if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end("Forbidden"); }
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; return res.end("Not found"); }
      res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`\n  Design to Deploy running at  http://localhost:${PORT}`);
    console.log(`  Admin password: ${process.env.ADMIN_PASSWORD}   (stop with Ctrl+C)\n`);
  });
