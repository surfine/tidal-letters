// A SideAsk citation lands on the paragraph it quoted. The block is found by
// its position in the article body, confirmed (or replaced) by the opening
// words of the quoted text, then marked and scrolled into view.

function normalizedText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CiteTarget {
  readonly para: number;
  readonly quote: string;
}

/** Marks the cited block in the article; false when there is no article body to mark. */
export function markCited(article: Element | null, target: CiteTarget): boolean {
  const body = article?.querySelector(".aaron-blog-article-body");
  if (!body) return false;
  for (const node of body.querySelectorAll(".is-cited")) node.classList.remove("is-cited");
  const children = [...body.children];
  const needle = normalizedText(target.quote).slice(0, 24);
  let found = Number.isInteger(target.para) && target.para >= 0 ? (children[target.para] ?? null) : null;
  if (needle && !(found && normalizedText(found.textContent).includes(needle))) {
    found = children.find((node) => normalizedText(node.textContent).includes(needle)) ?? found;
  }
  if (!found) return false;
  found.classList.add("is-cited");
  found.scrollIntoView({ block: "center", behavior: "smooth" });
  // The page on aaronlau.me carries id="pN" on the same blocks, so the footer
  // link lands on the paragraph that was cited, not the top.
  const site = article?.querySelector("[data-blog-site]");
  if (site)
    site.setAttribute("href", `${String(site.getAttribute("href") ?? "").split("#")[0]}#p${children.indexOf(found)}`);
  return true;
}
