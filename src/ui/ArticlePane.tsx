import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import type { Post } from "../data/types.ts";
import type { ArticleView, Reader } from "../reader/reader.ts";
import { safeHtml } from "../reader/safeHtml.ts";

/** The reading column. The reader owns its scroll position; the page only draws into it. */
export function ArticlePane({ reader }: { reader: Reader }) {
  const ref = useRef<HTMLElement>(null);
  const article = reader.article.value;
  const cite = reader.cited.value;

  useEffect(() => {
    const element = ref.current;
    reader.articleRef(element);
    if (!element) return;
    // A scroll saves the selection; the desk waits for nothing here.
    const onScroll = () => reader.scheduleUiSave();
    const onClick = (event: MouseEvent) => handleClick(reader, event);
    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("click", onClick);
      reader.articleRef(null);
    };
  }, [reader]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (article.kind === "post") element.scrollTop = article.scrollTop;
    else if (article.kind === "note") element.scrollTop = 0;
  }, [article]);

  useLayoutEffect(() => {
    if (cite) reader.applyCite();
  }, [cite, reader, article]);

  const bodyHtml = useMemo(() => (article.kind === "post" ? safeHtml(article.html) : ""), [article]);
  return (
    <article ref={ref} class="aaron-blog-article" data-blog-article="" tabindex={0}>
      {draw(article, reader, bodyHtml)}
    </article>
  );
}

function handleClick(reader: Reader, event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const back = target.closest("[data-blog-back]");
  if (back) {
    event.preventDefault();
    reader.back();
    return;
  }
  const ask = target.closest<HTMLElement>("[data-blog-ask]");
  if (ask) {
    event.preventDefault();
    void reader.askInSideAsk({ scope: ask.dataset.blogAsk === "post" ? "post" : "auto" });
    return;
  }
  const post = target.closest<HTMLElement>("[data-post-id]");
  if (post?.dataset.postId) {
    event.preventDefault();
    void reader.openPost(post.dataset.postId);
    return;
  }
  const tag = target.closest<HTMLElement>("[data-tag-slug]");
  if (tag?.dataset.tagSlug) {
    event.preventDefault();
    const item = reader.tagsBySlug.value.get(tag.dataset.tagSlug);
    if (item) reader.setFilter("tag", item.slug, item.name);
  }
}

function draw(article: ArticleView, reader: Reader, bodyHtml: string): JSX.Element {
  if (article.kind === "empty") {
    return (
      <div class="aaron-blog-empty">
        <strong>{reader.t("aaron_blog_welcome")}</strong>
        {reader.t("aaron_blog_welcome_hint")}
      </div>
    );
  }
  if (article.kind === "loading") {
    return (
      <div class="aaron-blog-article-inner">
        <ArticleHead reader={reader} post={article.post} ask={false} />
        <div class="aaron-blog-empty">{reader.t("aaron_blog_loading")}</div>
      </div>
    );
  }
  if (article.kind === "error") {
    return (
      <div class="aaron-blog-article-inner">
        <div class="aaron-blog-article-head">
          <BackButton reader={reader} />
        </div>
        <div class="aaron-blog-empty">
          <strong>{reader.t("aaron_blog_unavailable")}</strong>
          {article.message}
        </div>
      </div>
    );
  }
  if (article.kind === "note") {
    const note = article.note;
    return (
      <div class="aaron-blog-article-inner">
        <div class="aaron-blog-article-head">
          <BackButton reader={reader} />
          <time>{note.date}</time>
        </div>
        <div class="aaron-blog-article-body">
          <p>{note.text}</p>
          {note.link ? (
            <p>
              <a href={note.link} data-external="1" target="_blank" rel="noopener noreferrer">
                {`${note.host || note.link} ↗`}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div class="aaron-blog-article-inner">
      <ArticleHead reader={reader} post={article.post} ask />
      {/* The pack's own HTML, sanitized here; it is the only innerHTML the reader sets. */}
      <div class="aaron-blog-article-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <ArticleFoot reader={reader} post={article.post} />
    </div>
  );
}

function BackButton({ reader }: { reader: Reader }) {
  return (
    <button type="button" class="aaron-blog-back" data-blog-back="">
      {`← ${reader.t("aaron_blog_back")}`}
    </button>
  );
}

function ArticleHead({ reader, post, ask }: { reader: Reader; post: Post; ask: boolean }) {
  return (
    <div class="aaron-blog-article-head">
      <BackButton reader={reader} />
      <time>{post.date}</time>
      <span>{`${post.minutes} ${reader.t("aaron_blog_minutes")}`}</span>
      {ask ? (
        <button type="button" class="aaron-blog-ask" data-blog-ask="post">
          {reader.t("aaron_blog_ask_post")}
        </button>
      ) : null}
    </div>
  );
}

function ArticleFoot({ reader, post }: { reader: Reader; post: Post }) {
  // The tags are siblings of one text run, separated by a space, as the
  // stylesheet has always had them: not wrapped in another element.
  const tags: (JSX.Element | string)[] = [];
  post.tags.forEach((tag, index) => {
    if (index > 0) tags.push(" ");
    const item = [...reader.tagsBySlug.value.values()].find((entry) => entry.name === tag);
    const key = `${tag}-${index}`;
    tags.push(
      item ? (
        <a key={key} href={`#/tag/${item.slug}`} data-tag-slug={item.slug}>
          {`#${tag}`}
        </a>
      ) : (
        <span key={key}>{`#${tag}`}</span>
      ),
    );
  });
  return (
    <footer class="aaron-blog-article-foot">
      <span>{`${post.date} · ${post.minutes} ${reader.t("aaron_blog_minutes")}`}</span>
      <span class="aaron-blog-article-tags">{tags}</span>
      {post.origin ? (
        <a class="aaron-blog-origin" href={post.origin} data-external="1" target="_blank" rel="noopener noreferrer">
          {`${post.source || reader.t("aaron_blog_original")} ↗`}
        </a>
      ) : null}
      {post.diskUrl ? (
        <a class="aaron-blog-origin" href={post.diskUrl} data-external="1" target="_blank" rel="noopener noreferrer">
          {`${reader.t("aaron_blog_disk")} ↗`}
        </a>
      ) : null}
      {post.path ? (
        <a
          class="aaron-blog-origin"
          href={`https://aaronlau.me${post.path}`}
          data-blog-site=""
          data-external="1"
          target="_blank"
          rel="noopener noreferrer"
        >
          {`${reader.t("aaron_blog_on_site")} ↗`}
        </a>
      ) : null}
    </footer>
  );
}
