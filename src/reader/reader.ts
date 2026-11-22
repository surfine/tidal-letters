// The reader's state and its work: the pack, the list, the article, the saved
// selection and the hand-overs to the desk. The UI components read signals
// from here; nothing in this file touches a DOM node except the two the page
// itself creates (the search field and the article) through the refs below.

import { computed, effect, signal } from "@preact/signals";
import { askAssistant, pushMenuState, readState, writeState } from "../bridge/bridge.ts";
import type { AskSource, BridgeClient, SuspendCause } from "../bridge/types.ts";
import { asChunk, asIndex, asManifest, asSavedUi, asSearch, chunkHtml, isRecord } from "../data/guards.ts";
import { cache, cached, fetchPack, forgetContent } from "../data/pack.ts";
import type { ChunkPack, Filter, IndexPack, Note, PackManifest, Post, SavedUi, SearchEntry } from "../data/types.ts";
import { htmlLang, type Language, type StringKey, translate } from "../strings/index.ts";
import { markCited } from "./cite.ts";
import {
  filterLabel,
  itemCount,
  type ListBody,
  listBody,
  postsForFilter,
  SECTION_KEYS,
  SECTIONS,
  type SearchResult,
  type Section,
  searchRows,
} from "./logic.ts";

const PAGE_SIZE = 80;
const UI_STATE_KEY = "ui";
const MENU_COMMANDS = [
  "blog-sync",
  "blog-search",
  "blog-back",
  "blog-section-best",
  "blog-section-all",
  "blog-section-notes",
  "blog-section-tags",
  "blog-section-archive",
  "blog-section-threads",
] as const;

const MENU_SECTIONS: Record<string, Section> = {
  "blog-section-best": "best",
  "blog-section-all": "all",
  "blog-section-notes": "notes",
  "blog-section-tags": "tags",
  "blog-section-archive": "archive",
  "blog-section-threads": "threads",
};

/** What the article pane is showing. */
export type ArticleView =
  | { readonly kind: "empty" }
  | { readonly kind: "loading"; readonly post: Post }
  | { readonly kind: "post"; readonly post: Post; readonly html: string; readonly scrollTop: number }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "note"; readonly note: Note };

/** A `?launch=aaron-blog` link: a post, optionally the block to land on, optionally SideAsk. */
interface LinkTarget {
  readonly post?: string;
  readonly para?: number;
  readonly ask?: boolean;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function asSection(value: string | undefined): Section {
  return SECTIONS.find((section) => section === value) ?? "all";
}

export class Reader {
  readonly client: BridgeClient;

  readonly language = signal<Language>("zh");
  readonly section = signal<Section>("all");
  readonly filter = signal<Filter | null>(null);
  readonly query = signal("");
  readonly selectedId = signal<string | null>(null);
  readonly selectedKind = signal<"post" | "note">("post");
  readonly limit = signal(PAGE_SIZE);
  /** The pane's `data-view`; null until a view is chosen, as the page first drew it. */
  readonly view = signal<"list" | "reading" | null>(null);
  readonly online = signal(false);
  readonly syncing = signal(false);
  readonly error = signal("");
  readonly lastSynced = signal("");
  readonly index = signal<IndexPack | null>(null);
  readonly manifest = signal<PackManifest | null>(null);
  readonly searchEntries = signal<readonly SearchEntry[] | null>(null);
  readonly article = signal<ArticleView>({ kind: "empty" });
  readonly cited = signal<{ readonly para: number; readonly quote: string } | null>(null);

  readonly postsById = signal<ReadonlyMap<string, Post>>(new Map());
  readonly notesById = signal<ReadonlyMap<string, Note>>(new Map());
  readonly tagsBySlug = signal<ReadonlyMap<string, { readonly slug: string; readonly name: string }>>(new Map());

  readonly t = (key: StringKey): string => translate(this.language.value, key);

