/**
 * 日记三套全屏主题视图：
 * - journal: 纸质手账（书桌铺展、暖纸衬线、时间轴、朱砂印章）
 * - terminal: 开发者终端（100vh 全屏 IDE 双栏工作台、月度分组目录、底部状态栏）
 * - magazine: 彩色杂志（全屏弥散光画廊、悬浮毛玻璃胶囊栏、宽幅网格索引）
 */
import Markdown from "./Markdown";
import {
  Button,
  Input,
  Textarea,
  Callout,
  Tag,
  Loading,
  EditorTabs,
} from "./ui";
import {
  DiaryThemeSwitcher,
  MonthQuickBar,
  countDiaryStats,
  getTimeGreeting,
  type DiaryThemeKey,
  type TransitionOrigin,
} from "./DiaryChrome";
import type { Document, Entry, Metadata } from "./types";
import "./diary-themes.css";

export { type DiaryThemeKey, isDiaryTheme } from "./DiaryChrome";

export type DiaryFilters = {
  q: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
  page: number;
};

export type DiaryViewProps = {
  route: { view: string; id: string };
  filters: DiaryFilters;
  emptyFilters: DiaryFilters;
  search: string;
  setSearch: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  activeFilters: number;
  updateFilters: (u: Partial<DiaryFilters>, push?: boolean) => void;
  items: Metadata[];
  total: number;
  loading: boolean;
  listLoading: boolean;
  error: string;
  notice: string;
  busy: boolean;
  uncertain: boolean;
  conflict: boolean;
  dirty: boolean;
  entry: Entry | null;
  document: Document;
  setDocument: (d: Document) => void;
  tags: string;
  setTags: (t: string) => void;
  preview: boolean;
  setPreview: (v: boolean) => void;
  displayed: Document;
  dark: boolean;
  diaryTheme: DiaryThemeKey;
  setDarkMode: (dark: boolean, origin?: TransitionOrigin) => void;
  setThemeStyle: (theme: DiaryThemeKey, origin?: TransitionOrigin) => void;
  returnToBlog: () => void;
  zenMode: boolean;
  setZenMode: (v: boolean) => void;
  openPalette: () => void;
  logout: () => void;
  navigate: (url: string, replace?: boolean) => void;
  goBack: () => void;
  save: () => void;
  setDeleteTarget: (t: Metadata | Entry | null) => void;
  reloadLatest: () => void;
  retryLoad: () => void;
  copyMarkdown: () => void;
  timestamp: (s: string) => string;
};

function hasActiveFilters(filters: DiaryFilters): boolean {
  return Object.entries(filters).some(([k, v]) => k !== "page" && v);
}

