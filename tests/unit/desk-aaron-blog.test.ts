// What the desk's contracts `aaron-blog` and `aaron-blog-sideask-grounding`
// used to pin about this app, carried here because the desk now pins the built
// app and can no longer run or read its source. Each test names the old
// assertion it holds; the desk-side facts (routes, admission rows, manifests of
// the desk, ClioTalk's grounding, the server's pack check) stay on the desk.
//
// The reader runs for real (the Reader class over a stand-in bridge and page).
// Only the DOM-bound step, marking a cited paragraph, runs over a small
// stand-in article, because the unit run has no document.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { onLanguage } from "../../src/bridge/bridge.ts";
import type { BridgeClient } from "../../src/bridge/types.ts";
import { fetchPack, forgetContent, type PackKey } from "../../src/data/pack.ts";
import { Reader } from "../../src/reader/reader.ts";
import { fakeBridge, fakePage } from "./fake-bridge.ts";

const root = process.cwd();
const text = (path: string) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(text("public/app.manifest.json")) as {
  id: string;
  protocol: number;
  windows: {
    window: string;
    app: string;
    entry: string;
    capabilities: string[];
    menus: { id: string; hostMenu?: string; items?: unknown[] }[];
  }[];
};
const readerWindow = manifest.windows.find((entry) => entry.window === "aaronBlog");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? sourceFiles(path) : [path];
  });
}
const appSource = sourceFiles("src").filter((path) => /\.(ts|tsx|css)$/.test(path));

// ---- The pack the old reader contract ran against ----------------------------

const POST_ID = "p-2013";
const index = {
  posts: [
    { id: POST_ID, kind: "post", date: "2013-01-29", title: "个人计算", minutes: 3, tags: [], path: "/2013/01/29/" },
  ],
  notes: [],
  tags: [],
  series: [],
  best: [],
  longs: [],
};
const BODY = "<p>第一段落。</p><p>第二段，说到 Vista 的那一句。</p><p>第三段。</p>";
const packs = () =>
  fakePage({
    manifest: { contentHash: "h1" },
    index,
    "chunk/2013": { posts: { [POST_ID]: { html: BODY } } },
  });

/** A bridge that remembers every call it was made, in order. */
function recordedBridge() {
  const client = fakeBridge();
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const call = client.call.bind(client);
  Object.assign(client, {
    call: async (method: string, params: Record<string, unknown>, options?: unknown) => {
      calls.push({ method, params });
      return call(method as never, params as never, options as never);
    },
  });
  return { client, calls };
}

// The unit run has no document: a paragraph, the article body and the article
// are stood in for, with exactly what markCited touches.
function fakeBlock(content: string) {
  const classes = new Set<string>();
  return {
    textContent: content,
    scrolled: false,
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
    scrollIntoView() {
      this.scrolled = true;
    },
  };
}
function fakeArticle(paragraphs: string[]) {
  const blocks = paragraphs.map(fakeBlock);
  const body = {
    children: blocks,
    querySelectorAll: (selector: string) =>
      selector === ".is-cited" ? blocks.filter((block) => block.classList.contains("is-cited")) : [],
  };
  const site = { href: "https://aaronlau.me/2013/01/29/" };
  const siteNode = {
    getAttribute: () => site.href,
    setAttribute: (_name: string, value: string) => {
      site.href = value;
    },
  };
  const article = {
    querySelector: (selector: string) =>
      selector === ".aaron-blog-article-body" ? body : selector === "[data-blog-site]" ? siteNode : null,
    contains: () => false,
  };
  return { blocks, site, article };
}

/** Opens the pack and points the reader at a stand-in article, as the pane does. */
async function readerWithArticle(paragraphs = ["第一段落。", "第二段，说到 Vista 的那一句。", "第三段。"]) {
  const reader = new Reader(fakeBridge());
  const shown = fakeArticle(paragraphs);
  reader.articleRef(shown.article as unknown as HTMLElement);
  return { reader, ...shown };
}