  readonly sectionLabel = computed(() => filterLabel(this.filter.value) || this.t(SECTION_KEYS[this.section.value]));
  readonly syncLabel = computed(() => {
    if (this.syncing.value) return this.t("aaron_blog_syncing");
    if (!this.online.value) return this.t("aaron_blog_offline");
    const synced = this.t("aaron_blog_synced");
    return this.lastSynced.value ? `${synced} · ${this.lastSynced.value}` : synced;
  });
  readonly countText = computed(
    () => `${this.itemCount.value} ${this.t("aaron_blog_items")} · ${this.syncLabel.value}`,
  );
  readonly windowTitle = computed(() => {
    const id = this.selectedId.value;
    if (!id) return this.t("aaron_blog_label");
    if (this.selectedKind.value === "note") return this.t("aaron_blog_note");
    return this.postsById.value.get(id)?.title || this.t("aaron_blog_label");
  });
  readonly filteredPosts = computed(() => postsForFilter(this.index.value?.posts ?? [], this.filter.value));
  readonly searchResult = computed<SearchResult>(() =>
    searchRows(
      this.searchEntries.value ?? [],
      this.postsById.value,
      this.notesById.value,
      this.query.value,
      this.t("aaron_blog_note"),
    ),
  );
  readonly itemCount = computed(() =>
    itemCount({
      index: this.index.value,
      section: this.section.value,
      filter: this.filter.value,
      posts: this.filteredPosts.value,
      searchTotal: this.searchResult.value.total,
    }),
  );
  readonly listBody = computed<ListBody>(() =>
    listBody({
      index: this.index.value,
      section: this.section.value,
      filter: this.filter.value,
      query: this.query.value,
      limit: this.limit.value,
      online: this.online.value,
      posts: this.filteredPosts.value,
      search: this.searchResult.value,
      searchReady: this.searchEntries.value !== null,
      notesById: this.notesById.value,
      noteLabel: this.t("aaron_blog_note"),
    }),
  );

  /** The search field, created once by the page; here only read and written. */
  searchEl: HTMLInputElement | null = null;
  /** The article pane, for the scroll position, the selection and a citation's mark. */
  articleEl: HTMLElement | null = null;

  private readonly chunks = new Map<string, ChunkPack>();
  private searchPromise: Promise<void> | null = null;
  private pendingQuote = "";
  private launchConsumed = false;
  private bootPromise: Promise<void> | null = null;
  private destroyed = false;
  private savedUi: SavedUi | null = null;
  private uiSaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(client: BridgeClient) {
    this.client = client;
  }

  readonly searchRef = (element: HTMLInputElement | null): void => {
    this.searchEl = element;
  };

  readonly articleRef = (element: HTMLElement | null): void => {
    this.articleEl = element;
  };

  // ---------------------------------------------------------------------------
  // Start-up.

  setLanguage(language: Language): void {
    this.language.value = language;
    document.documentElement.lang = htmlLang(language);
  }

  /** The saved selection, read once before the window is drawn. */
  async start(): Promise<void> {
    this.savedUi = asSavedUi(await readState(this.client, UI_STATE_KEY));
    // The status line is the reader's only account of reachability: a cached
    // read must not keep calling itself "Synced" after the desk goes offline.
    const target = (globalThis as { window?: Partial<Pick<Window, "addEventListener">> }).window;
    if (typeof target?.addEventListener === "function") {
      const follow = () => {
        this.online.value = navigator.onLine !== false;
      };
      target.addEventListener("online", follow);
      target.addEventListener("offline", follow);
    }
  }

  /** What the desk's menus show: every manifest command is always available. */
  menuState(): { available: Record<string, boolean>; checked: Record<string, boolean> } {
    const available: Record<string, boolean> = {};
    const checked: Record<string, boolean> = {};
    for (const action of MENU_COMMANDS) available[action] = true;
    return { available, checked };
  }

