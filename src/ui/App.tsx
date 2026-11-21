import { useEffect, useRef } from "preact/hooks";
import type { Reader } from "../reader/reader.ts";
import { ArticlePane } from "./ArticlePane.tsx";
import { ListPane } from "./ListPane.tsx";
import { Rail } from "./Rail.tsx";
import { StatusBar } from "./StatusBar.tsx";

/**
 * The window the page draws below the desk's title bar: the status line, the
 * pane and the three columns the stylesheet places. The desk draws the frame
 * and the title bar; this is the same shape its own window shell builds, so
 * the deck's stylesheet finds the elements it has always styled.
 */
export function App({ reader }: { reader: Reader }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    // The selection is read before an ask button's press can collapse it.
    const capture = (event: Event) => reader.captureQuote(event as PointerEvent);
    element.addEventListener("pointerdown", capture, true);
    return () => element.removeEventListener("pointerdown", capture, true);
  }, [reader]);
  const view = reader.view.value;
  return (
    <section ref={root} class="window aaron-blog-window" data-window="aaronBlog" aria-labelledby="aaron-blog-title">
      <StatusBar reader={reader} />
      <div class="window-pane aaron-blog-pane" data-view={view ?? undefined}>
        <div class="aaron-blog-shell" data-view="list">
          <Rail reader={reader} />
          <ListPane reader={reader} />
          <ArticlePane reader={reader} />
        </div>
      </div>
    </section>
  );
}