function ErrorBanner({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";
  if (!p.error) return null;
  return (
    <Callout class="diary-error">
      {p.error}
      {!editing && <Button onClick={p.retryLoad}>重试</Button>}
    </Callout>
  );
}

function ConflictBanner({ p }: { p: DiaryViewProps }) {
  if (!p.conflict) return null;
  return (
    <Callout variant="warning" class="diary-conflict">
      <p>请先复制当前输入，再载入最新版本进行合并。</p>
      <Button onClick={p.copyMarkdown}>复制正文</Button>
      <Button onClick={p.reloadLatest}>载入最新版本</Button>
    </Callout>
  );
}

function EditorForm({
  p,
  split,
}: {
  p: DiaryViewProps;
  split?: boolean;
}) {
  const statusText =
    p.notice ||
    (p.dirty
      ? "未保存"
      : p.entry
      ? `已保存于 ${p.timestamp(p.entry.updatedAt)}`
      : "尚未保存");
  const stats = countDiaryStats(p.document.contentMarkdown);

  return (
    <>
      {p.zenMode ? (
        <div class="diary-zen-bar">
          <div class="diary-zen-bar-left">
            <span class="diary-muted" role="status">
              {statusText}
            </span>
            <span class="diary-editor-stats">
              {stats.words} 字 · {stats.lines} 行 · 约 {stats.minutes} 分钟阅读
            </span>
          </div>
          <div class="diary-zen-bar-right">
            <button
              type="button"
              class="diary-subtle-btn"
              onClick={() => p.setZenMode(false)}
            >
              退出专注 (Esc)
            </button>
            <Button
              class="diary-primary"
              disabled={p.busy || p.conflict}
              loading={p.busy}
              onClick={p.save}
            >
              {p.busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      ) : (
        <div class="diary-toolbar">
          <div class="diary-toolbar-title">
            <h2>{p.route.view === "new" ? "写日记" : "编辑日记"}</h2>
            <span class="diary-editor-stats">
              {stats.words} 字 · {stats.lines} 行 · 约 {stats.minutes} 分钟阅读
            </span>
          </div>
          <div class="diary-toolbar-right">
            <span class="diary-muted" role="status">
              {statusText}
            </span>
            <button
              type="button"
              class="diary-subtle-btn"
              onClick={() => p.setZenMode(true)}
            >
              专注模式
            </button>
          </div>
        </div>
      )}
      <ConflictBanner p={p} />
      <fieldset disabled={p.busy || p.uncertain} class="diary-editor-fields">
        <div class="diary-panel">
          <Input
            label="标题"
            value={p.document.title}
            maxLength={100}
            placeholder="给今天起个标题"
            onInput={(e) =>
              p.setDocument({ ...p.document, title: e.currentTarget.value })
            }
          />
          <div class="diary-editor-meta">
            <Input
              label="日记日期"
              type="date"
              value={p.document.diaryDate}
              onChange={(e) =>
                p.setDocument({
                  ...p.document,
                  diaryDate: e.currentTarget.value,
                })
              }
            />
            <Input
              label="标签"
              value={p.tags}
              placeholder="逗号分隔，最多 10 个"
              onInput={(e) => p.setTags(e.currentTarget.value)}
            />
          </div>
        </div>
        {split ? (
          <div class="var-b-split-edit">
            <div class="diary-panel">
              <Textarea
                label="正文（Markdown）"
                rows={20}
                disabled={p.busy || p.uncertain}
                value={p.document.contentMarkdown}
                placeholder="今天发生了什么？"
                onInput={(e) =>
                  p.setDocument({
                    ...p.document,
                    contentMarkdown: e.currentTarget.value,
                  })
                }
              />
            </div>
            <div class="diary-panel">
              <p class="diary-muted" style={{ marginTop: 0 }}>
                实时预览
              </p>
              <Markdown content={p.document.contentMarkdown} />
            </div>
          </div>
        ) : (
          <EditorTabs
            preview={p.preview}
            onChange={p.setPreview}
            editor={
              <div class="diary-panel">
                <Textarea
                  label="正文"
                  rows={20}
                  disabled={p.busy || p.uncertain}
                  value={p.document.contentMarkdown}
                  placeholder="今天发生了什么？"
                  onInput={(e) =>
                    p.setDocument({
                      ...p.document,
                      contentMarkdown: e.currentTarget.value,
                    })
                  }
                />
              </div>
            }
            reader={
              <div class="diary-panel">
                {p.preview && <Markdown content={p.document.contentMarkdown} />}
              </div>
            }
          />
        )}
      </fieldset>
      <div class="diary-actions diary-save-actions">
        <Button
          class="diary-primary"
          disabled={p.busy || p.conflict}
          loading={p.busy}
          onClick={p.save}
        >
          {p.busy
            ? "保存中…"
            : p.uncertain
            ? "核对并重试原操作"
            : "保存"}
        </Button>
      </div>
    </>
  );
}

function Pagination({ p }: { p: DiaryViewProps }) {
  if (p.total <= 20) return null;
  return (
    <div class="diary-pagination">
      <Button
        disabled={p.filters.page <= 1 || p.listLoading}
        onClick={() => p.updateFilters({ page: p.filters.page - 1 }, true)}
      >
        上一页
      </Button>
      <span>
        {p.filters.page} / {Math.ceil(p.total / 20)}
      </span>
      <Button
        disabled={p.filters.page * 20 >= p.total || p.listLoading}
        onClick={() => p.updateFilters({ page: p.filters.page + 1 }, true)}
      >
        下一页
      </Button>
    </div>
  );
}

function groupByMonth(items: Metadata[]) {
  const groups: Array<{ ym: string; items: Metadata[] }> = [];
  for (const item of items) {
    const ym = item.diaryDate ? item.diaryDate.slice(0, 7) : "未归档";
    const last = groups[groups.length - 1];
    if (last && last.ym === ym) {
      last.items.push(item);
    } else {
      groups.push({ ym, items: [item] });
    }
  }
  return groups;
}

/* =========================================================================
   Theme 1: 纸质手账 (JournalView)
   ========================================================================= */
export function JournalView({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";
  const greeting = getTimeGreeting();
  const readStats = countDiaryStats(p.displayed.contentMarkdown);

  return (
    <div class="var-a">
      {!p.zenMode && (
        <header class="var-a-chrome">
          <div class="var-a-chrome-left">
            <button
              type="button"
              class="diary-back-blog"
              onClick={p.returnToBlog}
            >
              ← 返回博客
            </button>
            <span class="var-a-desk-label">PRIVATE JOURNAL</span>
          </div>
          <div class="var-a-chrome-right">
            <button
              type="button"
              class="diary-kbd-btn"
              onClick={p.openPalette}
              title="打开快捷命令面板"
            >
              ⌘K
            </button>
            <DiaryThemeSwitcher
              dark={p.dark}
              diaryTheme={p.diaryTheme}
              onSetDark={p.setDarkMode}
              onSetTheme={p.setThemeStyle}
            />
            {p.route.view === "list" && (
              <Button
                class="diary-primary"
                disabled={p.busy || p.uncertain}
                onClick={() =>
                  p.navigate(`/diary/?view=new&id=${crypto.randomUUID()}`)
                }
              >
                写日记
              </Button>
            )}
            <Button disabled={p.busy} onClick={p.logout}>
              锁定离开
            </Button>
          </div>
        </header>
      )}

      <div class="var-a-sheet-wrap">
        <span class="var-a-bookmark" aria-hidden="true" />
        <div class="var-a-top">
          <div>
            <p class="diary-eyebrow">PRIVATE JOURNAL</p>
            <h1>私人日记</h1>
            {p.route.view === "list" && (
              <p class="var-a-greeting">
                {greeting.title} · {greeting.subtitle}
              </p>
            )}
          </div>
          <div class="var-a-top-actions">
            {p.route.view === "list" && (
              <span class="diary-muted">共 {p.total} 篇</span>
            )}
          </div>
        </div>

        <ErrorBanner p={p} />

        {p.route.view === "list" ? (
          <>
            <form
              class="var-a-searchbar"
              onSubmit={(e) => {
                e.preventDefault();
                p.updateFilters({ q: p.search });
              }}
            >
              <Input
                class="diary-search-input"
                label="搜索"
                type="search"
                placeholder="搜索标题、标签或正文…"
                maxLength={100}
                value={p.search}
                onInput={(e) => p.setSearch(e.currentTarget.value)}
              />
              <Button
                type="button"
                onClick={() => p.setShowFilters(!p.showFilters)}
              >
                筛选{p.activeFilters > 0 ? ` (${p.activeFilters})` : ""}
              </Button>
            </form>

            <MonthQuickBar
              items={p.items}
              dateFrom={p.filters.dateFrom}
              dateTo={p.filters.dateTo}
              onSelectRange={(dateFrom, dateTo) =>
                p.updateFilters({ dateFrom, dateTo })
              }
            />

            {p.showFilters && (
              <div class="var-a-drawer">
                <Input
                  label="标签"
                  placeholder="精确标签"
                  maxLength={20}
                  value={p.filters.tag}
                  onInput={(e) =>
                    p.updateFilters({ tag: e.currentTarget.value })
                  }
                />
                <Input
                  label="开始日期"
                  type="date"
                  value={p.filters.dateFrom}
                  onChange={(e) =>
                    p.updateFilters({ dateFrom: e.currentTarget.value })
                  }
                />
                <Input
                  label="结束日期"
                  type="date"
                  value={p.filters.dateTo}
                  onChange={(e) =>
                    p.updateFilters({ dateTo: e.currentTarget.value })
                  }
                />
                <Button
                  type="button"
                  onClick={() => {
                    p.setSearch("");
                    p.updateFilters(p.emptyFilters);
                  }}
                >
                  清除
                </Button>
              </div>
            )}

            {p.listLoading ? (
              <Loading>正在加载日记…</Loading>
            ) : !p.items.length && !p.error ? (
              <div class="diary-empty diary-panel">
                <h3>
                  {hasActiveFilters(p.filters)
                    ? "没有匹配结果"
                    : "写下第一篇日记"}
                </h3>
                <p class="diary-muted">
                  {p.total ? "试试其他筛选条件。" : "从今天的一件小事开始。"}
                </p>
              </div>
            ) : (
              <div class="var-a-timeline">
                {p.items.map((item) => (
                  <article key={item.id} class="var-a-item">
                    <div class="var-a-meta">
                      <span>{item.diaryDate}</span>
                      <div class="var-a-inline-actions">
                        <Button
                          onClick={() =>
                            p.navigate(`/diary/?view=edit&id=${item.id}`)
                          }
                        >
                          编辑
                        </Button>
                        <Button
                          class="diary-danger"
                          disabled={p.busy}
                          onClick={() => p.setDeleteTarget(item)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                    <h3 class="var-a-title">
                      <a
                        href={`/diary/?view=read&id=${item.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          p.navigate(e.currentTarget.getAttribute("href")!);
                        }}
                      >
                        {item.title}
                      </a>
                    </h3>
                    <p class="var-a-excerpt">{item.excerpt}</p>
                    {item.tags?.length ? (
                      <div class="diary-tags">
                        {item.tags.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
            <Pagination p={p} />
          </>
        ) : (
          <div class="var-a-sheet">
            {!p.zenMode && (
              <div class="var-a-sheet-bar">
                <Button disabled={p.busy} onClick={p.goBack}>
                  ← 返回
                </Button>
                {p.route.view === "read" && p.entry && (
                  <div class="var-a-top-actions">
                    <Button
                      onClick={() =>
                        p.navigate(`/diary/?view=edit&id=${p.entry!.id}`)
                      }
                    >
                      编辑
                    </Button>
                    <Button
                      class="diary-danger"
                      onClick={() => p.setDeleteTarget(p.entry)}
                    >
                      删除
                    </Button>
                  </div>
                )}
              </div>
            )}
            {p.loading ? (
              <Loading>正在加载…</Loading>
            ) : editing && (p.route.view === "new" || p.entry) ? (
              <EditorForm p={p} />
            ) : p.entry ? (
              <article>
                <div class="diary-reader-meta">
                  <span>{p.displayed.diaryDate}</span>
                  <span>
                    约 {readStats.minutes} 分钟阅读 · {readStats.words} 字
                  </span>
                </div>
                <h2 class="var-a-sheet-title">{p.displayed.title}</h2>
                <div class="diary-tags">
                  {p.displayed.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
                <Markdown content={p.displayed.contentMarkdown} />
              </article>
            ) : !p.error ? (
              <p>日记不存在。</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   Theme 2: 开发者终端 (TerminalView)
   ========================================================================= */
export function TerminalView({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";
  const isDetail = p.route.view !== "list";
  const greeting = getTimeGreeting();
  const activeMarkdown = editing
    ? p.document.contentMarkdown
    : p.entry
    ? p.displayed.contentMarkdown
    : "";
  const stats = countDiaryStats(activeMarkdown);
  const groupedItems = groupByMonth(p.items);
  const breadcrumbName =
    p.route.view === "list"
      ? "index"
      : p.route.view === "new"
      ? `${p.document.diaryDate || "draft"}-new.md`
      : `${p.displayed.diaryDate || "entry"}-${(p.displayed.title || "untitled")
          .slice(0, 18)
          .replace(/\s+/g, "-")}.md`;

  const saveIndicator = p.busy
    ? "SYNCING"
    : editing
    ? p.dirty
      ? "MODIFIED"
      : "SAVED"
    : "READY";

  return (
    <div class="var-b">
      {!p.zenMode && (
        <header class="var-b-topbar">
          <div class="var-b-topbar-left">
            <span class="var-b-traffic" aria-hidden="true">
              <i class="is-red" />
              <i class="is-yellow" />
              <i class="is-green" />
            </span>
            <button
              type="button"
              class="var-b-exit-link"
              onClick={p.returnToBlog}
            >
              ← blog
            </button>
            <span class="var-b-path" title={`~/diary/${breadcrumbName}`}>
              ~/diary/{breadcrumbName}
            </span>
          </div>
          <div class="var-b-topbar-right">
            <button
              type="button"
              class="diary-kbd-btn"
              onClick={p.openPalette}
              title="快捷命令面板 (⌘K)"
            >
              ⌘K
            </button>
            <DiaryThemeSwitcher
              compact
              dark={p.dark}
              diaryTheme={p.diaryTheme}
              onSetDark={p.setDarkMode}
              onSetTheme={p.setThemeStyle}
            />
            <Button
              class="diary-primary"
              disabled={p.busy || p.uncertain}
              onClick={() =>
                p.navigate(`/diary/?view=new&id=${crypto.randomUUID()}`)
              }
            >
              + 新建
            </Button>
            <Button disabled={p.busy} onClick={p.logout}>
              锁定
            </Button>
          </div>
        </header>
      )}

      <div class={`var-b-shell${isDetail ? " is-detail" : ""}`}>
        {!p.zenMode && (
          <aside class="var-b-sidebar">
            <div class="var-b-side-head">
              <h2>
                目录 ({p.listLoading && !p.items.length ? "…" : p.total})
              </h2>
              <Button
                type="button"
                onClick={() => p.setShowFilters(!p.showFilters)}
              >
                筛选{p.activeFilters > 0 ? ` (${p.activeFilters})` : ""}
              </Button>
            </div>
            <Input
              class="diary-search-input"
              label="关键词"
              type="search"
              placeholder="快速过滤…"
              maxLength={100}
              value={p.search}
              onInput={(e) => p.setSearch(e.currentTarget.value)}
            />
            {p.showFilters && (
              <div class="var-b-side-filters">
                <Input
                  label="标签"
                  placeholder="精确标签"
                  maxLength={20}
                  value={p.filters.tag}
                  onInput={(e) =>
                    p.updateFilters({ tag: e.currentTarget.value })
                  }
                />
                <Input
                  label="开始日期"
                  type="date"
                  value={p.filters.dateFrom}
                  onChange={(e) =>
                    p.updateFilters({ dateFrom: e.currentTarget.value })
                  }
                />
                <Input
                  label="结束日期"
                  type="date"
                  value={p.filters.dateTo}
                  onChange={(e) =>
                    p.updateFilters({ dateTo: e.currentTarget.value })
                  }
                />
                <Button
                  type="button"
                  onClick={() => {
                    p.setSearch("");
                    p.updateFilters(p.emptyFilters);
                  }}
                >
                  清除筛选
                </Button>
              </div>
            )}

            <div class="var-b-side-list">
              {p.listLoading && !p.items.length ? (
                <Loading>正在加载…</Loading>
              ) : !p.items.length ? (
                <p class="var-b-side-empty">
                  {hasActiveFilters(p.filters) ? "没有匹配结果" : "暂无日记"}
                </p>
              ) : (
                groupedItems.map((group) => (
                  <div key={group.ym} class="var-b-group">
                    <div class="var-b-group-head">▸ {group.ym}</div>
                    {group.items.map((item) => (
                      <a
                        key={item.id}
                        href={`/diary/?view=read&id=${item.id}`}
                        class={`var-b-row${
                          p.route.id === item.id ? " is-active" : ""
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          p.navigate(e.currentTarget.getAttribute("href")!);
                        }}
                      >
                        <div class="var-b-row-title">{item.title}</div>
                        <div class="var-b-row-sub">
                          <span>{item.diaryDate}</span>
                          <span>{item.tags?.slice(0, 2).join(" · ")}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ))
              )}
            </div>
            <Pagination p={p} />
          </aside>
        )}

        <section class="var-b-main">
          <ErrorBanner p={p} />

          {p.route.view === "list" ? (
            <div class="var-b-welcome">
              <p class="diary-eyebrow">WORKBENCH READY</p>
              <h2>
                {greeting.title} · {greeting.subtitle}
              </h2>
              <p class="diary-muted">
                从左侧目录选择一篇日记，或使用快捷键快速开始。当前共收录{" "}
                {p.total} 篇。
              </p>
              <div class="var-b-welcome-actions">
                <Button
                  class="diary-primary"
                  disabled={p.busy || p.uncertain}
                  onClick={() =>
                    p.navigate(`/diary/?view=new&id=${crypto.randomUUID()}`)
                  }
                >
                  + 写一篇新日记
                </Button>
                <button
                  type="button"
                  class="diary-subtle-btn"
                  onClick={p.openPalette}
                >
                  ⌘K 命令面板
                </button>
              </div>
              {p.items.length > 0 && (
                <div class="var-b-recent">
                  <p class="var-b-recent-title">RECENT ENTRIES</p>
                  <div class="var-b-recent-grid">
                    {p.items.slice(0, 4).map((item) => (
                      <a
                        key={item.id}
                        href={`/diary/?view=read&id=${item.id}`}
                        class="var-b-recent-card"
                        onClick={(e) => {
                          e.preventDefault();
                          p.navigate(e.currentTarget.getAttribute("href")!);
                        }}
                      >
                        <span class="var-b-recent-date">{item.diaryDate}</span>
                        <strong>{item.title}</strong>
                        <small>{item.excerpt || "（无摘要）"}</small>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {!p.zenMode && (
                <div class="var-a-sheet-bar">
                  <Button disabled={p.busy} onClick={p.goBack}>
                    ← 返回
                  </Button>
                  {p.route.view === "read" && p.entry && (
                    <div class="var-a-top-actions">
                      <Button
                        onClick={() =>
                          p.navigate(`/diary/?view=edit&id=${p.entry!.id}`)
                        }
                      >
                        编辑
                      </Button>
                      <Button
                        class="diary-danger"
                        onClick={() => p.setDeleteTarget(p.entry)}
                      >
                        删除
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {p.loading ? (
                <Loading>正在加载…</Loading>
              ) : editing && (p.route.view === "new" || p.entry) ? (
                <EditorForm p={p} split />
              ) : p.entry ? (
                <article class="diary-reader">
                  <div class="diary-reader-meta">
                    <span>{p.displayed.diaryDate}</span>
                    <span>
                      约 {stats.minutes} 分钟阅读 · {stats.words} 字
                    </span>
                  </div>
                  <h2>{p.displayed.title}</h2>
                  <div class="diary-tags">
                    {p.displayed.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                  <Markdown content={p.displayed.contentMarkdown} />
                </article>
              ) : !p.error ? (
                <p>日记不存在。</p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <footer class="var-b-statusbar">
        <div class="var-b-status-left">
          <span class="var-b-status-badge">✦ PRIVATE</span>
          <span>
            {p.zenMode
              ? "ZEN"
              : p.route.view === "list"
              ? "INDEX"
              : editing
              ? "EDIT"
              : "READ"}
          </span>
          <span class={`var-b-status-state is-${saveIndicator.toLowerCase()}`}>
            {saveIndicator}
          </span>
        </div>
        <div class="var-b-status-right">
          <span>
            {editing || (p.route.view === "read" && p.entry)
              ? `${stats.words} 字 · ${stats.lines} 行 · 约 ${stats.minutes}m`
              : `${p.total} entries`}
          </span>
          <button
            type="button"
            class="var-b-status-btn"
            onClick={p.openPalette}
          >
            ⌘K 命令
          </button>
          <span class="var-b-status-hint">⌘S 保存</span>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================================
   Theme 3: 彩色杂志 (MagazineView)
   ========================================================================= */
export function MagazineView({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";
  const greeting = getTimeGreeting();
  const readStats = countDiaryStats(p.displayed.contentMarkdown);

  return (
    <div class="var-c">
      {!p.zenMode && (
        <header class="var-c-cmdbar">
          <div class="var-c-brand">
            <button
              type="button"
              class="diary-back-blog"
              onClick={p.returnToBlog}
            >
              ← 返回博客
            </button>
            <h1>私人日记</h1>
            <span class="var-c-count">
              {p.listLoading ? "…" : `${p.total} 篇`}
            </span>
          </div>

          {p.route.view === "list" && (
            <form
              class="var-c-cmd-search"
              onSubmit={(e) => {
                e.preventDefault();
                p.updateFilters({ q: p.search });
              }}
            >
              <Input
                class="diary-search-input"
                label=""
                placeholder="搜索标题、标签或正文"
                maxLength={100}
                value={p.search}
                onInput={(e) => p.setSearch(e.currentTarget.value)}
              />
            </form>
          )}

          <div class="var-c-cmd-actions">
            {p.route.view === "list" && (
              <Button
                type="button"
                onClick={() => p.setShowFilters(!p.showFilters)}
              >
                筛选{p.activeFilters > 0 ? ` (${p.activeFilters})` : ""}
              </Button>
            )}
            <button
              type="button"
              class="diary-kbd-btn"
              onClick={p.openPalette}
              title="打开快捷命令面板"
            >
              ⌘K
            </button>
            <DiaryThemeSwitcher
              dark={p.dark}
              diaryTheme={p.diaryTheme}
              onSetDark={p.setDarkMode}
              onSetTheme={p.setThemeStyle}
            />
            <Button
              class="diary-primary"
              disabled={p.busy || p.uncertain}
              onClick={() =>
                p.navigate(`/diary/?view=new&id=${crypto.randomUUID()}`)
              }
            >
              写日记
            </Button>
            <Button disabled={p.busy} onClick={p.logout}>
              锁定离开
            </Button>
          </div>
        </header>
      )}

      <div class="var-c-content">
        <ErrorBanner p={p} />

        {p.route.view === "list" ? (
          <>
            <div class="var-c-hero">
              <p class="diary-eyebrow">EDITORIAL ARCHIVE</p>
              <p class="var-c-greeting">
                {greeting.title} — {greeting.subtitle}
              </p>
            </div>

            <MonthQuickBar
              items={p.items}
              dateFrom={p.filters.dateFrom}
              dateTo={p.filters.dateTo}
              onSelectRange={(dateFrom, dateTo) =>
                p.updateFilters({ dateFrom, dateTo })
              }
            />

            {p.showFilters && (
              <div class="var-a-drawer">
                <Input
                  label="标签"
                  placeholder="精确标签"
                  maxLength={20}
                  value={p.filters.tag}
                  onInput={(e) =>
                    p.updateFilters({ tag: e.currentTarget.value })
                  }
                />
                <Input
                  label="开始日期"
                  type="date"
                  value={p.filters.dateFrom}
                  onChange={(e) =>
                    p.updateFilters({ dateFrom: e.currentTarget.value })
                  }
                />
                <Input
                  label="结束日期"
                  type="date"
                  value={p.filters.dateTo}
                  onChange={(e) =>
                    p.updateFilters({ dateTo: e.currentTarget.value })
                  }
                />
                <Button
                  type="button"
                  onClick={() => {
                    p.setSearch("");
                    p.updateFilters(p.emptyFilters);
                  }}
                >
                  清除筛选
                </Button>
              </div>
            )}

            {p.listLoading ? (
              <Loading>正在加载日记…</Loading>
            ) : !p.items.length && !p.error ? (
              <div class="diary-empty diary-panel">
                <h3>
                  {hasActiveFilters(p.filters)
                    ? "没有匹配结果"
                    : "写下第一篇日记"}
                </h3>
                <p class="diary-muted">
                  {p.total ? "试试其他筛选条件。" : "从今天的一件小事开始。"}
                </p>
              </div>
            ) : (
              <div class="var-c-grid">
                {p.items.map((item) => (
                  <article key={item.id} class="var-c-card">
                    <div>
                      <div class="var-c-date">
                        <b>{item.diaryDate.slice(8, 10)}</b>
                        <span>
                          {item.diaryDate.slice(0, 4)} 年
                          <br />
                          {item.diaryDate.slice(5, 7)} 月
                        </span>
                      </div>
                      <h3>
                        <a
                          href={`/diary/?view=read&id=${item.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            p.navigate(e.currentTarget.getAttribute("href")!);
                          }}
                        >
                          {item.title}
                        </a>
                      </h3>
                      <p class="diary-excerpt">{item.excerpt}</p>
                      <div class="diary-tags">
                        {item.tags?.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </div>
                    </div>
                    <div class="var-c-card-foot">
                      <small class="diary-muted">
                        {p.timestamp(item.updatedAt)}
                      </small>
                      <div class="var-a-top-actions">
                        <Button
                          onClick={() =>
                            p.navigate(`/diary/?view=edit&id=${item.id}`)
                          }
                        >
                          编辑
                        </Button>
                        <Button
                          class="diary-danger"
                          disabled={p.busy}
                          onClick={() => p.setDeleteTarget(item)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <Pagination p={p} />
          </>
        ) : (
          <div class="var-c-focus">
            {!p.zenMode && (
              <div class="var-a-sheet-bar">
                <Button disabled={p.busy} onClick={p.goBack}>
                  ← 返回
                </Button>
                {p.route.view === "read" && p.entry && (
                  <div class="var-a-top-actions">
                    <Button
                      onClick={() =>
                        p.navigate(`/diary/?view=edit&id=${p.entry!.id}`)
                      }
                    >
                      编辑
                    </Button>
                    <Button
                      class="diary-danger"
                      onClick={() => p.setDeleteTarget(p.entry)}
                    >
                      删除
                    </Button>
                  </div>
                )}
              </div>
            )}

            {p.loading ? (
              <Loading>正在加载…</Loading>
            ) : editing && (p.route.view === "new" || p.entry) ? (
              <EditorForm p={p} />
            ) : p.entry ? (
              <article class="diary-panel diary-reader">
                <div class="diary-reader-meta">
                  <span>{p.displayed.diaryDate}</span>
                  <span>
                    约 {readStats.minutes} 分钟阅读 · {readStats.words} 字
                  </span>
                </div>
                <h2>{p.displayed.title}</h2>
                <div class="diary-tags">
                  {p.displayed.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
                <Markdown content={p.displayed.contentMarkdown} />
              </article>
            ) : !p.error ? (
              <p>日记不存在。</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
