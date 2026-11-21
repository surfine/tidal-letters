// Tidal Letters on its own page, in a real browser: the list, a post, the
// sections, the filters, the search, a note, the saved selection, both
// languages, and the state keys the page keeps.
//
//   npx playwright test tests/e2e/reader.spec.mjs

import { expect, test } from "@playwright/test";
import { SERVE, serveTree } from "./serve.mjs";

let server;
let url;

test.beforeAll(async () => {
  ({ server, url } = await serveTree(SERVE));
});

test.afterAll(async () => {
  await new Promise((done) => server.close(done));
});

const boot = async (page, lang = "zh") => {
  await page.goto(`${url}?lang=${lang}`);
  await page.waitForSelector(".aaron-blog-row");
  await page.waitForFunction(() => document.querySelectorAll(".aaron-blog-row").length === 10);
};

test("draws the pack's ten posts, with the status line counting them", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await boot(page);
  await expect(page.locator("[data-blog-section-label]")).toHaveText("全部推送");
  await expect(page.locator("[data-blog-count]")).toContainText("10 则");
  await expect(page.locator("[data-blog-count]")).toContainText("已同步");
  await expect(page.locator("#app .aaron-blog-row").first()).toContainText("High tide, blank paper");
  // The page has always kept its state under this key prefix, and still does.
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("ais6:")));
  expect(keys).toContain("ais6:aaronBlog:pack:index");
  expect(keys).toContain("ais6:aaronBlog:pack:manifest");
  expect(errors).toEqual([]);
});

test("opens a post, marks its row, and goes back", async ({ page }) => {
  await boot(page);
  await page.click('[data-post-id="demo-paper"]');
  await page.waitForSelector(".aaron-blog-article-body");
  await expect(page.locator("[data-blog-article] .aaron-blog-article-body p").first()).toHaveText(
    "High tide covers the blank paper for a moment; when it falls, the page is still blank.",
  );
  await expect(page.locator(".aaron-blog-row[aria-current='true']")).toHaveAttribute("data-post-id", "demo-paper");
  await expect(page.locator(".aaron-blog-pane")).toHaveAttribute("data-view", "reading");
  await expect(page.locator(".aaron-blog-article-head time")).toHaveText("2026-08-01");
  await page.click("[data-blog-back]");
  await expect(page.locator(".aaron-blog-pane")).toHaveAttribute("data-view", "list");
  await expect(page.locator(".aaron-blog-pane [data-blog-article] .aaron-blog-empty strong")).toHaveText("潮汐信笺");
});

test("every section draws what the index says, and a filter narrows it", async ({ page }) => {
  await boot(page);
  await page.click('[data-blog-section="tags"]');
  await expect(page.locator(".aaron-blog-tag-list button")).toHaveCount(3);
  await page.click('[data-filter-tag="tides"]');
  await expect(page.locator(".aaron-blog-row")).toHaveCount(4);
  await expect(page.locator("[data-blog-context] strong")).toHaveText("#tides");
  await expect(page.locator("[data-blog-count]")).toContainText("4 则");

  await page.click("[data-blog-clear-filter]");
  await page.click('[data-blog-section="archive"]');
  await expect(page.locator(".aaron-blog-year-list button")).toHaveCount(3);
  await page.click('[data-filter-year="2022"]');
  await expect(page.locator(".aaron-blog-row")).toHaveCount(3);

  await page.click('[data-blog-section="notes"]');
  await expect(page.locator("[data-note-id]")).toHaveCount(2);
  await page.click("[data-note-id]");
  await expect(page.locator(".aaron-blog-article-head time")).toHaveText("2025-10-10");
  await expect(page.locator("[data-blog-article] .aaron-blog-article-body a")).toHaveAttribute(
    "href",
    "https://example.org/demo-note",
  );

  await page.click('[data-blog-section="best"]');
  await expect(page.locator(".aaron-blog-group")).toHaveCount(1);
  await expect(page.locator(".aaron-blog-group .aaron-blog-row")).toHaveCount(3);

  await page.click('[data-blog-section="threads"]');
  await expect(page.locator(".aaron-blog-series-list button")).toHaveCount(1);
  await page.click('[data-filter-series="Opening the demo"]');
  await expect(page.locator(".aaron-blog-row")).toHaveCount(3);
});

