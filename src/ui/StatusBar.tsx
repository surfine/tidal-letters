import type { Reader } from "../reader/reader.ts";

/** The desk's status line for this window: the section, its count, and the two actions. */
export function StatusBar({ reader }: { reader: Reader }) {
  const syncing = reader.syncing.value;
  return (
    <div class="details-bar kit-status-bar compact-status-bar aaron-blog-status">
      <span class="status-bar-leading" data-blog-section-label="">
        {reader.sectionLabel.value}
      </span>
      <span class="status-bar-context" data-blog-count="">
        {reader.countText.value}
      </span>
      <span class="status-bar-trailing">
        <button
          type="button"
          class="aaron-blog-status-sync"
          data-blog-ask="auto"
          onClick={() => void reader.askInSideAsk({ scope: "auto" })}
        >
          {reader.t("aaron_blog_ask")}
        </button>{" "}
        <button
          type="button"
          class="aaron-blog-status-sync"
          data-blog-sync=""
          disabled={syncing}
          onClick={() => void reader.sync(true)}
        >
          {syncing ? reader.t("aaron_blog_syncing") : reader.t("refresh")}
        </button>
      </span>
    </div>
  );
}
