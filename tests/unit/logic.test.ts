// The reader against the real demo pack and against an empty one: the list
// pane's body for every section, the filter, the search and the status
// line's count. The demo/ files are the pack the repository serves on its
// own page, so the input is the one a reader meets.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { IndexPack, SearchPack } from "../../src/data/types.ts";
import {
  filterLabel,
  itemCount,
  type ListInput,
  listBody,
  postsForFilter,
  searchRows,
  yearCounts,
} from "../../src/reader/logic.ts";

const demo = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "demo", name), "utf8"));
const index: IndexPack = demo("index.json");
const search: SearchPack = demo("search.json");
const noteLabel = "笔记";

const postsById = new Map([...index.posts, ...index.longs].map((post) => [post.id, post]));
const notesById = new Map(index.notes.map((note) => [note.id, note]));

const input = (overrides: Partial<ListInput> = {}): ListInput => {
  const query = overrides.query ?? "";
  const entries = overrides.searchReady === false ? [] : search.entries;
  return {
    index,
    section: "all",
    filter: null,
    query,
    limit: 80,
    online: true,
    posts: postsForFilter(index.posts, overrides.filter ?? null),
    search: searchRows(entries, postsById, notesById, query, noteLabel),
    searchReady: true,
    notesById,
    noteLabel,
    ...overrides,
  };
};

describe("postsForFilter", () => {
  it("is every post when nothing filters", () => {
    expect(postsForFilter(index.posts, null)).toHaveLength(10);
  });

  it("keeps one year", () => {
    const posts = postsForFilter(index.posts, { type: "year", value: "2022", name: "2022" });
    expect(posts.map((post) => post.id)).toEqual(["demo-search", "demo-tides", "demo-list"]);
  });

  it("keeps one series", () => {
    const posts = postsForFilter(index.posts, { type: "series", value: "Opening the demo", name: "Opening the demo" });
    expect(posts).toHaveLength(3);
  });

  it("keeps one tag by its name", () => {
    const posts = postsForFilter(index.posts, { type: "tag", value: "tides", name: "tides" });
    expect(posts.map((post) => post.id)).toEqual(["demo-paper", "demo-scroll", "demo-tags", "demo-tides"]);
  });

  it("is empty for a filter nothing matches", () => {
    expect(postsForFilter(index.posts, { type: "tag", value: "nope", name: "nope" })).toEqual([]);
  });
});

describe("filterLabel", () => {
  it("names the filter on screen", () => {
    expect(filterLabel(null)).toBe("");
    expect(filterLabel({ type: "tag", value: "letters", name: "letters" })).toBe("#letters");
    expect(filterLabel({ type: "year", value: "2026", name: "2026" })).toBe("2026");
    expect(filterLabel({ type: "series", value: "Opening the demo", name: "Opening the demo" })).toBe(
      "Opening the demo",
    );
  });
});

describe("yearCounts", () => {
  it("lists the years newest first with their post counts", () => {
    expect(yearCounts(index.posts)).toEqual([
      ["2026", 4],
      ["2024", 3],
      ["2022", 3],
    ]);
  });

  it("has no years for no posts", () => {
    expect(yearCounts([])).toEqual([]);
  });
});

describe("searchRows", () => {
  it("finds the demo posts that mention the tide", () => {
    const result = searchRows(search.entries, postsById, notesById, "tides", noteLabel);
    expect(result.total).toBeGreaterThan(0);
    expect(result.rows.map((row) => row.id)).toContain("demo-paper");
  });

  it("finds nothing for an empty query", () => {
    expect(searchRows(search.entries, postsById, notesById, "   ", noteLabel)).toEqual({ rows: [], total: 0 });
  });

  it("finds nothing in an empty index", () => {
    expect(searchRows([], postsById, notesById, "tides", noteLabel)).toEqual({ rows: [], total: 0 });
  });

  it("ignores entries whose post is not in the index", () => {
    const result = searchRows([{ id: "ghost", t: "tides tides" }], postsById, notesById, "tides", noteLabel);
    expect(result).toEqual({ rows: [], total: 0 });
  });
});

