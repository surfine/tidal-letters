// Tidal Letters inside the desk: the same page in the host's frame, reached
// through the bridge — welcomed, stateful, and drawing the pack the desk's
// route serves.
//
//   DESK_URL=http://127.0.0.1:4399 npx playwright test tests/e2e/desk.spec.mjs
//
// The desk must be running with this app pinned (`apps:pin --from-dir`) and
// served (`npm start` with its own PORT). The pack route is answered from the
// demo/ files, so the test does not depend on the blog being reachable.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const deskUrl = process.env.DESK_URL || "";
const demo = (name) => JSON.parse(readFileSync(join(process.cwd(), "demo", name), "utf8"));

test.skip(!deskUrl, "no desk running: set DESK_URL to a desk that has this app pinned");

test("the frame connects to the desk, keeps state through it, and draws the pack", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  // The desk's pack route, answered from the demo files: deterministic, and
  // the same shapes the real blog publishes.
  await page.route("**/api/aaron-blog/**", (route) => {
    const key = new URL(route.request().url()).pathname.replace("/api/aaron-blog/", "");
    const year = /^chunk\/(\d{4})$/.exec(key);
    const file = year ? `posts/${year[1]}.json` : `${key}.json`;
    try {
      route.fulfill({ json: demo(file) });
    } catch {
      route.fulfill({ status: 502, json: { error: "blog_unavailable", detail: "blog rag index unavailable" } });
    }
  });
  await page.goto(deskUrl);
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 60_000 });
  await page.evaluate(() => openWindow("aaronBlog"));

  const host = page.locator('[data-window="aaronBlog"]');
  await expect(host).toBeVisible();
  const frame = page.frameLocator('[data-window="aaronBlog"] iframe');
  await frame.locator(".aaron-blog-row").first().waitFor({ timeout: 30_000 });
  await expect(frame.locator(".aaron-blog-row")).toHaveCount(10);

  // The frame got the desk's welcome, not the standalone adapter: it draws the
  // desk's appearance and asks the desk for its state.
  const appearance = await frame.locator("html").getAttribute("data-appearance");
  expect(appearance).toBeTruthy();
  expect(appearance).not.toBe("standalone");

  // A post, drawn from the desk's pack route.
  await frame.locator('[data-post-id="demo-paper"]').click();
  await frame.locator(".aaron-blog-article-body").waitFor();
  await expect(frame.locator(".aaron-blog-article-body p").first()).toContainText("High tide covers the blank paper");

  // The selection is saved in the desk's state, so a close and reopen comes
  // back to the same post (a standalone frame would lose it with its storage).
  await page.evaluate(() => closeWindow("aaronBlog"));
  await page.waitForTimeout(500);
  await page.evaluate(() => openWindow("aaronBlog"));
  await frame.locator(".aaron-blog-row").first().waitFor({ timeout: 30_000 });
  await frame.locator('.aaron-blog-row[aria-current="true"]').waitFor({ timeout: 15_000 });
  await expect(frame.locator('.aaron-blog-row[aria-current="true"]')).toHaveAttribute("data-post-id", "demo-paper");

  // The window reports itself ready to the host.
  await expect(page.locator('[data-window="aaronBlog"][data-host="ready"]')).toHaveCount(1, { timeout: 15_000 });
  expect(errors.filter((message) => !message.includes("verification"))).toEqual([]);
});