beforeEach(async () => {
  packs().setWindow();
  await forgetContent({ client: fakeBridge() });
});

// ---- reveal: aaron-blog.test.mjs L169-188 ---------------------------------

describe("reveal", () => {
  it("opens the post and marks exactly the cited block, and brings it into view (L172-177)", async () => {
    const { reader, blocks } = await readerWithArticle();
    const shown = await reader.reveal({ postId: POST_ID, para: 1, quote: "第二段，说到 Vista" });
    reader.applyCite();
    expect(shown).toBe(true);
    expect(reader.selectedId.value).toBe(POST_ID);
    expect(blocks.map((block) => block.classList.contains("is-cited"))).toEqual([false, true, false]);
    expect(blocks[1]?.scrolled).toBe(true);
    expect(blocks[0]?.scrolled).toBe(false);
  });

  it("points the footer link to the site at the cited paragraph (L178)", async () => {
    const { reader, site } = await readerWithArticle();
    await reader.reveal({ postId: POST_ID, para: 1, quote: "第二段，说到 Vista" });
    reader.applyCite();
    expect(site.href.endsWith("#p1")).toBe(true);
  });

  it("lets the quote correct a stale position, and clears the old mark (L179-182)", async () => {
    const { reader, blocks } = await readerWithArticle();
    await reader.reveal({ postId: POST_ID, para: 1, quote: "第二段，说到 Vista" });
    reader.applyCite();
    await reader.reveal({ postId: POST_ID, para: 0, quote: "第三段" });
    reader.applyCite();
    expect(blocks.map((block) => block.classList.contains("is-cited"))).toEqual([false, false, true]);
  });

  it("answers false for a post that is not in the pack (L183)", async () => {
    const reader = new Reader(fakeBridge());
    expect(await reader.reveal({ postId: "nope" })).toBe(false);
  });

  it("is what the desk's pane runs: the article pane marks the citation it draws", () => {
    // Wiring fact the old reader had in one file: the pane calls applyCite.
    expect(text("src/ui/ArticlePane.tsx")).toContain("reader.applyCite()");
  });
});

// ---- the cache and the content door: L58-59, L184-187 ---------------------

describe("the pack cache and the content door", () => {
  it("keeps the fetched packs in bridge state under pack:*, writes no other content, and asks only the same-origin door (L185-187)", async () => {
    const page = packs();
    page.setWindow();
    const state = new Map<string, unknown>();
    const reader = new Reader(fakeBridge({ state }));
    await reader.reveal({ postId: POST_ID, para: 1, quote: "第二段" });
    for (const key of ["pack:manifest", "pack:index", "pack:chunk/2013"]) expect(state.has(key), key).toBe(true);
    expect([...state.keys()].filter((key) => key !== "ui").every((key) => key.startsWith("pack:"))).toBe(true);
    expect(page.requests.length).toBeGreaterThan(0);
    expect(page.requests.every((url) => url.startsWith("/api/aaron-blog/"))).toBe(true);
  });

  it("opens no database of its own: nothing touches indexedDB, and no source names it (L58)", async () => {
    const g = globalThis as unknown as { indexedDB?: unknown };
    Object.defineProperty(g, "indexedDB", {
      configurable: true,
      get() {
        throw new Error("the reader touched indexedDB");
      },
    });
    try {
      const reader = new Reader(fakeBridge());
      await reader.reveal({ postId: POST_ID, para: 1, quote: "第二段" });
      await reader.sync(true);
    } finally {
      delete g.indexedDB;
    }
    expect(appSource.filter((path) => text(path).includes("indexedDB"))).toEqual([]);
  });
});

// ---- intents: L192-198 ----------------------------------------------------

