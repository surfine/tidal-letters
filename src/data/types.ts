// The shapes of the blog's published JSON pack (/api/aaron-blog/*) and of the
// reader's own state. Everything here arrives from the network or from state,
// so it is narrowed by guards before use (see guards.ts).

/** One post in the index. `longs` carry the same shape with kind "long". */
export interface Post {
  readonly id: string;
  readonly kind: "post" | "long";
  readonly date: string;
  readonly title: string;
  readonly minutes: number;
  readonly tags: readonly string[];
  readonly series?: string;
  /** Where a long read first ran, and what to call it. */
  readonly origin?: string;
  readonly source?: string;
  readonly diskUrl?: string;
  /** The post's path on aaronlau.me, for the footer's "on site" link. */
  readonly path?: string;
}

export interface Note {
  readonly id: string;
  readonly kind: "note";
  readonly date: string;
  readonly text: string;
  readonly link?: string;
  readonly host?: string;
}

export interface Tag {
  readonly slug: string;
  readonly name: string;
  readonly count: number;
}

export interface Series {
  readonly name: string;
  readonly count: number;
}

export interface BestGroup {
  readonly name: string;
  readonly postIds: readonly string[];
}

/** index.json: what the list pane draws before a post is opened. */
export interface IndexPack {
  readonly posts: readonly Post[];
  readonly notes: readonly Note[];
  readonly tags: readonly Tag[];
  readonly series: readonly Series[];
  readonly best: readonly BestGroup[];
  /** Long reads are openable (SideAsk cites them) without joining the lists. */
  readonly longs: readonly Post[];
}

/** manifest.json: the pack's identity, and whether an offline index exists. */
export interface PackManifest {
  readonly contentHash: string;
  readonly rag?: { readonly sha256?: string };
}

export interface SearchEntry {
  readonly id: string;
  readonly t?: string;
  readonly x?: string;
  readonly b?: string;
  readonly g?: readonly string[];
}

/** search.json: the flattened text of every post, for the search section. */
export interface SearchPack {
  readonly entries: readonly SearchEntry[];
}

/** chunk/<YYYY>.json and long.json: the sanitized HTML of each post. */
export interface ChunkPack {
  readonly posts: Readonly<Record<string, { readonly html: string }>>;
}

/** The list pane's filter: one year, one series or one tag. */
export interface Filter {
  readonly type: "year" | "series" | "tag";
  readonly value: string;
  readonly name: string;
}

/** What the reader keeps under the `ui` state key. */
export interface SavedUi {
  readonly section?: string;
  readonly filter?: Filter | null;
  readonly query?: string;
  readonly selectedId?: string | null;
  readonly selectedKind?: string;
  readonly scrollTop?: number;
}