  async runMenuCommand(action: string): Promise<boolean> {
    if (!(MENU_COMMANDS as readonly string[]).includes(action)) return false;
    if (action === "blog-sync") await this.sync(true);
    else if (action === "blog-search") {
      this.searchEl?.focus();
    } else if (action === "blog-back") this.back();
    else {
      const section = MENU_SECTIONS[action];
      if (section) this.setSection(section);
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // The pack.

  private async ensureLongPack(): Promise<ChunkPack | null> {
    if (this.chunks.has("long")) return this.chunks.get("long") ?? null;
    const pack = asChunk(await fetchPack(this, "long"));
    if (pack) this.chunks.set("long", pack);
    return pack;
  }

  private async ensureChunk(year: string): Promise<ChunkPack | null> {
    if (this.chunks.has(year)) return this.chunks.get(year) ?? null;
    const pack = asChunk(await fetchPack(this, `chunk/${year}`));
    if (pack) this.chunks.set(year, pack);
    return pack;
  }

  /** Reads the search pack; the list's "Searching…" line is what asks for it. */
  async loadSearch(): Promise<void> {
    await this.ensureSearch();
  }

  private async ensureSearch(): Promise<void> {
    if (this.searchEntries.value) return;
    if (this.searchPromise) return this.searchPromise;
    this.searchPromise = (async () => {
      try {
        const pack = asSearch(await fetchPack(this, "search"));
        this.searchEntries.value = pack.entries;
        this.online.value = navigator.onLine !== false;
      } catch (error) {
        this.searchEntries.value = [];
        this.error.value = messageOf(error);
      } finally {
        this.searchPromise = null;
      }
    })();
    return this.searchPromise;
  }

  private applyIndex(index: IndexPack): void {
    this.index.value = index;
    // Long reads are openable (SideAsk cites them) without joining the lists.
    this.postsById.value = new Map([...index.posts, ...index.longs].map((post) => [post.id, post]));
    this.notesById.value = new Map(index.notes.map((note) => [note.id, note]));
    this.tagsBySlug.value = new Map(index.tags.map((tag) => [tag.slug, tag]));
    const id = this.selectedId.value;
    if (id && !this.postsById.value.has(id) && !this.notesById.value.has(id)) {
      this.selectedId.value = null;
      this.setView("list");
    }
  }

  private async boot(): Promise<void> {
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = (async () => {
      const cachedIndex = asIndex(await cached(this, "index"));
      if (cachedIndex) this.applyIndex(cachedIndex);
      await this.sync(false);
      if (this.online.value) setTimeout(() => void this.ensureSearch(), 900);
      await this.restoreUiState();
    })();
    return this.bootPromise;
  }

  /** Reads the pack again; `force` ignores what the cache holds for the index. */
  async sync(force = false): Promise<void> {
    if (this.syncing.value) return;
    this.syncing.value = true;
    try {
      const cachedManifest = asManifest(await cached(this, "manifest"));
      const manifest = asManifest(await fetchPack(this, "manifest", { force: true }));
      // Only a new content hash makes the cached posts stale; a forced
      // refresh re-reads the index but keeps what was downloaded.
      const republished =
        Boolean(manifest) && (!cachedManifest || cachedManifest.contentHash !== manifest?.contentHash);
      const changed = force || !cachedManifest || !manifest || republished;
      let index = asIndex(await cached(this, "index"));
      if (changed || !index) index = asIndex(await fetchPack(this, "index", { force: changed }));
      if (manifest) await cache(this, "manifest", manifest);
      if (index) this.applyIndex(index);
      this.manifest.value = manifest;
      this.online.value = navigator.onLine !== false;
      this.error.value = "";
      this.lastSynced.value = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (republished) {
        // Every chunk, the search index and the in-memory copy belong to the old pack.
        this.searchEntries.value = null;
        this.chunks.clear();
        await forgetContent(this);
      }
      // Keep the blog's chunk index for SideAsk questions asked offline.
      const sha = manifest?.rag?.sha256;
      if (sha) {
        const cachedRag = await cached(this, "ragSha256");
        if (changed || cachedRag !== sha) {
          void fetchPack(this, "rag", { force: true })
            .then(() => cache(this, "ragSha256", sha))
            .catch(() => undefined);
        }
      }
    } catch (error) {
      this.online.value = false;
      const cachedIndex = asIndex(await cached(this, "index"));
      if (cachedIndex) this.applyIndex(cachedIndex);
      this.error.value = messageOf(error);
    } finally {
      this.syncing.value = false;
    }
  }

  // ---------------------------------------------------------------------------
  // The saved selection.

  private saveUiState(): void {
    try {
      const saved: Required<SavedUi> = {
        section: this.section.value,
        filter: this.filter.value,
        query: this.query.value,
        selectedId: this.selectedId.value,
        selectedKind: this.selectedKind.value,
        scrollTop: this.articleEl?.scrollTop ?? 0,
      };
      void writeState(this.client, UI_STATE_KEY, saved);
    } catch {
      // A failed write only loses the last selection.
    }
  }

  scheduleUiSave = (): void => {
    clearTimeout(this.uiSaveTimer);
    this.uiSaveTimer = setTimeout(() => this.saveUiState(), 180);
  };

  private async restoreUiState(): Promise<boolean> {
    const saved = this.savedUi;
    this.savedUi = null;
    if (!saved) return false;
    this.section.value = asSection(saved.section);
    this.filter.value = saved.filter ?? null;
    this.query.value = saved.query ?? "";
    if (this.searchEl) this.searchEl.value = this.query.value;
    const id = saved.selectedId ?? null;
    if (id) {
      if (this.postsById.value.has(id)) {
        await this.openPost(id, { restoreScroll: saved.scrollTop ?? 0 });
        return true;
      }
      if (this.notesById.value.has(id)) {
        this.openNote(id);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // The list pane.

  setView(view: "list" | "reading"): void {
    this.view.value = view;
  }

  async open(options: { postId?: string } = {}): Promise<boolean> {
    await this.boot();
    if (options.postId) await this.openPost(options.postId);
    return true;
  }

  async openPost(id: string, { restoreScroll = 0 } = {}): Promise<void> {
    const post = this.postsById.value.get(id);
    if (!post) return;
    this.selectedId.value = id;
    this.selectedKind.value = "post";
    this.scheduleUiSave();
    this.setView("reading");
    this.article.value = { kind: "loading", post };
    try {
      const chunk = post.kind === "long" ? await this.ensureLongPack() : await this.ensureChunk(post.date.slice(0, 4));
      if (this.destroyed) return;
      const html = chunkHtml(chunk, id);
      if (!html) throw new Error(this.t("aaron_blog_missing"));
      this.article.value = { kind: "post", post, html, scrollTop: Number(restoreScroll) || 0 };
      this.error.value = "";
      this.online.value = navigator.onLine !== false;
    } catch (error) {
      if (navigator.onLine === false) this.online.value = false;
      this.error.value = messageOf(error);
      this.article.value = { kind: "error", message: this.error.value };
    }
  }

  openNote(id: string): void {
    const note = this.notesById.value.get(id);
    if (!note) return;
    this.selectedId.value = id;
    this.selectedKind.value = "note";
    this.scheduleUiSave();
    this.setView("reading");
    this.article.value = { kind: "note", note };
  }

  back(): void {
    this.selectedId.value = null;
    this.setView("list");
    this.scheduleUiSave();
    this.article.value = { kind: "empty" };
  }

  chooseSection(section: Section): void {
    if (section === "search") {
      this.searchEl?.focus();
      this.setSection("search");
    } else {
      this.setSection(section);
    }
  }

  setSection(section: Section): void {
    this.section.value = section;
    this.filter.value = null;
    this.query.value = "";
    this.limit.value = PAGE_SIZE;
    this.scheduleUiSave();
    if (this.searchEl) this.searchEl.value = "";
    if (section === "search") {
      void this.ensureSearch();
      this.searchEl?.focus();
    }
    this.back();
  }

  setFilter(type: Filter["type"], value: string, name = ""): void {
    this.filter.value = { type, value, name: name || value };
    this.section.value = "all";
    this.limit.value = PAGE_SIZE;
    this.selectedId.value = null;
    this.setView("list");
    this.scheduleUiSave();
  }

  clearFilter(): void {
    this.filter.value = null;
    this.section.value = "all";
    this.setView("list");
  }

  loadMore(): void {
    this.limit.value += PAGE_SIZE;
  }

  /** A keystroke in the search field: the query, and which section it belongs to. */
  typeQuery(value: string): void {
    this.query.value = value;
    this.limit.value = PAGE_SIZE;
    this.section.value = value.trim() ? "search" : "all";
    this.selectedId.value = null;
    this.setView("list");
    this.scheduleUiSave();
  }

  // ---------------------------------------------------------------------------
  // SideAsk.

  /** The selection is read before the press can collapse it. */
  captureQuote = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-blog-ask]")) this.pendingQuote = this.selectedArticleText();
  };

  selectedArticleText(): string {
    const selection = window.getSelection?.();
    const article = this.articleEl;
    if (!selection || selection.isCollapsed || !article) return "";
    const node = selection.anchorNode;
    if (!node || !article.contains(node.nodeType === 1 ? node : node.parentNode)) return "";
    return String(selection.toString() || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
  }

  currentPost(): Post | null {
    const id = this.selectedId.value;
    if (this.selectedKind.value !== "post" || !id) return null;
    return this.postsById.value.get(id) ?? null;
  }

  /**
   * Open SideAsk paired with this window. "post" asks about the post on
   * screen; "auto" does so only when a passage is selected, else the whole
   * blog. A selected passage becomes the start of the question.
   */
  async askInSideAsk({ scope = "auto" }: { scope?: "auto" | "post" } = {}): Promise<boolean> {
    const quote = this.pendingQuote || this.selectedArticleText();
    this.pendingQuote = "";
    const post = this.currentPost();
    const aboutPost = Boolean(post) && (scope === "post" || (scope === "auto" && Boolean(quote)));
    const target: AskSource = {
      scope: aboutPost ? "post" : "blog",
      postId: aboutPost && post ? post.id : "",
      title: aboutPost && post ? post.title : "",
      date: aboutPost && post ? post.date : "",
      quote,
    };
    const answer = await askAssistant(this.client, target);
    return answer.ok;
  }

  // ---------------------------------------------------------------------------
  // Intents and the welcome link.

  private linkTarget(launch: unknown): LinkTarget | null {
    if (!isRecord(launch) || launch.intent !== "link") return null;
    const options = isRecord(launch.options) ? launch.options : null;
    const blog = options && isRecord(options.blog) ? options.blog : null;
    if (!blog) return null;
    return {
      ...(typeof blog.post === "string" ? { post: blog.post } : {}),
      ...(typeof blog.para === "number" && Number.isInteger(blog.para) ? { para: blog.para } : {}),
      ...(blog.ask === true ? { ask: true } : {}),
    };
  }

  /**
   * Open a cited post (or note) here and mark the cited paragraph.
   */
  async reveal({
    postId = "",
    para = -1,
    quote = "",
  }: {
    postId?: string;
    para?: number;
    quote?: string;
  } = {}): Promise<boolean> {
    await this.boot();
    if (this.notesById.value.has(postId)) {
      this.openNote(postId);
      return true;
    }
    if (!this.postsById.value.has(postId)) return false;
    const alreadyOpen =
      this.selectedId.value === postId && Boolean(this.articleEl?.querySelector(".aaron-blog-article-body"));
    if (!alreadyOpen) await this.openPost(postId);
    this.cited.value = { para: Number(para), quote };
    return true;
  }

  /** The desk delivers intents here: reveal a cited post, or just open. */
  async handleIntent(params: {
    intent?: string;
    options?: Record<string, unknown>;
  }): Promise<{ ok: boolean; reason?: string }> {
    const intent = String(params.intent ?? "");
    if (intent === "reveal") {
      const options = params.options ?? {};
      const postId = typeof options.postId === "string" ? options.postId : "";
      const para = typeof options.para === "number" ? options.para : -1;
      const quote = typeof options.quote === "string" ? options.quote : "";
      return { ok: await this.reveal({ postId, para, quote }) };
    }
    if (intent === "open" || intent === "edit") {
      await this.open();
      return { ok: true };
    }
    return { ok: false, reason: "unsupported-intent" };
  }

  /** `?launch=aaron-blog` is read once; opening the reader later is an ordinary open. */
  async openFromLaunch(): Promise<boolean> {
    const target = this.launchConsumed ? null : this.linkTarget(this.client.welcome.launch);
    if (!target) {
      await this.open();
      return true;
    }
    this.launchConsumed = true;
    const shown = target.post ? await this.reveal({ postId: target.post, para: target.para ?? -1 }) : false;
    if (!shown) {
      await this.open();
      return true;
    }
    if (target.ask) await this.askInSideAsk({ scope: "post" });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle.

  async suspend(_cause: SuspendCause): Promise<void> {
    this.saveUiState();
  }

  resume(): void {}

  async dispose(): Promise<void> {
    this.saveUiState();
    this.destroyed = true;
  }

  /** Connects the reader to the desk's events and menus; called once after the first paint. */
  attachToHost(): void {
    // The desk's title bar follows what the reader shows. The sync label stays
    // in the window's own footer: v1.0.0 never wrote the desk's status line.
    effect(() => {
      this.client.setTitle(this.windowTitle.value);
    });
    pushMenuState(this.client, this.menuState());
    this.client.enableSnapshots({ producer: "dom", target: document.getElementById("app") });
  }

  /** Marks the citation the article pane has just drawn, then clears it. */
  takeCite(): { readonly para: number; readonly quote: string } | null {
    const target = this.cited.value;
    if (target) this.cited.value = null;
    return target;
  }

  applyCite(): void {
    const target = this.takeCite();
    if (target) markCited(this.articleEl, target);
  }
}