describe("handleIntent", () => {
  it("answers ok for a reveal of a known post and not ok for an unknown one (L193-195)", async () => {
    const reader = new Reader(fakeBridge());
    const revealed = await reader.handleIntent({
      intent: "reveal",
      options: { postId: POST_ID, para: 2, quote: "第三段" },
    });
    expect(revealed.ok).toBe(true);
    expect((await reader.handleIntent({ intent: "reveal", options: { postId: "nope" } })).ok).toBe(false);
  });

  it("opens and answers ok for an open intent (L196)", async () => {
    const reader = new Reader(fakeBridge());
    expect((await reader.handleIntent({ intent: "open" })).ok).toBe(true);
    expect(reader.index.value?.posts.map((post) => post.id)).toEqual([POST_ID]);
  });

  it("refuses an intent it does not take, by name (L197-198)", async () => {
    // Held at the same strength by reader.test.ts "refuses an intent it does not know";
    // this one uses the old contract's intent name.
    const reader = new Reader(fakeBridge());
    const unknown = await reader.handleIntent({ intent: "publish" });
    expect(unknown).toEqual({ ok: false, reason: "unsupported-intent" });
  });
});

// ---- SideAsk: aaron-blog L201-214, grounding L107, L109 -------------------

describe("askInSideAsk", () => {
  it("dispatches an ask intent to SideAsk naming {scope, postId, title, date, quote} for the post on screen", async () => {
    const { client, calls } = recordedBridge();
    const reader = new Reader(client);
    await reader.reveal({ postId: POST_ID, para: 0, quote: "" });
    const before = calls.length;
    expect(await reader.askInSideAsk({ scope: "post" })).toBe(true);
    const sent = calls.slice(before);
    const dispatch = sent.at(-1);
    expect(dispatch?.method).toBe("intent.dispatch");
    expect(dispatch?.params.intent).toBe("ask");
    expect(dispatch?.params.appId).toBe("sideAsk");
    expect(JSON.stringify(dispatch?.params.source)).toBe(
      JSON.stringify({ scope: "post", postId: POST_ID, title: "个人计算", date: "2013-01-29", quote: "" }),
    );
  });

  it("asks the whole blog, naming no post, when auto finds nothing selected", async () => {
    const { client, calls } = recordedBridge();
    const reader = new Reader(client);
    await reader.reveal({ postId: POST_ID, para: 0, quote: "" });
    await reader.askInSideAsk({ scope: "auto" });
    const source = calls.at(-1)?.params.source as { scope: string; postId: string; title: string };
    expect(source.scope).toBe("blog");
    expect(source.postId).toBe("");
    expect(source.title).toBe("");
  });

  it("asks through the assistant dispatch only: it asks nothing of the windows (grounding L109)", async () => {
    const { client, calls } = recordedBridge();
    const reader = new Reader(client);
    await reader.reveal({ postId: POST_ID, para: 0, quote: "" });
    const before = calls.length;
    await reader.askInSideAsk({ scope: "post" });
    expect(calls.slice(before).map((entry) => entry.method)).toEqual(["intent.dispatch"]);
    expect(appSource.filter((path) => text(path).includes("arrangeWindowAssistantSplit"))).toEqual([]);
  });

  it("offers Ask in SideAsk for the post and for the whole blog or a selection (grounding L107)", () => {
    expect(text("src/ui/ArticlePane.tsx")).toContain('data-blog-ask="post"');
    expect(text("src/ui/StatusBar.tsx")).toContain('data-blog-ask="auto"');
  });
});

// ---- the offline index for SideAsk: grounding L108, L112 -----------------

