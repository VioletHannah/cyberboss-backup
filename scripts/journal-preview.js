const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function main() {
  const stateDir = process.env.CYBERBOSS_STATE_DIR || path.join(os.homedir(), ".cyberboss");
  const outputDir = path.resolve(process.env.CYBERBOSS_JOURNAL_DIR || path.join(stateDir, "journal"));
  const publicDir = path.join(outputDir, "public");
  const host = process.env.JOURNAL_HOST || "127.0.0.1";
  const port = Number(process.argv[2] || process.env.JOURNAL_PORT || 8767);

  if (!fs.existsSync(path.join(publicDir, "Journal.html"))) {
    throw new Error(`Journal site is not built. Run: npm run journal:build`);
  }

  const server = http.createServer((req, res) => {
    const filePath = resolvePublicFile(publicDir, req.url || "/");
    if (!filePath) {
      writeText(res, 403, "Forbidden");
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        writeText(res, 404, "Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    });
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Try: npm run journal:preview -- ${port + 1}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`Journal preview: http://${host}:${port}/Journal.html`);
    console.log(`Serving static files from: ${publicDir}`);
  });
}

function resolvePublicFile(publicDir, requestUrl) {
  let pathname = "/";
  try {
    pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  } catch {
    return null;
  }
  const normalized = decodeURIComponent(pathname).replace(/^\/+/, "");
  const requested = normalized || "Journal.html";
  const fullPath = path.resolve(publicDir, requested);
  if (!fullPath.startsWith(publicDir + path.sep) && fullPath !== publicDir) {
    return null;
  }
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    return path.join(fullPath, "Journal.html");
  }
  return fullPath;
}

function writeText(res, statusCode, text) {
  const body = Buffer.from(`${text}\n`, "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

main();
