# Tidal Letters（潮汐信笺）

A browser reader for a personal blog’s published JSON pack: posts, notes, tags,
archive, threads and search, with an offline cache of packs already downloaded.
A host page can embed the same files in a frame.

The app is TypeScript + Preact. Its model, the pack guards and the reader’s own
logic are unit-tested; the browser specs drive the real page, including a
Chinese composition in the search field.

## Screenshots

Captured running inside the AI System 6 desk: Classic on the left, Liquid Glass on the right.

<p><img src="screenshots/aaronBlog-classic.png" width="49%" alt="Tidal Letters · Classic"> <img src="screenshots/aaronBlog-liquid-glass.png" width="49%" alt="Tidal Letters · Liquid Glass"></p>

## Run the demo

```bash
npm ci
npm run dev
```

Then open `http://localhost:5173/reader/index.html`.

The `demo/` folder answers `/api/aaron-blog/…` when the page runs on its own
(no host desk). The posts in `demo/` are invented samples about the reader and
about tides and letters; they are not a real blog.

## Check

```bash
npm run check       # types (strict), Biome, unit tests, build
npm run test:e2e    # the built page in Chromium, and the IME contract
```

## Real deployment

A host that is not using `demo/` needs a same-origin server that answers:

| Route | Body |
| --- | --- |
| `GET /api/aaron-blog/manifest` | Pack manifest JSON (`contentHash`, optional `rag`) |
| `GET /api/aaron-blog/index` | Index of posts, notes, tags, series, best and longs |
| `GET /api/aaron-blog/search` | Search entries (`{ entries }`) |
| `GET /api/aaron-blog/long` | Long-read HTML pack (`{ posts }`) |
| `GET /api/aaron-blog/chunk/<YYYY>` | Year chunk of post HTML (`{ posts }`) |
| `GET /api/aaron-blog/rag` | Optional RAG pack bytes named by the manifest |
| `GET /api/aaron-blog/retrieve` | Optional SideAsk retrieval over that RAG index |

Without those routes (and without `demo/` or a prior cached pack), the list
stays on the loading empty state.

Progress (last section, selection, downloaded packs) stays in the browser when
the page runs on its own.

## Build

```bash
npm run build
```

Writes what a host page embeds into `dist/`: the page the manifest names
(`reader/index.html`), the kit’s files beside it, and one stylesheet and one
module bundle. `demo/` is not part of the embed tree.

## Layout

| Path | What it is |
| --- | --- |
| `reader/index.html` | The page the manifest names; the build rewrites its module and stylesheet links |
| `src/bridge/` | The typed bridge client: state, the access gate, SideAsk, lifecycle, menus |
| `src/data/` | The pack’s types, the guards that narrow them, and the content door with its cache |
| `src/reader/` | The reader’s state (signals), its pure list logic, the article sanitiser and the citation mark |
| `src/ui/` | The Preact window: status line, rail, list pane and article pane |
| `src/styles/` | The page’s base styles and the reader’s stylesheet, both carried over from 1.0.0 |
| `public/` | `ais6-bridge.js`, `kit.css` and `app.manifest.json`, copied to the build’s root |
| `demo/` | Invented sample packs for the page on its own |
| `tools/probe.mjs`, `tools/compare.mjs` | The comparison probe and its diff |
| `tests/unit/`, `tests/e2e/` | Vitest, Playwright |

## Changelog

### 1.1.0 — 2026-11-22

- TypeScript + Preact, strict `tsc` and Biome. Same screens, copy, interaction,
  menus, bridge messages, state keys (`ui`, `pack:*`) and `dist` behaviour; the
  build is one bundle instead of six classic scripts.
- Fixed: after the blog published a new content hash, the reader kept serving
  the chunks and the search index it had cached (`pack:chunk/*`, `pack:long`,
  `pack:search`). A content change now retires them, so a sync shows the new
  text without a reload.

## Licence

MIT. See [LICENSE](LICENSE).

中文：[README.zh-CN.md](README.zh-CN.md).