describe("the blog's chunk index for offline questions", () => {
  const sha = "a".repeat(64);
  const withRag = () =>
    fakePage({
      manifest: { contentHash: "h1", rag: { sha256: sha } },
      index,
      "chunk/2013": { posts: { [POST_ID]: { html: BODY } } },
      rag: { kind: "aaronlau-rag", chunks: [] },
    });

  it("keeps the verified index in bridge state under pack:rag, once per hash", async () => {
    const page = withRag();
    page.setWindow();
    const state = new Map<string, unknown>();
    const reader = new Reader(fakeBridge({ state }));
    await reader.sync();
    await waitFor(() => state.has("pack:ragSha256"));
    expect(state.get("pack:rag")).toEqual({ kind: "aaronlau-rag", chunks: [] });
    expect(state.get("pack:ragSha256")).toBe(sha);
    const fetchedOnce = page.requests.filter((url) => url.endsWith("/rag")).length;
    expect(fetchedOnce).toBe(1);
    await reader.sync();
    expect(page.requests.filter((url) => url.endsWith("/rag")).length).toBe(1);
  });
});

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition never held");
}

// ---- the menus are data: L77-89, L216 -----------------------------------

describe("the manifest's menus and the reader's answers", () => {
  const actions = new Set<string>();
  const collect = (items: unknown[] = []) => {
    for (const item of items as { action?: string; items?: unknown[] }[]) {
      if (item.action) actions.add(item.action);
      if (item.items) collect(item.items);
    }
  };
  for (const menu of readerWindow?.menus ?? []) collect(menu.items);

  it("contributes the menu set (L83)", () => {
    for (const action of ["blog-sync", "blog-search", "blog-back", "blog-section-best", "blog-section-threads"]) {
      expect(actions.has(action), action).toBe(true);
    }
  });

  it("answers every blog verb the manifest names (L86-89)", async () => {
    const reader = new Reader(fakeBridge());
    await reader.sync();
    const verbs = [...actions].filter((action) => action.startsWith("blog-"));
    expect(verbs.length).toBeGreaterThan(5);
    for (const action of verbs) {
      expect(await reader.runMenuCommand(action), action).toBe(true);
      expect(reader.menuState().available[action], action).toBe(true);
    }
  });

  it("ends with the desk's Window menu, as the file, edit, view, window set (L216-217)", () => {
    expect(readerWindow?.menus.at(-1)?.hostMenu).toBe("window");
    expect(readerWindow?.menus.map((menu) => menu.id).join()).toBe("file,edit,view,window");
  });
});

// ---- the app's own manifest: L30-34 -------------------------------------

describe("what the app's manifest declares", () => {
  it("names the window, the app and the page that draws it (L30)", () => {
    expect(readerWindow?.app).toBe("aaronBlog");
    expect(readerWindow?.entry).toBe("reader/index.html");
  });

  it("asks for state, snapshot, windows and intents, and nothing that reaches files, a model or a receipt (L31-33)", () => {
    const wanted = readerWindow?.capabilities ?? [];
    for (const capability of ["state", "snapshot", "windows", "intents"]) expect(wanted).toContain(capability);
    for (const capability of ["files", "receipts", "model", "access"]) expect(wanted).not.toContain(capability);
  });

  it("is the group the desk pins (L34)", () => {
    expect(manifest.id).toBe("tidal-letters");
    expect(manifest.protocol).toBe(1);
  });
});

// ---- the page and its wiring: L40-43, L74-75 -----------------------------

describe("the page", () => {
  it("loads its own stylesheet and script (L40-43)", () => {
    expect(text("reader/index.html")).toContain("src/main.tsx");
    expect(text("src/main.tsx")).toContain("./styles/aaron-blog.css");
  });

  it("does not frame the website (L75)", () => {
    expect(text("reader/index.html")).not.toMatch(/<iframe\b/i);
    expect(appSource.filter((path) => /<iframe\b/i.test(text(path)))).toEqual([]);
  });

  it("adds no chip styles of its own: ClioTalk's chips keep ClioTalk's (grounding L113)", () => {
    expect(appSource.filter((path) => /clio-basis-chip|message-grounding/.test(text(path)))).toEqual([]);
  });
});

