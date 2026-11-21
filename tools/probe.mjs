// The comparison probe: drives a built tree through the reader's screens and
// records what a reader sees there — the DOM of the window, the computed
// style of the parts that carry the design, the scroll positions, the page
// language and the state the app saved.
//
//   node tools/probe.mjs --tree <dir> --out <file> [--lang zh] [--headed]
//
// `<dir>` is a built tree (the repo's dist/) with the demo/ folder beside the
// page, which is how the repository serves it on its own. The probe is run
// once against the tree of the previous tag and once against the new one;
// tools/compare.mjs diffs the two JSON files.
//
// `date` and the clock in the status line are recorded as they are and masked
// by the comparison, like every other value that differs between two runs.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const option = (name, fallback = "") => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const tree = resolve(option("tree"));
const out = resolve(option("out", "tools/out/probe.json"));
const lang = option("lang", "zh");
const headed = args.includes("--headed");

if (!existsSync(join(tree, "reader", "index.html"))) {
  console.error(`NO  probe: ${tree} has no reader/index.html`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/** A static server for the tree, with the same headers a plain file server sends. */
function serve(root) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    let file = join(root, path);
    if (!file.startsWith(root + sep) && file !== root) {
      response.writeHead(403).end("forbidden");
      return;
    }
    if (path.endsWith("/")) file = join(file, "index.html");
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
    }
  });
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => ready({ server, port: server.address().port }));
  });
}

const STYLE_PROPERTIES = [
  "display",
  "position",
  "grid-template-columns",
  "grid-template-rows",
  "gap",
  "align-items",
  "justify-content",
  "width",
  "height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-bottom-style",
  "border-top-color",
  "border-radius",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration-line",
  "text-transform",
  "white-space",
  "overflow-x",
  "overflow-y",
  "opacity",
  "cursor",
];

const STYLE_SELECTORS = [
  "body",
  "#app",
  ".aaron-blog-window",
  ".aaron-blog-status",
  "[data-blog-section-label]",
  "[data-blog-count]",
  "[data-blog-sync]",
  ".aaron-blog-pane",
  ".aaron-blog-shell",
  ".aaron-blog-rail",
  '.aaron-blog-rail button[aria-pressed="true"]',
  ".aaron-blog-list-pane",
  ".aaron-blog-list-head",
  ".aaron-blog-list-head input",
  ".aaron-blog-context",
  ".aaron-blog-list",
  ".aaron-blog-row",
  ".aaron-blog-row time",
  ".aaron-blog-row-title",
  ".aaron-blog-row-tags",
  '.aaron-blog-row[aria-current="true"]',
  '.aaron-blog-row[aria-current="true"] .aaron-blog-row-tags',
  ".aaron-blog-tag-list button",
  ".aaron-blog-year-list button",
  ".aaron-blog-series-list button",
  ".aaron-blog-group h3",
  ".aaron-blog-more",
  ".aaron-blog-article",
  ".aaron-blog-article-inner",
  ".aaron-blog-article-head",
  ".aaron-blog-article-body",
  ".aaron-blog-article-body p",
  ".aaron-blog-article-foot",
  ".aaron-blog-empty",
];

/** What the page says about itself: the title, the language, the state it keeps. */
async function pageFacts(page) {
  return page.evaluate(() => {
    const styles = {};
    for (const selector of window.__probeStyles.selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        styles[selector] = null;
        continue;
      }
      const computed = getComputedStyle(element);
      const properties = {};
      for (const property of window.__probeStyles.properties)
        properties[property] = computed.getPropertyValue(property);
      styles[selector] = properties;
    }
    const article = document.querySelector("[data-blog-article]");
    const list = document.querySelector("[data-blog-list]");
    const state = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("ais6:")) state[key] = localStorage.getItem(key);
    }
    return {
      title: document.title,
      lang: document.documentElement.lang,
      appearance: document.documentElement.getAttribute("data-appearance"),
      scroll: { article: article ? article.scrollTop : null, list: list ? list.scrollTop : null },
      state,
      styles,
    };
  });
}

