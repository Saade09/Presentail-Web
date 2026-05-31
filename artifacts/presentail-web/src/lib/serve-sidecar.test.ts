import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVE_MJS = path.resolve(__dirname, "../../serve.mjs");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function waitForReady(port: number, maxMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/favicon-16x16.png" },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `serve.mjs on :${port} did not become ready within ${maxMs}ms`,
            ),
          );
        } else {
          setTimeout(attempt, 150);
        }
      });
      req.end();
    }
    setTimeout(attempt, 150);
  });
}

function get(
  port: number,
  urlPath: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

let serverPort: number;
let serverProc: ChildProcess;

beforeAll(async () => {
  serverPort = await getFreePort();
  serverProc = spawn("node", [SERVE_MJS], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      BASE_PATH: "",
      INTERNAL_API_BASE_URL: "http://127.0.0.1:0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForReady(serverPort);
}, 15_000);

afterAll(() => {
  serverProc?.kill("SIGTERM");
});

describe("serve.mjs — sidecar file blocking", () => {
  it("returns 404 for a .br sidecar request", async () => {
    const { status, body } = await get(
      serverPort,
      "/assets/index-abc123.js.br",
    );
    expect(status).toBe(404);
    expect(body).toContain("Not Found");
  });

  it("returns 404 for a .gz sidecar request", async () => {
    const { status, body } = await get(
      serverPort,
      "/assets/index-abc123.js.gz",
    );
    expect(status).toBe(404);
    expect(body).toContain("Not Found");
  });

  it("returns 404 for a .BR request (case-insensitive)", async () => {
    const { status } = await get(serverPort, "/assets/index-abc123.js.BR");
    expect(status).toBe(404);
  });

  it("returns 404 for a .GZ request (case-insensitive)", async () => {
    const { status } = await get(serverPort, "/assets/index-abc123.css.GZ");
    expect(status).toBe(404);
  });

  it("returns 404 for a deeply-nested .br path", async () => {
    const { status } = await get(
      serverPort,
      "/assets/sub/dir/chunk-xyz.js.br",
    );
    expect(status).toBe(404);
  });

  it("does not block a plain .js request (no .br/.gz extension)", async () => {
    const { status } = await get(serverPort, "/assets/index-abc123.js");
    expect(status).not.toBe(404);
  });

  it("serves an existing static file without being blocked", async () => {
    const { status } = await get(serverPort, "/favicon-16x16.png");
    expect(status).toBe(200);
  });
});
