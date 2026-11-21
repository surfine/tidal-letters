import { en } from "./en.ts";
import { zh } from "./zh.ts";

export type StringKey = keyof typeof en;
export type Language = "en" | "zh";

const tables: Record<Language, Record<StringKey, string>> = { en, zh };

/** The translated string. The reader's copy has no placeholders. */
export function translate(language: Language, key: StringKey): string {
  return tables[language][key];
}

/** The page's `lang` attribute for a language, as the reader has always set it. */
export function htmlLang(language: Language): string {
  return language === "zh" ? "zh-Hans" : "en";
}