test("searches the flattened index and says when there is nothing", async ({ page }) => {
  await boot(page);
  await page.click('[data-blog-section="search"]');
  await expect(page.locator("[data-blog-list] .aaron-blog-empty strong")).toHaveText("搜索");
  await page.fill("[data-blog-search]", "tides");
  await expect(page.locator(".aaron-blog-row")).not.toHaveCount(0);
  await expect(page.locator(".aaron-blog-row").first()).toBeVisible();
  await page.fill("[data-blog-search]", "zzzznothing");
  await expect(page.locator("[data-blog-list] .aaron-blog-empty strong")).toHaveText("没有结果");
  await page.fill("[data-blog-search]", "");
  await expect(page.locator(".aaron-blog-row")).toHaveCount(10);
});

test("comes back to the post and the scroll position it saved", async ({ page }) => {
  await boot(page);
  await page.click('[data-post-id="demo-scroll"]');
  await page.waitForSelector(".aaron-blog-article-body");
  // The browser clamps to the article's own length; that clamped value is
  // what the reader saves and what coming back must restore.
  const saved = await page.evaluate(() => {
    const article = document.querySelector("[data-blog-article]");
    article.scrollTop = 420;
    return article.scrollTop;
  });
  expect(saved).toBeGreaterThan(100);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector(".aaron-blog-article-body");
  await page.waitForTimeout(400);
  await expect(page.locator(".aaron-blog-row[aria-current='true']")).toHaveAttribute("data-post-id", "demo-scroll");
  expect(await page.evaluate(() => document.querySelector("[data-blog-article]").scrollTop)).toBe(saved);
});

test("speaks both languages, and the window keeps its Chinese name in English", async ({ page }) => {
  await boot(page, "en");
  await expect(page.locator("[data-blog-section-label]")).toHaveText("All Posts");
  await expect(page.locator(".aaron-blog-rail button").first()).toHaveText("Best");
  await page.click('[data-post-id="demo-paper"]');
  await page.waitForSelector(".aaron-blog-article-body");
  await expect(page.locator(".aaron-blog-article-head")).toContainText("min read");
  await expect(page.locator("[data-blog-sync]")).toHaveText("Refresh");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
});

test("sanitizes the article HTML it draws", async ({ page }) => {
  // The pack is the one place foreign HTML enters the page. A doctored chunk
  // stands in for a post that carries every shape the sanitizer must remove.
  await page.route("**/demo/posts/2026.json", (route) =>
    route.fulfill({
      json: {
        posts: {
          "demo-paper": {
            html: [
              '<p onclick="window.pwned = 1">safe paragraph</p>',
              "<script>window.pwned = 1</script>",
              '<iframe src="https://example.org/embed"></iframe>',
              "<style>body { display: none }</style>",
              '<a href="javascript:window.pwned = 1">bad link</a>',
              '<a href="https://example.org/good">good link</a>',
              '<img src="data:text/html,<script>window.pwned=1</script>">',
            ].join(""),
          },
        },
      },
    }),
  );
  await boot(page);
  await page.click('[data-post-id="demo-paper"]');
  await page.waitForSelector(".aaron-blog-article-body");
  const body = page.locator("[data-blog-article] .aaron-blog-article-body");
  await expect(body.locator("p").first()).toHaveText("safe paragraph");
  await expect(body.locator("script, iframe, style, object, embed, form")).toHaveCount(0);
  await expect(body.locator("p").first()).not.toHaveAttribute("onclick", /.*/);
  await expect(body.locator("a").first()).toHaveAttribute("href", "#");
  const good = body.locator('a[href="https://example.org/good"]');
  await expect(good).toHaveAttribute("rel", "noopener noreferrer");
  await expect(good).toHaveAttribute("target", "_blank");
  // An image the sanitizer cannot trust keeps its element and loses its source.
  await expect(body.locator("img")).toHaveCount(1);
  await expect(body.locator("img")).not.toHaveAttribute("src", /.*/);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});