describe("a language switch", () => {
  it("redraws the app's own strings (L74)", async () => {
    const reader = new Reader(fakeBridge());
    const g = globalThis as unknown as { document?: unknown };
    const hadDocument = "document" in g;
    if (!hadDocument) g.document = { documentElement: {} };
    try {
      expect(reader.t("aaron_blog_more")).toBe("加载更多");
      let listener: ((payload: { language: "en" | "zh" }) => void) | undefined;
      const client = {
        on: (_event: string, handler: typeof listener) => {
          listener = handler;
          return () => {};
        },
      } as unknown as BridgeClient;
      onLanguage(client, (language) => reader.setLanguage(language));
      listener?.({ language: "en" });
      expect(reader.t("aaron_blog_more")).toBe("Load more");
      expect(reader.sectionLabel.value).toBe("All Posts");
    } finally {
      if (!hadDocument) delete g.document;
    }
    expect(text("src/main.tsx")).toContain("onLanguage(client, (language) => reader.setLanguage(language))");
  });
});

// ---- Standalone: a page with no desk reads the invented demo: L228-306 ----

describe("standalone", () => {
  const origin = "https://example.test";
  const asked: string[] = [];
  const installWindow = (body: (url: string) => string | undefined) => {
    asked.length = 0;
    (globalThis as unknown as { window: unknown }).window = {
      location: {
        href: `${origin}/apps/tidal-letters/reader/index.html`,
        origin,
        pathname: "/apps/tidal-letters/reader/index.html",
      },
      fetch: async (input: string) => {
        const url = String(input);
        asked.push(url);
        const value = body(url);
        return {
          ok: value !== undefined,
          status: value === undefined ? 404 : 200,
          json: async () => JSON.parse(value ?? "{}"),
          clone() {
            return this;
          },
        };
      },
    };
  };
  const demoFiles = (url: string) => {
    const name = /\/demo\/(.+)$/.exec(url)?.[1];
    return name ? text(`demo/${name}`) : JSON.stringify({ note: "desk" });
  };
  const demoIndex = JSON.parse(text("demo/index.json")) as { posts: { title: string }[] };

  it("lists every sample post from the demo index, asking only demo/ beside the app root (L282-290)", async () => {
    installWindow(demoFiles);
    const reader = new Reader(fakeBridge({ standalone: true }));
    await reader.open();
    const body = reader.listBody.value;
    expect(body.kind).toBe("rows");
    const titles = body.kind === "rows" ? body.rows.map((row) => row.title) : [];
    expect(demoIndex.posts.length).toBeGreaterThan(0);
    for (const post of demoIndex.posts) expect(titles).toContain(post.title);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => url.startsWith(`${origin}/apps/tidal-letters/demo/`))).toBe(true);
    expect(asked.some((url) => url.endsWith("/demo/manifest.json"))).toBe(true);
    expect(asked.some((url) => url.endsWith("/demo/index.json"))).toBe(true);
  });

  it("refuses retrieve and rag the way the desk answers with no RAG index: 502 (L291-293, status only)", async () => {
    installWindow(demoFiles);
    const client = fakeBridge({ standalone: true });
    await expect(fetchPack({ client }, "retrieve" as PackKey)).rejects.toThrow("blog pack retrieve: 502");
    await expect(fetchPack({ client }, "rag")).rejects.toThrow("blog pack rag: 502");
    expect(asked).toEqual([]);
  });

  it("goes to the original URLs in a desk, untouched, and never asks for demo/ (L296-305)", async () => {
    installWindow(demoFiles);
    const client = fakeBridge({ standalone: false });
    await fetchPack({ client }, "manifest");
    await fetchPack({ client }, "index");
    await fetchPack({ client }, "chunk/2024" as PackKey);
    expect(asked).toEqual(["/api/aaron-blog/manifest", "/api/aaron-blog/index", "/api/aaron-blog/chunk/2024"]);
    expect(asked.some((url) => url.includes("demo/"))).toBe(false);
  });
});
