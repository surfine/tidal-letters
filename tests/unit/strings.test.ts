import { describe, expect, it } from "vitest";
import { en } from "../../src/strings/en.ts";
import { htmlLang, translate } from "../../src/strings/index.ts";
import { zh } from "../../src/strings/zh.ts";

describe("the reader's two languages", () => {
  it("has the same keys in both tables", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty string", () => {
    for (const [key, value] of Object.entries(en)) expect(value.length, key).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(zh)) expect(value.length, key).toBeGreaterThan(0);
  });

  it("draws the window's name the same in both, as the desk always has", () => {
    expect(en.aaron_blog_label).toBe("潮汐信笺");
    expect(zh.aaron_blog_label).toBe("潮汐信笺");
  });

  it("translates by language", () => {
    expect(translate("en", "aaron_blog_more")).toBe("Load more");
    expect(translate("zh", "aaron_blog_more")).toBe("加载更多");
    expect(translate("en", "refresh")).toBe("Refresh");
    expect(translate("zh", "refresh")).toBe("刷新");
  });

  it("sets the page language the reader has always set", () => {
    expect(htmlLang("zh")).toBe("zh-Hans");
    expect(htmlLang("en")).toBe("en");
  });
});