describe("listBody", () => {
  it("is the loading state before the index arrives", () => {
    expect(listBody(input({ index: null })).kind).toBe("loading");
  });

  it("draws the tag names", () => {
    const body = listBody(input({ section: "tags" }));
    expect(body).toMatchObject({ kind: "tags" });
    if (body.kind === "tags") expect(body.tags.map((tag) => tag.name)).toEqual(["letters", "reader", "tides"]);
  });

  it("draws the archive years", () => {
    const body = listBody(input({ section: "archive" }));
    expect(body).toMatchObject({ kind: "years" });
  });

  it("draws the threads", () => {
    const body = listBody(input({ section: "threads" }));
    expect(body).toMatchObject({ kind: "series" });
    if (body.kind === "series") expect(body.series[0]?.name).toBe("Opening the demo");
  });

  it("draws the best groups with their posts", () => {
    const body = listBody(input({ section: "best" }));
    expect(body).toMatchObject({ kind: "groups" });
    if (body.kind === "groups")
      expect(body.groups[0]?.rows.map((row) => row.id)).toEqual(["demo-formats", "demo-scroll", "demo-list"]);
  });

  it("draws the notes with the note label as their tag line", () => {
    const body = listBody(input({ section: "notes" }));
    expect(body).toMatchObject({ kind: "rows", more: false });
    if (body.kind === "rows") {
      expect(body.rows).toHaveLength(2);
      expect(body.rows[0]?.tags).toBe(noteLabel);
    }
  });

  it("draws nothing but a message for an empty index", () => {
    const empty: IndexPack = { posts: [], notes: [], tags: [], series: [], best: [], longs: [] };
    const body = listBody(input({ index: empty, posts: [], section: "all" }));
    expect(body).toEqual({ kind: "message", title: "aaron_blog_empty", detail: null });
    expect(listBody(input({ index: empty, posts: [], section: "notes" }))).toEqual({
      kind: "message",
      title: "aaron_blog_empty",
      detail: null,
    });
    expect(listBody(input({ index: empty, posts: [], section: "best" }))).toEqual({ kind: "groups", groups: [] });
    expect(listBody(input({ index: empty, posts: [], section: "tags" }))).toEqual({ kind: "tags", tags: [] });
  });

  it("says offline when the list is empty and the blog is unreachable", () => {
    const empty: IndexPack = { posts: [], notes: [], tags: [], series: [], best: [], longs: [] };
    expect(listBody(input({ index: empty, posts: [], online: false, section: "all" }))).toEqual({
      kind: "message",
      title: "aaron_blog_empty",
      detail: "aaron_blog_offline_hint",
    });
  });

  it("says searching until the search pack is read", () => {
    expect(listBody(input({ section: "search", query: "tides", searchReady: false }))).toEqual({ kind: "searching" });
  });

  it("asks for a phrase before searching", () => {
    expect(listBody(input({ section: "search", query: "  " }))).toEqual({
      kind: "message",
      title: "aaron_blog_search",
      detail: "aaron_blog_search_hint",
    });
  });

  it("draws the matches and offers no more when they all fit", () => {
    const body = listBody(input({ section: "search", query: "tides" }));
    expect(body).toMatchObject({ kind: "rows", more: false });
    if (body.kind === "rows") expect(body.rows.length).toBeGreaterThan(0);
  });

  it("says no results for a phrase nothing matches", () => {
    expect(listBody(input({ section: "search", query: "zzzz" }))).toEqual({
      kind: "message",
      title: "aaron_blog_no_results",
      detail: "aaron_blog_search_hint",
    });
  });

  it("offers more when the limit hides rows", () => {
    const body = listBody(input({ limit: 3 }));
    expect(body).toMatchObject({ kind: "rows", more: true });
    if (body.kind === "rows") expect(body.rows).toHaveLength(3);
  });
});

describe("itemCount", () => {
  const count = (
    section: Parameters<typeof itemCount>[0]["section"],
    overrides: Partial<Parameters<typeof itemCount>[0]> = {},
  ) =>
    itemCount({
      index,
      section,
      filter: null,
      posts: postsForFilter(index.posts, null),
      searchTotal: 4,
      ...overrides,
    });

  it("counts what each section lists", () => {
    expect(count("all")).toBe(10);
    expect(count("notes")).toBe(2);
    expect(count("tags")).toBe(3);
    expect(count("archive")).toBe(3);
    expect(count("threads")).toBe(1);
    expect(count("best")).toBe(3);
    expect(count("search")).toBe(4);
  });

  it("counts the filtered posts when one is chosen", () => {
    const filter = { type: "tag", value: "tides", name: "tides" } as const;
    expect(count("all", { filter, posts: postsForFilter(index.posts, filter) })).toBe(4);
  });

  it("is zero with no index", () => {
    expect(count("all", { index: null, posts: [] })).toBe(0);
  });
});
