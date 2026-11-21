import { SECTION_KEYS, SECTIONS } from "../reader/logic.ts";
import type { Reader } from "../reader/reader.ts";

/** The seven sections, one pressed at a time. */
export function Rail({ reader }: { reader: Reader }) {
  const section = reader.section.value;
  return (
    <nav class="aaron-blog-rail" aria-label={reader.t("aaron_blog_sections")}>
      {SECTIONS.map((item) => (
        <button
          key={item}
          type="button"
          data-blog-section={item}
          aria-pressed={item === section ? "true" : "false"}
          onClick={() => reader.chooseSection(item)}
        >
          {reader.t(SECTION_KEYS[item])}
        </button>
      ))}
    </nav>
  );
}
