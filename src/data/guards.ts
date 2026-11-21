// Type guards for everything that arrives from outside this module: the pack
// the server answers and the reader's own saved state. Each one returns null
// (or a list) rather than throwing, so a broken pack degrades the way the
// reader always did: an empty list, not a blank page.

import type {
  BestGroup,
  ChunkPack,
  Filter,
  IndexPack,
  Note,
  PackManifest,
  Post,
  SavedUi,
  SearchEntry,
  SearchPack,
  Series,
  Tag,
} from "./types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function optional(value: unknown, key: string): Record<string, string> {
  return typeof value === "string" && value !== "" ? { [key]: value } : {};
}

/** One post (or long read). Null when it names no id, which no list can draw. */
export function asPost(value: unknown): Post | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  return {
    id,
    kind: value.kind === "long" ? "long" : "post",
    date: text(value.date),
    title: text(value.title),
    minutes: count(value.minutes),
    tags: texts(value.tags),
    ...optional(value.series, "series"),
    ...optional(value.origin, "origin"),
    ...optional(value.source, "source"),
    ...optional(value.diskUrl, "diskUrl"),
    ...optional(value.path, "path"),
  };
}

export function asNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  return {
    id,
    kind: "note",
    date: text(value.date),
    text: text(value.text),
    ...optional(value.link, "link"),
    ...optional(value.host, "host"),
  };
}

function asTag(value: unknown): Tag | null {
  if (!isRecord(value)) return null;
  const slug = text(value.slug);
  const name = text(value.name);
  if (!slug || !name) return null;
  return { slug, name, count: count(value.count) };
}

function asSeries(value: unknown): Series | null {
  if (!isRecord(value)) return null;
  const name = text(value.name);
  if (!name) return null;
  return { name, count: count(value.count) };
}

function asBestGroup(value: unknown): BestGroup | null {
  if (!isRecord(value)) return null;
  const name = text(value.name);
  return { name, postIds: texts(value.postIds) };
}

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

/** index.json. Null when it is not an index at all: the reader draws the loading state then. */
export function asIndex(value: unknown): IndexPack | null {
  if (!isRecord(value) || !Array.isArray(value.posts)) return null;
  return {
    posts: compact(value.posts.map(asPost)),
    notes: compact(records(value.notes).map(asNote)),
    tags: compact(records(value.tags).map(asTag)),
    series: compact(records(value.series).map(asSeries)),
    best: compact(records(value.best).map(asBestGroup)),
    longs: compact(records(value.longs).map(asPost)),
  };
}

export function asManifest(value: unknown): PackManifest | null {
  if (!isRecord(value)) return null;
  const contentHash = text(value.contentHash);
  if (!contentHash) return null;
  const rag = isRecord(value.rag) ? { sha256: text(value.rag.sha256) } : undefined;
  return rag ? { contentHash, rag } : { contentHash };
}

function asSearchEntry(value: unknown): SearchEntry | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  return {
    id,
    ...optional(value.t, "t"),
    ...optional(value.x, "x"),
    ...optional(value.b, "b"),
    ...(Array.isArray(value.g) ? { g: texts(value.g) } : {}),
  };
}

/** search.json. A pack that is not one is an empty index, as it was before. */
export function asSearch(value: unknown): SearchPack {
  if (!isRecord(value) || !Array.isArray(value.entries)) return { entries: [] };
  return { entries: compact(value.entries.map(asSearchEntry)) };
}

/** chunk/<YYYY>.json and long.json. */
export function asChunk(value: unknown): ChunkPack | null {
  if (!isRecord(value) || !isRecord(value.posts)) return null;
  const posts: Record<string, { html: string }> = {};
  for (const [id, post] of Object.entries(value.posts)) {
    if (isRecord(post) && typeof post.html === "string") posts[id] = { html: post.html };
  }
  return { posts };
}

/** The HTML of one post inside a chunk, or "" when the chunk does not carry it. */
export function chunkHtml(chunk: ChunkPack | null, id: string): string {
  return chunk?.posts[id]?.html ?? "";
}

function asFilter(value: unknown): Filter | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const filterValue = text(value.value);
  if ((type !== "year" && type !== "series" && type !== "tag") || !filterValue) return null;
  return { type, value: filterValue, name: text(value.name) || filterValue };
}

/** The `ui` state key: what the last visit was looking at. */
export function asSavedUi(value: unknown): SavedUi | null {
  if (!isRecord(value)) return null;
  const filter = asFilter(value.filter);
  return {
    ...optional(value.section, "section"),
    ...(filter ? { filter } : {}),
    ...optional(value.query, "query"),
    ...optional(value.selectedId, "selectedId"),
    ...optional(value.selectedKind, "selectedKind"),
    ...(typeof value.scrollTop === "number" && Number.isFinite(value.scrollTop) ? { scrollTop: value.scrollTop } : {}),
  };
}
