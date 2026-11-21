// The app's one connection to its host, typed. Inside the desk the kit talks
// to the desk over a MessagePort; on the app's own page the kit's standalone
// adapter keeps state in localStorage and follows the system colour scheme.

import { version as manifestVersion } from "../../public/app.manifest.json";
import type { Language } from "../strings/index.ts";
import type { AskSource, BridgeClient, MenuState, SuspendCause } from "./types.ts";

/**
 * The window's `app` in the manifest (not the group id): the desk checks the
 * hello against it, and the standalone kit keeps this page's state under
 * `ais6:aaronBlog:*`, the keys the page has always written.
 */
export const APP_ID = "aaronBlog";
export const WINDOW_NAME = "aaronBlog";
/** Read from the manifest, so the hello can never name another version than the one the desk pinned. */
export const APP_VERSION: string = manifestVersion;

export type { BridgeClient } from "./types.ts";

/** Connects through the kit the page loaded before this module. */
export async function connect(): Promise<BridgeClient> {
  const kit = window.AIS6Bridge;
  if (!kit) throw new Error("ais6-bridge.js did not load");
  return kit.connect({ appId: APP_ID, window: WINDOW_NAME, version: APP_VERSION });
}

/** One key from the app's own state; null when it was never written. */
export async function readState(client: BridgeClient, key: string): Promise<unknown> {
  try {
    return (await client.call("state.get", { key })).value;
  } catch {
    return null;
  }
}

/** Answers false when the host refused (a read-only lease, a full store); the reader goes on. */
export async function writeState(client: BridgeClient, key: string, value: unknown): Promise<boolean> {
  try {
    await client.call("state.set", { key, value });
    return true;
  } catch {
    return false;
  }
}

export function pushMenuState(client: BridgeClient, state: MenuState): void {
  client.menuState(state);
}

export function onMenuCommand(client: BridgeClient, run: (action: string) => boolean | Promise<boolean>): void {
  client.handle("menu.command", async ({ action }) => ({ handled: await run(action) }));
}

/** Suspend, resume and dispose; each handler runs before the reply goes back. */
export function onLifecycle(
  client: BridgeClient,
  handlers: { suspend: (cause: SuspendCause) => Promise<void>; resume: () => void; dispose: () => Promise<void> },
): void {
  client.handle("lifecycle.suspend", async ({ cause }) => {
    await handlers.suspend(cause ?? "away");
    return {};
  });
  client.handle("lifecycle.resume", () => {
    handlers.resume();
    return {};
  });
  client.handle("lifecycle.dispose", async () => {
    await handlers.dispose();
    return {};
  });
}

/** A language switch redraws every string the app owns. */
export function onLanguage(client: BridgeClient, listener: (language: Language) => void): () => void {
  return client.on("language.changed", ({ language }) => listener(language));
}

/**
 * The desk's public gate. On the public deployment an `/api/` request without
 * a verified session answers 401 verification_required; the desk's own fetch
 * shows its verification sheet and retries. This page's fetch is not the
 * desk's, so it asks the desk for the sheet and retries once.
 */
export async function verifyAccess(client: BridgeClient): Promise<boolean> {
  if (client.standalone) return true;
  try {
    const answer = await client.call("access.verify", {}, { timeout: 10 * 60 * 1000 });
    return answer.verified === true;
  } catch {
    return false;
  }
}

/** Asks the desk's assistant about what the reader shows. */
export async function askAssistant(client: BridgeClient, source: AskSource): Promise<{ ok: boolean }> {
  if (client.standalone) return { ok: false };
  try {
    const answer = await client.call("intent.dispatch", { intent: "ask", appId: "sideAsk", source });
    return { ok: answer.ok === true };
  } catch {
    return { ok: false };
  }
}
