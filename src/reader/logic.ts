// The reader's pure logic: what the list pane shows for a section, a filter
// and a query, and what the status line counts. No DOM, no bridge, so every
// branch can be run in a unit test with a real index and with an empty one.

import type { Filter, IndexPack, Note, Post, SearchEntry, Series, Tag } from "../data/types.ts";
import type { StringKey } from "../strings/index.ts";

export type Section = "best" | "all" | "notes" | "tags" | "archive" | "threads" | "search";

/** The rail's sections, in the order it draws them. */
export const SECTIONS: readonly Section[] = ["best", "all", "notes", "tags", "archive", "threads", "search"];

export const SECTION_KEYS: Record<Section, StringKey> = {
  best: "aaron_blog_best",
  all: "aaron_blog_all",
  notes: "aaron_blog_notes",
  tags: "aaron_blog_tags",
  archive: "aaron_blog_archive",
  threads: "aaron_blog_threads",
  search: "aaron_blog_search",
};

/** One row of the list pane, post or note, already in drawing order. */
export interface Row {
  readonly id: string;
  readonly kind: "post" | "note";
  readonly date: string;
  readonly title: string;
  readonly tags: string;
}

/** What the list pane holds: one of these per render. */
export type ListBody =
  | { readonly kind: "loading" }
  | { readonly kind: "searching" }
  | { readonly kind: "message"; readonly title: StringKey; readonly detail: StringKey | null }
  | { readonly kind: "rows"; readonly rows: readonly Row[]; readonly more: boolean }
  | { readonly kind: "groups"; readonly groups: readonly { readonly name: string; readonly rows: readonly Row[] }[] }
  | { readonly kind: "tags"; readonly tags: readonly Tag[] }
  | { readonly kind: "years"; readonly years: readonly (readonly [string, number])[] }
  | { readonly kind: "series"; readonly series: readonly Series[] };

export interface SearchResult {
  readonly rows: readonly Row[];
  readonly total: number;
}

/** The posts one filter selects; no filter means all of them. */
export function postsForFilter(posts: readonly Post[], filter: Filter | null): readonly Post[] {
  if (!filter) return posts;
  if (filter.type === "year") return posts.filter((post) => post.date.startsWith(`${filter.value}-`));
  if (filter.type === "series") return posts.filter((post) => post.series === filter.value);
  if (filter.type === "tag") return posts.filter((post) => post.tags.includes(filter.name));
  return posts;
}

/** The one-line name of the active filter. */
export function filterLabel(filter: Filter | null): string {
  if (!filter) return "";
  if (filter.type === "tag") return `#${filter.name}`;
  return filter.value;
}

export function postRow(post: Post): Row {
  return {
    id: post.id,
    kind: "post",
    date: post.date,
    title: post.title,
    tags: post.tags.map((tag) => `#${tag}`).join(" "),
  };
}

export function noteRow(note: Note, noteLabel: string): Row {
  return { id: note.id, kind: "note", date: note.date, title: note.text, tags: noteLabel };
}

/** The years the archive lists, newest first, with how many posts each holds. */
export function yearCounts(posts: readonly Post[]): (readonly [string, number])[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/** The search pack's flattened text, matched against the query. */
export function searchRows(
  entries: readonly SearchEntry[],
  postsById: ReadonlyMap<string, Post>,
  notesById: ReadonlyMap<string, Note>,
  query: string,
  noteLabel: string,
): SearchResult {
  const needle = query.trim().toLowerCase();
  if (!needle) return { rows: [], total: 0 };
  const rows: Row[] = [];
  let total = 0;
  for (const entry of entries) {
    const post = postsById.get(entry.id);
    const note = notesById.get(entry.id);
    if (!post && !note) continue;
    const haystack = [entry.t ?? "", entry.x ?? "", entry.b ?? "", ...(entry.g ?? [])].join(" ").toLowerCase();
    if (!haystack.includes(needle)) continue;
    total += 1;
    rows.push(post ? postRow(post) : noteRow(note as Note, noteLabel));
  }
  return { rows, total };
}

export interface ListInput {
  readonly index: IndexPack | null;
  readonly section: Section;
  readonly filter: Filter | null;
  readonly query: string;
  readonly limit: number;
  readonly online: boolean;
  readonly posts: readonly Post[];
  readonly search: SearchResult;
  /** False until the search pack has been read, which is the only time the list says "Searching…". */
  readonly searchReady: boolean;
  readonly notesById: ReadonlyMap<string, Note>;
  readonly noteLabel: string;
}

/** What the list pane draws: loading, an option list, rows, or one message. */
export function listBody(input: ListInput): ListBody {
  const index = input.index;
  if (!index) return { kind: "loading" };
  const { section, filter } = input;
  if (section === "search" && input.query.trim() && !input.searchReady) return { kind: "searching" };
  if (section === "tags" && !filter) return { kind: "tags", tags: index.tags };
  if (section === "archive" && !filter) return { kind: "years", years: yearCounts(index.posts) };
  if (section === "threads" && !filter) return { kind: "series", series: index.series };
  if (section === "best") {
    return {
      kind: "groups",
      groups: index.best.map((group) => ({
        name: group.name,
        rows: group.postIds
          .map((id) => index.longs.find((post) => post.id === id) ?? index.posts.find((post) => post.id === id))
          .filter((post): post is Post => Boolean(post))
          .map(postRow),
      })),
    };
  }
  if (section === "notes") {
    const rows = index.notes.map((note) => noteRow(note, input.noteLabel));
    if (rows.length === 0) return { kind: "message", title: "aaron_blog_empty", detail: null };
    return { kind: "rows", rows, more: false };
  }
  if (section === "search") {
    if (!input.query.trim()) return { kind: "message", title: "aaron_blog_search", detail: "aaron_blog_search_hint" };
    const rows = input.search.rows.slice(0, input.limit);
    if (rows.length === 0) return { kind: "message", title: "aaron_blog_no_results", detail: "aaron_blog_search_hint" };
    return { kind: "rows", rows, more: input.limit < input.search.total };
  }
  const visible = input.posts.slice(0, input.limit);
  if (visible.length === 0) {
    return { kind: "message", title: "aaron_blog_empty", detail: input.online ? null : "aaron_blog_offline_hint" };
  }
  return { kind: "rows", rows: visible.map(postRow), more: input.limit < input.posts.length };
}

export interface CountInput {
  readonly index: IndexPack | null;
  readonly section: Section;
  readonly filter: Filter | null;
  readonly posts: readonly Post[];
  readonly searchTotal: number;
}

/** What the status line's count says: the number of things this section lists. */
export function itemCount(input: CountInput): number {
  const index = input.index;
  if (!index) return 0;
  if (input.section === "notes") return index.notes.length;
  if (input.section === "tags" && !input.filter) return index.tags.length;
  if (input.section === "archive" && !input.filter)
    return new Set(index.posts.map((post) => post.date.slice(0, 4))).size;
  if (input.section === "threads" && !input.filter) return index.series.length;
  if (input.section === "best") return index.best.reduce((sum, group) => sum + group.postIds.length, 0);
  if (input.section === "search") return input.searchTotal;
  return input.posts.length;
}
