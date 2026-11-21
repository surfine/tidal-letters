import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { filterLabel, type ListBody, type Row } from "../reader/logic.ts";
import type { Reader } from "../reader/reader.ts";

/** The middle column: the search field, the active filter and the list itself. */
export function ListPane({ reader }: { reader: Reader }) {
  return (
    <section class="aaron-blog-list-pane">
      <div class="aaron-blog-list-head">
        {/*
          The page's one typing surface. It is created once, here, and after
          that only its value and caret are read or written: no value prop, no
          key, and no branch that would rebuild it (desk IME ruling).
        */}
        <input
          ref={reader.searchRef}
          type="search"
          data-blog-search=""
          placeholder={reader.t("aaron_blog_search_placeholder")}
          aria-label={reader.t("aaron_blog_search")}
          onInput={(event) => reader.typeQuery(event.currentTarget.value)}
        />
      </div>
      <div class="aaron-blog-context" data-blog-context="">
        <ContextLabel reader={reader} />
      </div>
      <ListRows reader={reader} />
    </section>
  );
}

function ContextLabel({ reader }: { reader: Reader }) {
  const label = filterLabel(reader.filter.value);
  if (!label) return null;
  return (
    <>
      <strong>{label}</strong>
      <button type="button" data-blog-clear-filter="" onClick={() => reader.clearFilter()}>
        {reader.t("aaron_blog_clear")}
      </button>
    </>
  );
}

function ListRows({ reader }: { reader: Reader }) {
  const body = reader.listBody.value;
  const selectedId = reader.selectedId.value;
  const selectedKind = reader.selectedKind.value;
  const ref = useRef<HTMLDivElement>(null);
  // A query typed before the search pack was read leaves the list saying
  // "Searching…"; that state is what asks for the pack, as the render path
  // used to.
  useEffect(() => {
    if (body.kind === "searching") void reader.loadSearch();
  }, [body.kind, reader]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // One listener for the whole list, as the page has always had: the rows
    // are redrawn constantly and must not carry a listener each.
    const listener = (event: MouseEvent) => handleClick(reader, event);
    element.addEventListener("click", listener);
    return () => element.removeEventListener("click", listener);
  }, [reader]);
  return (
    <div ref={ref} class="aaron-blog-list" data-blog-list="">
      {draw(body, reader, selectedId, selectedKind)}
    </div>
  );
}

function handleClick(reader: Reader, event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const more = target.closest("[data-blog-more]");
  if (more) {
    reader.loadMore();
    return;
  }
  const note = target.closest<HTMLElement>("[data-note-id]");
  if (note?.dataset.noteId) {
    reader.openNote(note.dataset.noteId);
    return;
  }
  const post = target.closest<HTMLElement>("[data-post-id]");
  if (post?.dataset.postId) {
    void reader.openPost(post.dataset.postId);
    return;
  }
  const tag = target.closest<HTMLElement>("[data-filter-tag]");
  if (tag?.dataset.filterTag) {
    reader.setFilter("tag", tag.dataset.filterTag, tag.dataset.filterName ?? "");
    return;
  }
  const year = target.closest<HTMLElement>("[data-filter-year]");
  if (year?.dataset.filterYear) {
    reader.setFilter("year", year.dataset.filterYear);
    return;
  }
  const series = target.closest<HTMLElement>("[data-filter-series]");
  if (series?.dataset.filterSeries) reader.setFilter("series", series.dataset.filterSeries);
}

function draw(body: ListBody, reader: Reader, selectedId: string | null, selectedKind: "post" | "note"): JSX.Element {
  if (body.kind === "loading") {
    return (
      <div class="aaron-blog-empty">
        <strong>{reader.t("aaron_blog_loading")}</strong>
        {reader.t("aaron_blog_loading_detail")}
      </div>
    );
  }
  if (body.kind === "searching") {
    return (
      <div class="aaron-blog-empty">
        <strong>{reader.t("aaron_blog_searching")}</strong>
      </div>
    );
  }
  if (body.kind === "message") {
    return (
      <div class="aaron-blog-empty">
        <strong>{reader.t(body.title)}</strong>
        {body.detail ? reader.t(body.detail) : null}
      </div>
    );
  }
  if (body.kind === "tags") {
    return (
      <div class="aaron-blog-tag-list">
        {body.tags.map((tag) => (
          <button key={tag.slug} type="button" data-filter-tag={tag.slug} data-filter-name={tag.name}>
            <span>{`#${tag.name}`}</span>
            <span class="count">{tag.count}</span>
          </button>
        ))}
      </div>
    );
  }
  if (body.kind === "years") {
    return (
      <div class="aaron-blog-year-list">
        {body.years.map(([year, count]) => (
          <button key={year} type="button" data-filter-year={year}>
            <span>{year}</span>
            <span class="count">{count}</span>
          </button>
        ))}
      </div>
    );
  }
  if (body.kind === "series") {
    return (
      <div class="aaron-blog-series-list">
        {body.series.map((series) => (
          <button key={series.name} type="button" data-filter-series={series.name}>
            <span>{series.name}</span>
            <span class="count">{series.count}</span>
          </button>
        ))}
      </div>
    );
  }
  if (body.kind === "groups") {
    return (
      <>
        {body.groups.map((group) => (
          <section key={group.name} class="aaron-blog-group">
            <h3>{group.name}</h3>
            {group.rows.map((row) => (
              <RowButton key={row.id} row={row} selected={selectedId === row.id && selectedKind === row.kind} />
            ))}
          </section>
        ))}
      </>
    );
  }
  return (
    <>
      {body.rows.map((row) => (
        <RowButton key={row.id} row={row} selected={selectedId === row.id && selectedKind === row.kind} />
      ))}
      {body.more ? (
        <button type="button" class="aaron-blog-more" data-blog-more="">
          {reader.t("aaron_blog_more")}
        </button>
      ) : null}
    </>
  );
}

function RowButton({ row, selected }: { row: Row; selected: boolean }) {
  const current = selected ? "true" : "false";
  if (row.kind === "note") {
    return (
      <button type="button" class="aaron-blog-row" data-note-id={row.id} aria-current={current}>
        <time>{row.date}</time>
        <span class="aaron-blog-row-title">{row.title}</span>
        <span class="aaron-blog-row-tags">{row.tags}</span>
      </button>
    );
  }
  return (
    <button type="button" class="aaron-blog-row" data-post-id={row.id} aria-current={current}>
      <time>{row.date}</time>
      <span class="aaron-blog-row-title">{row.title}</span>
      <span class="aaron-blog-row-tags">{row.tags}</span>
    </button>
  );
}
