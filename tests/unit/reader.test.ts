// The reader's own behaviour against a stand-in host: what it saves, what it
// shows, and what it re-reads. These run the real Reader class, not a copy of
// its logic.

import { beforeEach, describe, expect, it } from "vitest";
import { Reader } from "../../src/reader/reader.ts";
import { fakeBridge, fakePage } from "./fake-bridge.ts";

const index = {
  posts: [
    { id: "p1", kind: "post", date: "2026-01-02", title: "First", minutes: 2, tags: ["tides"] },
    { id: "p2", kind: "post", date: "2024-03-04", title: "Second", minutes: 3, tags: ["letters"], series: "Thread" },
  ],
  notes: [{ id: "n1", kind: "note", date: "2025-05-06", text: "A note" }],
  tags: [
    { slug: "tides", name: "tides", count: 1 },
    { slug: "letters", name: "letters", count: 1 },
  ],
  series: [{ name: "Thread", count: 1 }],
  best: [{ name: "Picks", postIds: ["p2"] }],
  longs: [],
};

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition never held");
};

const pages = () =>
  fakePage({
    manifest: { contentHash: "hash-a" },
    index,
    "chunk/2026": { posts: { p1: { html: "<p>first body</p>" } } },
    "chunk/2024": { posts: { p2: { html: "<p>second body</p>" } } },
    search: { entries: [{ id: "p1", t: "First", b: "first body tides" }] },
  });

describe("the reader", () => {
  beforeEach(() => {
    pages().setWindow();
  });

  it("fills the list from the pack and opens a post", async () => {
    const reader = new Reader(fakeBridge());
    await reader.sync();
    expect(reader.listBody.value.kind).toBe("rows");
    expect(reader.itemCount.value).toBe(2);
    await reader.openPost("p1");
    expect(reader.article.value).toMatchObject({ kind: "post", html: "<p>first body</p>" });
    expect(reader.windowTitle.value).toBe("First");
  });

  it("filters by tag and by year", async () => {
    const reader = new Reader(fakeBridge());
    await reader.sync();
    reader.setFilter("tag", "tides", "tides");
    expect(reader.filteredPosts.value.map((post) => post.id)).toEqual(["p1"]);
    expect(reader.sectionLabel.value).toBe("#tides");
    reader.setFilter("year", "2024");
    expect(reader.filteredPosts.value.map((post) => post.id)).toEqual(["p2"]);
    reader.clearFilter();
    expect(reader.sectionLabel.value).toBe("全部推送");
  });

  it("asks for a phrase on entering Search, then finds the match", async () => {
    const reader = new Reader(fakeBridge());
    await reader.sync();
    reader.setSection("search");
    expect(reader.listBody.value).toEqual({
      kind: "message",
      title: "aaron_blog_search",
      detail: "aaron_blog_search_hint",
    });
    await waitFor(() => reader.searchEntries.value !== null);
    reader.typeQuery("tides");
    expect(reader.section.value).toBe("search");
    expect(reader.searchResult.value.total).toBe(1);
    expect(reader.listBody.value).toMatchObject({ kind: "rows" });
  });

  it("saves the selection and comes back to it", async () => {
    const state = new Map<string, unknown>();
    const page = pages();
    page.setWindow();
    const client = fakeBridge({ state });
    const first = new Reader(client);
    await first.sync();
    await first.openPost("p2");
    await first.dispose();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(state.get("ui")).toMatchObject({ selectedId: "p2", section: "all" });

    const again = new Reader(client);
    await again.start();
    await again.sync();
    await again.open();
    expect(again.selectedId.value).toBe("p2");
    expect(again.selectedKind.value).toBe("post");
  });

  it("re-reads every chunk after the blog publishes a new content hash", async () => {
    const page = pages();
    page.setWindow();
    const reader = new Reader(fakeBridge());
    await reader.sync();
    await reader.openPost("p1");
    expect(reader.article.value).toMatchObject({ html: "<p>first body</p>" });

    // The blog republishes: same ids, new text, new content hash.
    page.pages.set("manifest", { contentHash: "hash-b" });
    page.pages.set("chunk/2026", { posts: { p1: { html: "<p>revised body</p>" } } });
    await reader.sync(true);
    await reader.openPost("p1");
    expect(reader.article.value).toMatchObject({ html: "<p>revised body</p>" });
  });

  it("keeps the downloaded posts when a refresh finds the same content hash", async () => {
    const page = pages();
    page.setWindow();
    const reader = new Reader(fakeBridge());
    await reader.sync();
    await reader.openPost("p1");
    expect(reader.article.value).toMatchObject({ html: "<p>first body</p>" });

    // The writer presses Refresh; the blog has not changed. Then the pack goes away.
    await reader.sync(true);
    page.pages.delete("chunk/2026");
    await reader.openPost("p1");
    expect(reader.article.value).toMatchObject({ html: "<p>first body</p>" });
  });

  it("answers a reveal intent by opening the post and marking the paragraph", async () => {
    const reader = new Reader(fakeBridge());
    await reader.sync();
    const answer = await reader.handleIntent({ intent: "reveal", options: { postId: "p2", para: 0, quote: "second" } });
    expect(answer).toEqual({ ok: true });
    expect(reader.selectedId.value).toBe("p2");
    expect(reader.cited.value).toEqual({ para: 0, quote: "second" });
  });

  it("refuses an intent it does not know", async () => {
    const reader = new Reader(fakeBridge());
    expect(await reader.handleIntent({ intent: "print" })).toEqual({ ok: false, reason: "unsupported-intent" });
  });

  it("answers the manifest's menu commands", async () => {
    const reader = new Reader(fakeBridge());
    await reader.sync();
    expect(await reader.runMenuCommand("blog-section-tags")).toBe(true);
    expect(reader.section.value).toBe("tags");
    expect(await reader.runMenuCommand("blog-back")).toBe(true);
    expect(reader.view.value).toBe("list");
    expect(await reader.runMenuCommand("blog-print")).toBe(false);
  });
});
