import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

/**
 * Minimal static file server for the E2E suite — serves web/index.html
 * and the design-system markdown. Deliberately framework-free so the
 * webServer option needs no extra dependencies.
 */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    // KAIROS API paths must answer 404 here: the console probes
    // GET /experience for liveness, and a 200 HTML SPA-fallback made it
    // wrongly report "API live" so demo-mode E2E tests never ran.
    if (/^\/(run|stream|agents|memory|experience)(\/|\?|$)/.test(pathname)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found (static E2E server serves web/ only)" }));
      return;
    }
    // Route everything else unknown to the SPA entry point.
    const file = join(process.cwd(), "web", pathname);
    const body = await readFile(file).catch(() => readFile(join(process.cwd(), "web", "index.html")));
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("server error");
  }
});

server.listen(4173);
