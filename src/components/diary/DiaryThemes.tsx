/**
 * 日记三套主题视图：
 * - journal: 纸质手账（暖纸衬线、时间轴、单栏专注阅读）
 * - terminal: 开发者终端（深色等宽、双栏工作台、分屏实时预览）
 * - magazine: 彩色杂志（渐变玻璃卡片、网格索引、大号日期）
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
import type { Document, Entry, Metadata } from "./types";
import "./diary-themes.css";

export type DiaryThemeKey = "journal" | "terminal" | "magazine";

export function isDiaryTheme(v: string | null | undefined): v is DiaryThemeKey {
  return v === "journal" || v === "terminal" || v === "magazine";
}

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

  return (
    <>
      <div class="diary-toolbar">
        <h2>{p.route.view === "new" ? "写日记" : "编辑日记"}</h2>
        <span class="diary-muted" role="status">
          {statusText}
        </span>
      </div>
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

/* =========================================================================
   Theme 1: 纸质手账 (JournalView)
   ========================================================================= */
export function JournalView({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";
  return (
    <div class="var-a">
      <div class="var-a-top">
        <div>
          <p class="diary-eyebrow">PRIVATE JOURNAL</p>
          <h1>私人日记</h1>
        </div>
        <div class="var-a-top-actions">
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
            退出
          </Button>
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
          {p.loading ? (
            <Loading>正在加载…</Loading>
          ) : editing && (p.route.view === "new" || p.entry) ? (
            <EditorForm p={p} />
          ) : p.entry ? (
            <article>
              <p class="diary-muted">{p.displayed.diaryDate}</p>
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
  );
}

/* =========================================================================
   Theme 2: 开发者终端 (TerminalView)
   ========================================================================= */
export function TerminalView({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";
  const isDetail = p.route.view !== "list";

  return (
    <div class="var-b">
      <div class="diary-heading">
        <div>
          <p class="diary-eyebrow">PRIVATE JOURNAL</p>
          <h1>私人日记工作台</h1>
        </div>
        <div class="var-a-top-actions">
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
            退出登录
          </Button>
        </div>
      </div>

      <ErrorBanner p={p} />

      <div class={`var-b-shell${isDetail ? " is-detail" : ""}`}>
        <aside class="var-b-sidebar">
          <div class="var-b-side-head">
            <h2>目录 ({p.listLoading && !p.items.length ? "…" : p.total})</h2>
            <Button
              type="button"
              onClick={() => p.setShowFilters(!p.showFilters)}
            >
              筛选{p.activeFilters > 0 ? ` (${p.activeFilters})` : ""}
            </Button>
          </div>
          <Input
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
              p.items.map((item) => (
                <a
                  key={item.id}
                  href={`/diary/?view=read&id=${item.id}`}
                  class={`var-b-row${p.route.id === item.id ? " is-active" : ""}`}
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
              ))
            )}
          </div>
          <Pagination p={p} />
        </aside>

        <section class="var-b-main">
          {p.route.view === "list" ? (
            <div class="var-b-welcome">
              <h2>从左侧选择一篇日记</h2>
              <p class="diary-muted">
                或点击右上角「写日记」开始记录今天。共 {p.total} 篇。
              </p>
              <Button
                class="diary-primary"
                disabled={p.busy || p.uncertain}
                onClick={() =>
                  p.navigate(`/diary/?view=new&id=${crypto.randomUUID()}`)
                }
              >
                写一篇新日记
              </Button>
            </div>
          ) : (
            <>
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
              {p.loading ? (
                <Loading>正在加载…</Loading>
              ) : editing && (p.route.view === "new" || p.entry) ? (
                <EditorForm p={p} split />
              ) : p.entry ? (
                <article class="diary-reader">
                  <p class="diary-muted">{p.displayed.diaryDate}</p>
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
    </div>
  );
}

/* =========================================================================
   Theme 3: 彩色杂志 (MagazineView)
   ========================================================================= */
export function MagazineView({ p }: { p: DiaryViewProps }) {
  const editing = p.route.view === "new" || p.route.view === "edit";

  return (
    <div class="var-c">
      <ErrorBanner p={p} />

      {p.route.view === "list" ? (
        <>
          <form
            class="var-c-cmdbar"
            onSubmit={(e) => {
              e.preventDefault();
              p.updateFilters({ q: p.search });
            }}
          >
            <div class="var-c-brand">
              <h1>私人日记</h1>
              <span class="diary-muted">
                {p.listLoading ? "…" : `${p.total} 篇`}
              </span>
            </div>
            <div class="var-c-cmd-search">
              <Input
                label=""
                aria-label="搜索关键词"
                type="search"
                placeholder="搜索标题、标签或正文"
                maxLength={100}
                value={p.search}
                onInput={(e) => p.setSearch(e.currentTarget.value)}
              />
            </div>
            <Button
              type="button"
              onClick={() => p.setShowFilters(!p.showFilters)}
            >
              筛选{p.activeFilters > 0 ? ` (${p.activeFilters})` : ""}
            </Button>
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
              退出
            </Button>
          </form>

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
          <div class="var-a-sheet-bar">
            <Button disabled={p.busy} onClick={p.goBack}>
              ← 返回
            </Button>
            <div class="var-a-top-actions">
              {p.route.view === "read" && p.entry && (
                <>
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
                </>
              )}
              <Button disabled={p.busy} onClick={p.logout}>
                退出
              </Button>
            </div>
          </div>

          {p.loading ? (
            <Loading>正在加载…</Loading>
          ) : editing && (p.route.view === "new" || p.entry) ? (
            <EditorForm p={p} />
          ) : p.entry ? (
            <article class="diary-panel diary-reader">
              <p class="diary-muted">{p.displayed.diaryDate}</p>
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
  );
}
