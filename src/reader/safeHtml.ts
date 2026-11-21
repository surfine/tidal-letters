// Article HTML arrives from the pack already sanitized, and is sanitized once
// more here before it reaches the DOM: no script, frame, style, form or event
// attribute, no javascript:/data:text/html URL, and every external link opens
// in the browser the way the desk's own links do.

const FORBIDDEN = "script, iframe, object, embed, style, link, meta, base, form";
const UNSAFE_URL = /^\s*(?:javascript|vbscript|data:text\/html)/i;

export function safeHtml(html: string | null | undefined): string {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  for (const node of template.content.querySelectorAll(FORBIDDEN)) node.remove();
  for (const node of template.content.querySelectorAll("*")) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || attribute.name === "srcdoc" || attribute.name === "formaction") {
        node.removeAttribute(attribute.name);
      }
    }
    const href = node.getAttribute("href") ?? "";
    const src = node.getAttribute("src") ?? "";
    if (UNSAFE_URL.test(href)) node.setAttribute("href", "#");
    if (UNSAFE_URL.test(src)) node.removeAttribute("src");
    // External links open in the browser, the way the deck's own links do.
    if (node.tagName === "A" && /^https?:/i.test(node.getAttribute("href") ?? "")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  }
  return template.innerHTML;
}
