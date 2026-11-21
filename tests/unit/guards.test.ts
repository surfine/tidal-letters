// The guards stand between the network (or the state store) and the reader.
// What they must do: accept the pack the blog publishes, and turn anything
// else into a shape the reader can draw without throwing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asChunk,
  asIndex,
  asManifest,
  asNote,
  asPost,
  asSavedUi,
  asSearch,
  chunkHtml,
  isRecord,
} from "../../src/data/guards.ts";

const demo = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "demo", name), "utf8"));

describe("asIndex", () => {
  it("accepts the demo index and keeps every post", () => {
    const index = asIndex(demo("index.json"));
    expect(index?.posts).toHaveLength(10);
    expect(index?.notes).toHaveLength(2);
    expect(index?.tags).toHaveLength(3);
    expect(index?.best[0]?.postIds).toHaveLength(3);
  });

  it("refuses what is not an index, so the list draws its loading state", () => {
    expect(asIndex(null)).toBeNull();
    expect(asIndex("posts")).toBeNull();
    expect(asIndex({})).toBeNull();
    expect(asIndex({ posts: "not an array" })).toBeNull();
  });

  it("drops items that cannot be drawn and keeps the rest", () => {
    const index = asIndex({
      posts: [{ id: "a", date: "2026-01-01", title: "A", minutes: 1, tags: ["x"] }, { title: "no id" }, null],
      notes: [{ id: "n", text: "note" }, {}],
      tags: [{ slug: "x", name: "x", count: 2 }, { slug: "" }],
      longs: [{ id: "long", kind: "long", date: "2020-01-01", title: "Long", minutes: 9 }],
    });
    expect(index?.posts.map((post) => post.id)).toEqual(["a"]);
    expect(index?.notes.map((note) => note.id)).toEqual(["n"]);
    expect(index?.tags.map((tag) => tag.slug)).toEqual(["x"]);
    expect(index?.longs.map((post) => post.id)).toEqual(["long"]);
  });

  it("reads an empty index as an empty one, not as a broken pack", () => {
    const index = asIndex({ posts: [] });
    expect(index).toEqual({ posts: [], notes: [], tags: [], series: [], best: [], longs: [] });
  });
});

describe("asPost and asNote", () => {
  it("keeps the optional fields a long read names", () => {
    expect(
      asPost({
        id: "p",
        kind: "long",
        origin: "https://x.test/a",
        source: "Site",
        diskUrl: "https://d.test",
        path: "/p",
        series: "S",
      }),
    ).toEqual({
      id: "p",
      kind: "long",
      date: "",
      title: "",
      minutes: 0,
      tags: [],
      series: "S",
      origin: "https://x.test/a",
      source: "Site",
      diskUrl: "https://d.test",
      path: "/p",
    });
  });

  it("leaves optional fields out when the pack has none", () => {
    expect(asPost({ id: "p" })).toEqual({ id: "p", kind: "post", date: "", title: "", minutes: 0, tags: [] });
    expect(asNote({ id: "n", text: "t" })).toEqual({ id: "n", kind: "note", date: "", text: "t" });
  });

  it("refuses a post or note with no id", () => {
    expect(asPost({ title: "x" })).toBeNull();
    expect(asNote({ text: "x" })).toBeNull();
    expect(asPost("post")).toBeNull();
  });
});

describe("asManifest and asSearch", () => {
  it("reads the content hash and the RAG hash", () => {
    expect(asManifest({ contentHash: "abc", rag: { sha256: "def" } })).toEqual({
      contentHash: "abc",
      rag: { sha256: "def" },
    });
    expect(asManifest({ contentHash: "abc" })).toEqual({ contentHash: "abc" });
  });

  it("refuses a manifest with no content hash", () => {
    expect(asManifest({})).toBeNull();
    expect(asManifest(null)).toBeNull();
  });

  it("turns a pack that is not a search index into an empty one", () => {
    expect(asSearch(null)).toEqual({ entries: [] });
    expect(asSearch({ entries: "no" })).toEqual({ entries: [] });
    expect(asSearch({ entries: [{ id: "a", t: "t" }, {}, { t: "no id" }] })).toEqual({
      entries: [{ id: "a", t: "t" }],
    });
  });
});

describe("asChunk and chunkHtml", () => {
  it("keeps the HTML of each post", () => {
    const chunk = asChunk({ posts: { a: { html: "<p>a</p>" }, b: { html: 3 } } });
    expect(chunkHtml(chunk, "a")).toBe("<p>a</p>");
    expect(chunkHtml(chunk, "b")).toBe("");
  });

  it("is empty for a chunk that did not arrive", () => {
    expect(chunkHtml(null, "a")).toBe("");
    expect(chunkHtml(asChunk({}), "a")).toBe("");
  });
});

describe("asSavedUi", () => {
  it("reads what the reader wrote", () => {
    // An empty query and a null filter are the same as none: the reader reads
    // both back as "" and null.
    expect(
      asSavedUi({ section: "all", filter: null, query: "", selectedId: "p", selectedKind: "post", scrollTop: 120 }),
    ).toEqual({
      section: "all",
      selectedId: "p",
      selectedKind: "post",
      scrollTop: 120,
    });
    expect(asSavedUi({ query: "tides" })).toEqual({ query: "tides" });
  });

  it("keeps a real filter and drops a broken one", () => {
    expect(asSavedUi({ filter: { type: "tag", value: "letters", name: "letters" } })).toEqual({
      filter: { type: "tag", value: "letters", name: "letters" },
    });
    expect(asSavedUi({ filter: { type: "what", value: "x" } })).toEqual({});
    expect(asSavedUi({ filter: { type: "tag" } })).toEqual({});
  });

  it("is null for nothing saved", () => {
    expect(asSavedUi(null)).toBeNull();
    expect(asSavedUi("ui")).toBeNull();
  });
});

describe("isRecord", () => {
  it("is true for objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});
