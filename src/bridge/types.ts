// The part of bridge contract v1 this app uses. The kit (ais6-bridge.js) is a
// classic script that installs `window.AIS6Bridge`; these types describe it.
// The reader keeps state, follows the desk's language, answers menu commands,
// delivers intents, asks SideAsk and hands over a picture for the Dock.

import type { Language } from "../strings/index.ts";

export type ColorMode = "light" | "dark";

export interface Appearance {
  readonly id: string;
  readonly colorMode: ColorMode;
  readonly oneBit?: boolean;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
  readonly tokens: Readonly<Record<string, string>>;
  readonly kitUrl: string;
}

/** The `welcome` the host answers with; `standalone` is the kit's own adapter. */
export interface Welcome {
  readonly protocol: number;
  readonly appId: string;
  readonly window: string;
  readonly version: string;
  readonly language: Language;
  readonly appearance: Appearance;
  readonly capabilities: readonly string[];
  readonly readOnly: boolean;
  readonly profile?: string;
  readonly phone?: number;
  /** Any structured-cloneable object the opener handed over (a `?launch=aaron-blog` link). */
  readonly launch?: unknown;
  readonly standalone?: boolean;
}

/** `menu.state`: what the desk shows enabled and checked in this window's menus. */
export interface MenuState {
  readonly available: Readonly<Record<string, boolean>>;
  readonly checked: Readonly<Record<string, boolean>>;
  readonly reasons?: Readonly<Record<string, string>>;
}

export interface MenuCommand {
  readonly action: string;
  readonly arg?: unknown;
}

export type SuspendCause = "close" | "away";

/** What the reader tells SideAsk: which post, which passage, or the whole blog. */
export interface AskSource {
  readonly scope: "post" | "blog";
  readonly postId: string;
  readonly title: string;
  readonly date: string;
  readonly quote: string;
}

/** The request methods this app calls, with their params and results. */
export interface BridgeCalls {
  "state.get": { params: { key: string }; result: { value: unknown } };
  "state.set": { params: { key: string; value: unknown }; result: Record<string, never> };
  /** The desk's public gate: it shows its verification sheet and answers once the writer passed it. */
  "access.verify": { params: Record<string, never>; result: { verified?: boolean } };
  /** Hand the reader's subject to SideAsk; the host pairs the windows and prefills the quote. */
  "intent.dispatch": {
    params: { intent: "ask"; appId: "sideAsk"; source: AskSource };
    result: { ok?: boolean; reason?: string };
  };
}

/** The requests the desk sends this app, and what the app answers. */
export interface BridgeHandlers {
  "menu.command": { params: MenuCommand; result: { handled: boolean } };
  "lifecycle.suspend": { params: { cause?: SuspendCause }; result: Record<string, never> };
  "lifecycle.resume": { params: Record<string, never>; result: Record<string, never> };
  "lifecycle.dispose": { params: Record<string, never>; result: Record<string, never> };
  "intent.deliver": {
    params: { intent?: string; items?: unknown; receiptId?: string; options?: Record<string, unknown> };
    result: { ok: boolean; reason?: string };
  };
}

/** The events the desk sends this app. */
export interface BridgeEvents {
  "language.changed": { language: Language };
}

/** A call that may take longer than the bridge's 15 s (the desk's verification sheet). */
export interface CallOptions {
  readonly timeout?: number;
}

/** The client object `AIS6Bridge.connect()` resolves to (hosted or standalone). */
export interface BridgeClient {
  readonly standalone: boolean;
  readonly welcome: Welcome;
  call<M extends keyof BridgeCalls>(
    method: M,
    params: BridgeCalls[M]["params"],
    options?: CallOptions,
  ): Promise<BridgeCalls[M]["result"]>;
  on<E extends keyof BridgeEvents>(method: E, listener: (params: BridgeEvents[E]) => void): () => void;
  handle<M extends keyof BridgeHandlers>(
    method: M,
    handler: (
      params: BridgeHandlers[M]["params"],
    ) => BridgeHandlers[M]["result"] | Promise<BridgeHandlers[M]["result"]>,
  ): void;
  ready(): boolean;
  status(params: { key?: string; text?: string; host?: string }): boolean;
  menuState(state: MenuState): boolean;
  setTitle(title: string): boolean;
  enableSnapshots(config: { producer: "canvas" | "dom"; target?: Element | null }): BridgeClient;
  snapshotNow(): Promise<boolean>;
}

export interface ConnectOptions {
  readonly appId: string;
  readonly window: string;
  readonly version: string;
}

/** `window.AIS6Bridge`, installed by ais6-bridge.js. */
export interface Ais6Bridge {
  readonly protocol: number;
  connect(options: ConnectOptions): Promise<BridgeClient>;
}

declare global {
  interface Window {
    AIS6Bridge?: Ais6Bridge;
  }
}
