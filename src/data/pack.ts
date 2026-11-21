// The content door. The blog publishes a small JSON pack at /api/aaron-blog/;
// the reader caches every part of it in the bridge's state under `pack:<key>`,
// so a second visit reads no network at all. On its own page, with no desk
// behind it, a copy that ships a demo/ folder (packs beside reader/) is
// answered from it — that is the demo the repository serves.

import { readState, verifyAccess, writeState } from "../bridge/bridge.ts";
import type { BridgeClient } from "../bridge/types.ts";

const API = "/api/aaron-blog";
const DEMO_ROUTE = "/api/aaron-blog/";

/** The pack parts, by the name the server route knows them by. */
export type PackKey = "manifest" | "index" | "search" | "long" | "rag" | "ragSha256" | `chunk/${string}`;

type DemoTarget = { readonly file: string } | { readonly refuse: "pack" | "retrieve" | "missing" } | null;

function urlOf(input: string): URL | null {
  try {
    return new URL(input, window.location.href);
  } catch {
    return null;
  }
}

/**
 * On its own, with no desk behind it, the page has no /api/aaron-blog door. A
 * copy that ships a demo/ folder is answered from it: manifest, index, search,
 * long and chunk/<YYYY> map to the pack files the generator writes; rag and
 * retrieve are refused the way the desk's server answers when the RAG index is
 * missing. demo/ sits beside reader/, so it is found from the page's own
 * address. In a desk none of this runs and nothing under demo/ is ever asked.
 */
function demoTarget(input: string): DemoTarget {
  const url = urlOf(input);
  if (!url || url.origin !== window.location.origin) return null;
  if (!url.pathname.startsWith(DEMO_ROUTE)) return null;
  const key = url.pathname.slice(DEMO_ROUTE.length);
  if (key === "manifest" || key === "index" || key === "search" || key === "long") return { file: `${key}.json` };
  const chunk = /^chunk\/(\d{4})$/.exec(key);
  if (chunk?.[1]) return { file: `posts/${chunk[1]}.json` };
  if (key === "rag") return { refuse: "pack" };
  if (key === "retrieve") return { refuse: "retrieve" };
  return { refuse: "missing" };
}

/** The bodies the desk's route sends when the RAG index cannot be loaded, or a path is unknown. */
function demoRefuse(kind: "pack" | "retrieve" | "missing"): Response {
  if (kind === "retrieve") {
    return new Response(JSON.stringify({ error: "blog_index_unavailable", detail: "blog rag index unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (kind === "pack") {
    return new Response(JSON.stringify({ error: "blog_unavailable", detail: "blog rag index unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

function sameOriginApi(input: string): boolean {
  const url = urlOf(input);
  return Boolean(url && url.origin === window.location.origin && url.pathname.startsWith("/api/"));
}

/** In-memory copy of the pack, so a read costs one bridge call per key per page. */
const FILE_CACHE = new Map<string, unknown>();

export interface PackSource {
  readonly client: BridgeClient;
}

/** One pack part from state, without a network call: null when it was never written. */
export async function cached(source: PackSource, key: PackKey): Promise<unknown> {
  if (FILE_CACHE.has(key)) return FILE_CACHE.get(key);
  const value = await readState(source.client, `pack:${key}`);
  if (value !== null && value !== undefined) FILE_CACHE.set(key, value);
  return value ?? null;
}

/** Keeps a pack part in memory and in the bridge's state under `pack:<key>`. */
export async function cache(source: PackSource, key: PackKey, value: unknown): Promise<void> {
  FILE_CACHE.set(key, value);
  await writeState(source.client, `pack:${key}`, value);
}

/** One fetch of the pack, answered from the cache unless `force`. */
export async function fetchPack(source: PackSource, key: PackKey, { force = false } = {}): Promise<unknown> {
  if (!force) {
    const hit = await cached(source, key);
    if (hit) return hit;
  }
  const target = `${API}/${key}`;
  let response: Response;
  if (source.client.standalone) {
    const demo = demoTarget(target);
    if (demo && "file" in demo) {
      response = await window.fetch(new URL(`../demo/${demo.file}`, window.location.href).href);
    } else if (demo && "refuse" in demo) {
      response = demoRefuse(demo.refuse);
    } else {
      response = await window.fetch(target, { headers: { Accept: "application/json" } });
    }
  } else {
    response = await window.fetch(target, { headers: { Accept: "application/json" } });
    if (response.status === 401 && sameOriginApi(target)) {
      const payload: unknown = await response
        .clone()
        .json()
        .catch(() => ({}));
      const code = typeof payload === "object" && payload !== null && "code" in payload ? payload.code : null;
      if (code === "verification_required" && (await verifyAccess(source.client))) {
        response = await window.fetch(target, { headers: { Accept: "application/json" } });
      }
    }
  }
  if (!response.ok) throw new Error(`blog pack ${key}: ${response.status}`);
  const value: unknown = await response.json();
  await cache(source, key, value);
  return value;
}

/**
 * A new content hash means every chunk, the long-read pack and the search
 * index describe the old posts. Their state entries and the memory copies go;
 * the keys themselves keep their names and the next read fetches them again.
 */
export async function forgetContent(source: PackSource): Promise<void> {
  FILE_CACHE.clear();
  const stale = new Set(["pack:long", "pack:search"]);
  try {
    const { keys } = await source.client.call("state.keys", { prefix: "pack:" });
    for (const key of keys) {
      if (key.startsWith("pack:chunk/")) stale.add(key);
    }
  } catch {
    // Without the list the memory copy is still dropped, and the keys the
    // reader knows by name go with it.
  }
  await Promise.all(
    [...stale].map(async (key) => {
      try {
        await source.client.call("state.remove", { key });
      } catch {
        // A key that is already gone is what was wanted.
      }
    }),
  );
}
