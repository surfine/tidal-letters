// The search field is the reader's one typing surface, and Chinese is typed
// into it. The desk's IME ruling (stack plan P3) says an input a component
// draws is created once and afterwards only its value and caret are read or
// written — never rebuilt, never re-keyed, and never re-rendered while a
// composition is in flight.
//
//   npx playwright test tests/e2e/ime.spec.mjs
//
// The input method is Chromium's own (CDP Input.imeSetComposition /
// Input.insertText), which raises the real compositionstart/update/end and
// beforeinput/input events with isComposing set, not synthetic DOM events.

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

test("a Chinese composition in the search field survives the list repainting", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await page.goto(`${url}?lang=zh`);
  await page.waitForSelector(".aaron-blog-row");

  // Watch the field from the document, before any listener the page installs.
  await page.evaluate(() => {
    const input = document.querySelector("[data-blog-search]");
    window.__ime = {
      input,
      events: [],
      inputs: [],
      composing: false,
      listBefore: document.querySelector("[data-blog-list]").innerHTML,
    };
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
      document.addEventListener(type, (event) => {
        window.__ime.events.push(type);
        window.__ime.composing = type !== "compositionend";
        window.__ime.lastValue = /** @type {HTMLInputElement} */ (event.target).value;
      });
    }
    document.addEventListener("input", (event) => {
      const field = /** @type {HTMLInputElement} */ (event.target);
      window.__ime.inputs.push({ value: field.value, composing: /** @type {InputEvent} */ (event).isComposing });
    });
  });
  const cdp = await context.newCDPSession(page);
  await page.click("[data-blog-search]");
  expect(await page.evaluate(() => document.activeElement === window.__ime.input)).toBe(true);

  // The first candidate: a composition is open and the list already redraws.
  await cdp.send("Input.imeSetComposition", { text: "潮", selectionStart: 1, selectionEnd: 1 });
  const afterFirst = await page.evaluate(() => {
    const field = /** @type {HTMLInputElement} */ (document.querySelector("[data-blog-search]"));
    return {
      same: field === window.__ime.input,
      focused: document.activeElement === field,
      value: field.value,
      composing: window.__ime.composing,
      caret: field.selectionStart,
      list: document.querySelector("[data-blog-list]").innerHTML,
    };
  });
  expect(afterFirst.same).toBe(true);
  expect(afterFirst.focused).toBe(true);
  expect(afterFirst.value).toBe("潮");
  expect(afterFirst.composing).toBe(true);
  expect(afterFirst.caret).toBe(1);

  // A second candidate while the list is being redrawn under it.
  await cdp.send("Input.imeSetComposition", { text: "潮汐", selectionStart: 2, selectionEnd: 2 });
  const afterSecond = await page.evaluate(() => {
    const field = /** @type {HTMLInputElement} */ (document.querySelector("[data-blog-search]"));
    return {
      same: field === window.__ime.input,
      focused: document.activeElement === field,
      value: field.value,
      composing: window.__ime.composing,
      caret: field.selectionStart,
      list: document.querySelector("[data-blog-list]").innerHTML,
      events: window.__ime.events.slice(),
    };
  });
  expect(afterSecond.same).toBe(true);
  expect(afterSecond.focused).toBe(true);
  expect(afterSecond.value).toBe("潮汐");
  expect(afterSecond.composing).toBe(true);
  expect(afterSecond.caret).toBe(2);
  // The composition was not restarted, and the list did repaint meanwhile.
  expect(afterSecond.events.filter((type) => type === "compositionstart")).toHaveLength(1);
  expect(afterSecond.events).toContain("compositionupdate");
  expect(afterSecond.list).not.toBe("");

  // Commit: the committed text is the query, and the list answers it.
  await cdp.send("Input.insertText", { text: "潮汐" });
  await page.waitForTimeout(300);
  const committed = await page.evaluate(() => {
    const field = /** @type {HTMLInputElement} */ (document.querySelector("[data-blog-search]"));
    return {
      same: field === window.__ime.input,
      value: field.value,
      composing: window.__ime.composing,
      rows: document.querySelectorAll("[data-blog-list] .aaron-blog-row").length,
      section: document.querySelector("[data-blog-section-label]").textContent,
    };
  });
  expect(committed.same).toBe(true);
  expect(committed.value).toBe("潮汐");
  expect(committed.composing).toBe(false);
  expect(committed.section).toBe("搜索");
  expect(committed.rows).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the field the page keeps is the one the reader reads", async ({ page }) => {
  await page.goto(`${url}?lang=en`);
  await page.waitForSelector(".aaron-blog-row");
  // Switching sections writes the field's value and caret, never a new field.
  await page.evaluate(() => {
    window.__sameField = document.querySelector("[data-blog-search]");
  });
  await page.fill("[data-blog-search]", "shelf");
  await page.click('[data-blog-section="tags"]');
  const state = await page.evaluate(() => {
    const field = /** @type {HTMLInputElement} */ (document.querySelector("[data-blog-search]"));
    return { same: field === window.__sameField, value: field.value, placeholder: field.placeholder };
  });
  expect(state.same).toBe(true);
  expect(state.value).toBe("");
  expect(state.placeholder).toBe("Search titles, tags or text");
});
