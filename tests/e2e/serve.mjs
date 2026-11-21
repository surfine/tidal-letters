// What the browser specs share: a static server for the built tree, which the
// global setup lays out with the demo/ pack beside the page — the way the
// repository serves the app on its own.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

export const SERVE = resolve(process.cwd(), "test-results", "serve");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/** Serves `root`; the page is at /reader/index.html. */
export async function serveTree(root) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
    if (!file.startsWith(root + sep) && file !== root) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
    }
  });
  const port = await new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => ready(server.address().port));
  });
  return { server, url: `http://127.0.0.1:${port}/reader/index.html` };
}