const { server, port } = await serve(tree);
const base = `http://127.0.0.1:${port}/reader/index.html`;
const browser = await chromium.launch({ headless: !headed, args: headed ? ["--use-angle=metal"] : [] });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
await context.addInitScript(
  ({ selectors, properties }) => {
    window.__probeStyles = { selectors, properties };
  },
  { selectors: STYLE_SELECTORS, properties: STYLE_PROPERTIES },
);
// The serializer runs in the page so the recorded DOM is the live one.
await context.addInitScript(() => {
  window.__probeSnapshot = () => {
    const serialize = (node) => {
      if (node.nodeType === 3) {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        return text ? { text } : null;
      }
      if (node.nodeType !== 1) return null;
      const attributes = {};
      for (const attribute of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
        attributes[attribute.name] = attribute.value;
      }
      return {
        tag: node.tagName.toLowerCase(),
        attributes,
        children: [...node.childNodes].map(serialize).filter(Boolean),
      };
    };
    return serialize(document.getElementById("app"));
  };
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error?.message || error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

const steps = [];
const record = async (name) => {
  steps.push({
    name,
    facts: await pageFacts(page),
    dom: await page.evaluate(() => window.__probeSnapshot()),
  });
};

const ready = async () => {
  await page.waitForSelector(".aaron-blog-row, .aaron-blog-empty", { timeout: 15000 });
  await page.waitForTimeout(250);
};
const click = async (selector) => {
  await page.click(selector);
  await page.waitForTimeout(300);
};

try {
  await page.goto(`${base}?lang=${lang}`);
  await ready();
  await record("list");
  await click('[data-post-id="demo-paper"]');
  await page.waitForSelector(".aaron-blog-article-body");
  await record("post");
  await click("[data-blog-back]");
  await record("back");
  await click('[data-blog-section="tags"]');
  await record("tags");
  await click('[data-filter-tag="letters"]');
  await record("tag-filter");
  await click("[data-blog-clear-filter]");
  await record("filter-cleared");
  await click('[data-blog-section="archive"]');
  await record("archive");
  await page.click(".aaron-blog-year-list button");
  await page.waitForTimeout(300);
  await record("year-filter");
  await click('[data-blog-section="all"]');
  await record("all");
  await click('[data-blog-section="notes"]');
  await record("notes");
  await click("[data-note-id]");
  await record("note");
  await click('[data-blog-section="best"]');
  await record("best");
  await click('[data-blog-section="threads"]');
  await record("threads");
  await click('[data-blog-section="all"]');
  await page.fill("[data-blog-search]", "tides");
  await page.waitForTimeout(400);
  await record("search");
  await page.fill("[data-blog-search]", "");
  await page.waitForTimeout(300);
  // A long read scrolls; the selection is saved with its scroll position.
  await click('[data-post-id="demo-scroll"]');
  await page.waitForSelector(".aaron-blog-article-body");
  await page.evaluate(() => {
    document.querySelector("[data-blog-article]").scrollTop = 600;
  });
  await page.waitForTimeout(500);
  await record("post-scrolled");
  // The selection is saved; a reload must come back to it.
  await click('[data-post-id="demo-formats"]');
  await page.waitForSelector(".aaron-blog-article-body");
  await page.waitForTimeout(400);
  await page.reload();
  await ready();
  await page.waitForSelector(".aaron-blog-article-body");
  await page.waitForTimeout(400);
  await record("restored");
  // English, from a clean state so the pass starts on the list.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?lang=en`);
  await ready();
  await record("list-en");
  await click('[data-post-id="demo-formats"]');
  await page.waitForSelector(".aaron-blog-article-body");
  await record("post-en");
} catch (error) {
  errors.push(`probe: ${String(error?.message || error)}`);
} finally {
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify({ tree, lang, steps, errors }, null, 2));
  await browser.close();
  server.close();
}

const failed = errors.length > 0;
console.log(`${failed ? "NO " : "OK "} probe ${tree}: ${steps.length} steps -> ${out}`);
for (const error of errors.slice(0, 10)) console.error(`   ${error}`);
process.exit(failed ? 1 : 0);
