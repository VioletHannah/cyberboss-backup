const http = require("http");

const MAX_BODY_BYTES = 1024 * 1024;

class AppUsageHttpServer {
  constructor({ service, host = "0.0.0.0", port = 4319, token = "" }) {
    this.service = service;
    this.host = host || "0.0.0.0";
    this.port = port === undefined || port === null ? 4319 : port;
    this.token = typeof token === "string" ? token.trim() : "";
    this.server = null;
  }

  async start() {
    if (this.server) {
      return this.server;
    }
    await this.service.initialize();
    if (!this.token) {
      console.warn("[cyberboss] app usage webhook auth disabled: APP_USAGE_TOKEN is not set");
    }
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res).catch((error) => {
        writeJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error || "unknown error"),
        });
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    return this.server;
  }

  async close() {
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = null;
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async handleRequest(req, res) {
    const method = String(req.method || "").toUpperCase();
    const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
    if (method === "GET" && pathname === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }
    if (method !== "POST" || pathname !== "/api/app-usage/event") {
      writeJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { ok: false, error: body.error });
      return;
    }
    if (!this.isAuthorized(req, body.data)) {
      writeJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const { token, ...payload } = body.data;
    void token;
    const result = await this.service.recordAppUsageEvent(payload);
    writeJson(res, result.ok ? 200 : 400, result);
  }

  isAuthorized(req, body) {
    if (!this.token) {
      return true;
    }
    const bodyToken = typeof body?.token === "string" ? body.token.trim() : "";
    const authorization = typeof req.headers.authorization === "string"
      ? req.headers.authorization.trim()
      : "";
    const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
    const headerToken = bearerMatch ? bearerMatch[1].trim() : "";
    return bodyToken === this.token || headerToken === this.token;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      return { ok: false, error: "request body too large" };
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return { ok: false, error: "request body is required" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "request body must be a JSON object" };
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
}

function writeJson(res, statusCode, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

module.exports = { AppUsageHttpServer };
