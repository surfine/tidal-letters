// A stand-in for the kit's bridge client: state in a Map, the two hand-over
// calls recorded, and nothing else. Enough to run the reader's own code in
// node, the way a desk would answer it.

import type { AskSource, BridgeClient, CallOptions, Welcome } from "../../src/bridge/types.ts";

export interface FakeBridge extends BridgeClient {
  readonly state: Map<string, unknown>;
  readonly asked: AskSource[];
}

export function fakeBridge({
  standalone = false,
  state = new Map<string, unknown>(),
}: {
  standalone?: boolean;
  state?: Map<string, unknown>;
} = {}): FakeBridge {
  const asked: AskSource[] = [];
  const welcome: Welcome = {
    protocol: 1,
    appId: "aaronBlog",
    window: "aaronBlog",
    version: "1.1.0",
    language: "zh",
    appearance: {
      id: "classic",
      colorMode: "light",
      touch: false,
      reducedMotion: false,
      tokens: {},
      kitUrl: "",
    },
    capabilities: ["state", "snapshot", "windows", "intents"],
    readOnly: false,
  };
  const bridge = {
    standalone,
    welcome,
    state,
    asked,
    call: async (method: string, params: Record<string, unknown>, _options?: CallOptions) => {
      if (method === "state.get")
        return { value: state.has(String(params.key)) ? state.get(String(params.key)) : null };
      if (method === "state.set") {
        state.set(String(params.key), params.value);
        return {};
      }
      if (method === "state.remove") {
        state.delete(String(params.key));
        return {};
      }
      if (method === "state.keys") return { keys: [...state.keys()] };
      if (method === "access.verify") return { verified: true };
      if (method === "intent.dispatch") {
        asked.push(params.source as AskSource);
        return { ok: true };
      }
      throw new Error(`fake bridge: unexpected ${method}`);
    },
    on: () => () => {},
    handle: () => {},
    ready: () => true,
    status: () => true,
    menuState: () => true,
    setTitle: () => true,
    enableSnapshots: () => bridge,
    snapshotNow: async () => false,
  };
  return bridge as unknown as FakeBridge;
}

/** A fetch and location for the page under test; the reader reads both off `window`. */
export interface FakePage {
  readonly pages: Map<string, unknown>;
  readonly requests: string[];
  setWindow(): void;
}

export function fakePage(initial: Record<string, unknown> = {}): FakePage {
  const pages = new Map<string, unknown>(Object.entries(initial));
  const requests: string[] = [];
  const response = (value: unknown) => ({
    ok: value !== undefined,
    status: value === undefined ? 404 : 200,
    json: async () => value,
    clone() {
      return response(value);
    },
  });
  const page: FakePage = {
    pages,
    requests,
    setWindow: () => {
      const origin = "https://desk.test";
      const location = {
        href: `${origin}/apps/tidal-letters/reader/index.html`,
        origin,
        pathname: "/apps/tidal-letters/reader/index.html",
      };
      (globalThis as unknown as { window: unknown }).window = {
        location,
        fetch: async (input: string) => {
          requests.push(String(input));
          const key = String(input).replace(/^.*\/api\/aaron-blog\//, "");
          return response(pages.get(key));
        },
      };
    },
  };
  return page;
}
