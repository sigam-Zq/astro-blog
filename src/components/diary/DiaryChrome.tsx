import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Button, Callout, Input, Loading } from "./ui";
import type { Metadata } from "./types";

export type DiaryThemeKey = "journal" | "terminal" | "magazine";
export type TransitionOrigin = { x: number; y: number } | null;

export const DIARY_THEME_OPTIONS: ReadonlyArray<{
  key: DiaryThemeKey;
  label: string;
  shortLabel: string;
  desc: string;
}> = [
  {
    key: "journal",
    label: "纸质手账",
    shortLabel: "手账",
    desc: "暖纸衬线 · 时间轴",
  },
  {
    key: "terminal",
    label: "开发者终端",
    shortLabel: "终端",
    desc: "全屏双栏 · 固定深色",
  },
  {
    key: "magazine",
    label: "彩色杂志",
    shortLabel: "杂志",
    desc: "弥散光 · 玻璃画廊",
  },
];

export function isDiaryTheme(v: string | null | undefined): v is DiaryThemeKey {
  return v === "journal" || v === "terminal" || v === "magazine";
}

type ViewTransitionDocument = globalThis.Document & {
  startViewTransition?: (cb: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

export function applyThemeTransition(
  origin: TransitionOrigin,
  mutate: () => void
) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches;
  const doc = window.document as ViewTransitionDocument;
  if (reduced || typeof doc.startViewTransition !== "function") {
    mutate();
    return;
  }

  const root = doc.documentElement;
  const x = origin?.x ?? Math.max(24, window.innerWidth - 48);
  const y = origin?.y ?? 32;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  root.classList.add("diary-theme-rippling");
  try {
    const transition = doc.startViewTransition(() => {
      mutate();
    });
    void transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 480,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {});
    void transition.finished.finally(() => {
      root.classList.remove("diary-theme-rippling");
    });
  } catch {
    root.classList.remove("diary-theme-rippling");
    mutate();
  }
}

export function countDiaryStats(markdown: string) {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return { words: 0, lines: 0, minutes: 1 };
  }
  const cjk = (
    trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []
  ).length;
  const nonCjk = trimmed.replace(
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g,
    " "
  );
  const latin = (nonCjk.match(/[A-Za-z0-9_'-]+/g) || []).length;
  const words = cjk + latin;
  const lines = markdown ? markdown.split(/\r?\n/).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 300));
  return { words, lines, minutes };
}

export function getTimeGreeting() {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = Number(hourStr) % 24;
  if (hour >= 5 && hour <= 10) {
    return {
      title: "清晨好",
      subtitle: "趁世界还安静，记下今天的第一行字。",
    };
  }
  if (hour >= 11 && hour <= 13) {
    return {
      title: "午间小憩",
      subtitle: "暂停片刻，留一点空白给自己。",
    };
  }
  if (hour >= 14 && hour <= 18) {
    return {
      title: "午后安静",
      subtitle: "慢慢写，不必着急。",
    };
  }
  if (hour >= 19 && hour <= 22) {
    return {
      title: "傍晚好",
      subtitle: "把白天的喧嚣折进纸页里。",
    };
  }
  return {
    title: "夜深了",
    subtitle: "推开门，这是只属于你的时间。",
  };
}

export function getMonthRange(ym: string) {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${ym}-01`,
    dateTo: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

export type MonthPill = {
  ym: string;
  label: string;
  hasItems: boolean;
  dateFrom: string;
  dateTo: string;
};

export function buildMonthPills(items: Metadata[]): MonthPill[] {
  const nowStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [curYearStr, curMonthStr] = nowStr.split("-");
  const curYear = Number(curYearStr);
  const curMonth = Number(curMonthStr);

  const set = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(curYear, curMonth - 1 - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    set.add(`${y}-${m}`);
  }
  const itemMonths = new Set<string>();
  for (const item of items) {
    if (item.diaryDate && /^\d{4}-\d{2}/.test(item.diaryDate)) {
      const ym = item.diaryDate.slice(0, 7);
      itemMonths.add(ym);
      set.add(ym);
    }
  }

  return Array.from(set)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8)
    .map((ym) => {
      const [yStr, mStr] = ym.split("-");
      const label =
        Number(yStr) === curYear
          ? `${Number(mStr)} 月`
          : `${yStr.slice(2)}·${Number(mStr)}月`;
      const range = getMonthRange(ym);
      return {
        ym,
        label,
        hasItems: itemMonths.has(ym),
        ...range,
      };
    });
}

function originFromEvent(e: Event): TransitionOrigin {
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function DiaryThemeSwitcher({
  dark,
  diaryTheme,
  onSetDark,
  onSetTheme,
  compact = false,
}: {
  dark: boolean;
  diaryTheme: DiaryThemeKey;
  onSetDark: (dark: boolean, origin?: TransitionOrigin) => void;
  onSetTheme: (theme: DiaryThemeKey, origin?: TransitionOrigin) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        rootRef.current &&
        e.target instanceof Node &&
        !rootRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.document.addEventListener("click", onDocClick);
    window.document.addEventListener("keydown", onKeyDown);
    return () => {
      window.document.removeEventListener("click", onDocClick);
      window.document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const currentOpt =
    DIARY_THEME_OPTIONS.find((t) => t.key === diaryTheme) ||
    DIARY_THEME_OPTIONS[0];

  return (
    <div
      class={`diary-theme-switcher${compact ? " is-compact" : ""}`}
      ref={rootRef}
    >
      <button
        ref={btnRef}
        type="button"
        class="diary-theme-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="外观与主题设置"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          class={`diary-theme-dot diary-theme-dot--${diaryTheme}`}
          aria-hidden="true"
        />
        <span class="diary-theme-btn-label">{currentOpt.shortLabel}</span>
        <span class="diary-theme-mode-icon" aria-hidden="true">
          {dark ? "☾" : "☀"}
        </span>
        <span class="diary-theme-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          class="diary-theme-popover"
          role="dialog"
          aria-label="外观与主题设置"
        >
          <div class="diary-theme-pop-sec">
            <p class="diary-theme-pop-title">明暗模式</p>
            <div class="diary-theme-mode-row">
              <button
                type="button"
                class={`diary-theme-mode-opt${!dark ? " is-active" : ""}`}
                aria-pressed={!dark}
                onClick={(e) => onSetDark(false, originFromEvent(e))}
              >
                <span aria-hidden="true">☀</span>
                <span>浅色</span>
              </button>
              <button
                type="button"
                class={`diary-theme-mode-opt${dark ? " is-active" : ""}`}
                aria-pressed={dark}
                onClick={(e) => onSetDark(true, originFromEvent(e))}
              >
                <span aria-hidden="true">☾</span>
                <span>深色</span>
              </button>
            </div>
            {diaryTheme === "terminal" && (
              <p class="diary-theme-pop-note">
                终端风格固定深色，明暗设置将应用于手账与杂志风格
              </p>
            )}
          </div>

          <div class="diary-theme-pop-div" />

          <div class="diary-theme-pop-sec">
            <p class="diary-theme-pop-title">日记风格</p>
            <div class="diary-theme-style-list">
              {DIARY_THEME_OPTIONS.map((opt) => {
                const active = opt.key === diaryTheme;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    class={`diary-theme-style-opt${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={(e) => onSetTheme(opt.key, originFromEvent(e))}
                  >
                    <span
                      class={`diary-theme-swatch diary-theme-swatch--${opt.key}`}
                      aria-hidden="true"
                    />
                    <span class="diary-theme-style-meta">
                      <strong>{opt.label}</strong>
                      <small>{opt.desc}</small>
                    </span>
                    <span class="diary-theme-check" aria-hidden="true">
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MonthQuickBar({
  items,
  dateFrom,
  dateTo,
  onSelectRange,
}: {
  items: Metadata[];
  dateFrom: string;
  dateTo: string;
  onSelectRange: (dateFrom: string, dateTo: string) => void;
}) {
  const pills = useMemo(() => buildMonthPills(items), [items]);
  const isAll = !dateFrom && !dateTo;

  return (
    <nav class="diary-month-bar" aria-label="按月份快速筛选">
      <button
        type="button"
        class={`diary-month-pill${isAll ? " is-active" : ""}`}
        aria-pressed={isAll}
        onClick={() => onSelectRange("", "")}
      >
        全部
      </button>
      {pills.map((pill) => {
        const active =
          dateFrom === pill.dateFrom && dateTo === pill.dateTo;
        return (
          <button
            key={pill.ym}
            type="button"
            class={`diary-month-pill${active ? " is-active" : ""}${
              pill.hasItems ? " has-items" : ""
            }`}
            aria-pressed={active}
            onClick={() =>
              active
                ? onSelectRange("", "")
                : onSelectRange(pill.dateFrom, pill.dateTo)
            }
          >
            {pill.hasItems && <span class="diary-month-dot" aria-hidden="true" />}
            <span>{pill.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

type PaletteItem = {
  id: string;
  group: "操作" | "外观" | "日记";
  label: string;
  hint?: string;
  keywords: string;
  run: () => void;
};

export function DiaryCommandPalette({
  open,
  onClose,
  routeView,
  zenMode,
  dark,
  diaryTheme,
  items,
  onNew,
  onFocusSearch,
  onToggleZen,
  onSetTheme,
  onSetDark,
  onLock,
  onReturnBlog,
  onOpenEntry,
}: {
  open: boolean;
  onClose: () => void;
  routeView: string;
  zenMode: boolean;
  dark: boolean;
  diaryTheme: DiaryThemeKey;
  items: Metadata[];
  onNew: () => void;
  onFocusSearch: () => void;
  onToggleZen: () => void;
  onSetTheme: (t: DiaryThemeKey) => void;
  onSetDark: (d: boolean) => void;
  onLock: () => void;
  onReturnBlog: () => void;
  onOpenEntry: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const list = useMemo<PaletteItem[]>(() => {
    const editing = routeView === "edit" || routeView === "new";
    const commands: PaletteItem[] = [
      {
        id: "cmd-new",
        group: "操作",
        label: "写一篇新日记",
        hint: "New",
        keywords: "写日记 新建 new create",
        run: onNew,
      },
      {
        id: "cmd-search",
        group: "操作",
        label: "聚焦搜索日记",
        hint: "Search",
        keywords: "搜索 查找 过滤 search find",
        run: onFocusSearch,
      },
    ];
    if (editing) {
      commands.push({
        id: "cmd-zen",
        group: "操作",
        label: zenMode ? "退出专注写作模式" : "进入专注写作模式",
        hint: zenMode ? "Esc" : "Zen",
        keywords: "专注 全屏 zen focus",
        run: onToggleZen,
      });
    }
    for (const opt of DIARY_THEME_OPTIONS) {
      commands.push({
        id: `theme-${opt.key}`,
        group: "外观",
        label: `切换风格：${opt.label}`,
        hint: opt.key === diaryTheme ? "当前" : opt.shortLabel,
        keywords: `主题 风格 ${opt.label} ${opt.key}`,
        run: () => onSetTheme(opt.key),
      });
    }
    commands.push({
      id: "mode-toggle",
      group: "外观",
      label: dark ? "切换到浅色模式" : "切换到深色模式",
      hint: dark ? "Light" : "Dark",
      keywords: "明暗 浅色 深色 夜间 dark light theme",
      run: () => onSetDark(!dark),
    });
    commands.push({
      id: "cmd-lock",
      group: "操作",
      label: "锁定并退出日记",
      hint: "Lock",
      keywords: "锁定 退出 登出 logout lock",
      run: onLock,
    });
    commands.push({
      id: "cmd-blog",
      group: "操作",
      label: "返回博客首页",
      hint: "Blog",
      keywords: "返回 博客 首页 home blog back",
      run: onReturnBlog,
    });

    const q = query.trim().toLowerCase();
    const matchedEntries: PaletteItem[] = items
      .filter((it) => {
        if (!q) return true;
        return (
          it.title.toLowerCase().includes(q) ||
          it.diaryDate.includes(q) ||
          (it.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          it.excerpt.toLowerCase().includes(q)
        );
      })
      .slice(0, 5)
      .map((it) => ({
        id: `entry-${it.id}`,
        group: "日记",
        label: it.title || "无标题日记",
        hint: it.diaryDate,
        keywords: "",
        run: () => onOpenEntry(it.id),
      }));

    const matchedCmds = q
      ? commands.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.keywords.toLowerCase().includes(q)
        )
      : commands;

    return [...matchedCmds, ...matchedEntries];
  }, [
    query,
    routeView,
    zenMode,
    dark,
    diaryTheme,
    items,
    onNew,
    onFocusSearch,
    onToggleZen,
    onSetTheme,
    onSetDark,
    onLock,
    onReturnBlog,
    onOpenEntry,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const exec = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div
      class="diary-cmd-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="快捷命令面板"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class="diary-cmd-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (list.length ? (i + 1) % list.length : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) =>
              list.length ? (i - 1 + list.length) % list.length : 0
            );
          } else if (e.key === "Enter") {
            e.preventDefault();
            exec(list[activeIndex]);
          }
        }}
      >
        <div class="diary-cmd-input-wrap">
          <span class="diary-cmd-prefix" aria-hidden="true">
            ⌘K
          </span>
          <input
            ref={inputRef}
            type="text"
            class="diary-cmd-input"
            placeholder="输入命令、风格名称或日记标题…"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button
            type="button"
            class="diary-cmd-esc"
            onClick={onClose}
            aria-label="关闭命令面板"
          >
            Esc
          </button>
        </div>
        <div class="diary-cmd-list" role="listbox">
          {!list.length ? (
            <p class="diary-cmd-empty">没有匹配的命令或日记</p>
          ) : (
            list.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                class={`diary-cmd-item${idx === activeIndex ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => exec(item)}
              >
                <span class="diary-cmd-item-group">{item.group}</span>
                <span class="diary-cmd-item-label">{item.label}</span>
                {item.hint && <span class="diary-cmd-item-hint">{item.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const ARRIVAL_MOTES = [
  { x: "22%", y: "66%", dx: "26px", dy: "-110px", delay: "0ms", size: "7px" },
  { x: "38%", y: "74%", dx: "-22px", dy: "-140px", delay: "120ms", size: "5px" },
  { x: "52%", y: "62%", dx: "18px", dy: "-125px", delay: "60ms", size: "8px" },
  { x: "68%", y: "70%", dx: "-28px", dy: "-135px", delay: "180ms", size: "6px" },
  { x: "78%", y: "60%", dx: "14px", dy: "-95px", delay: "90ms", size: "5px" },
  { x: "44%", y: "80%", dx: "-10px", dy: "-150px", delay: "220ms", size: "6px" },
];

export function FireflyArrivalOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 2900);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div class="diary-arrival-motes" aria-hidden="true">
      {ARRIVAL_MOTES.map((m, i) => (
        <span
          key={i}
          class="diary-arrival-mote"
          style={{
            left: m.x,
            top: m.y,
            width: m.size,
            height: m.size,
            "--dx": m.dx,
            "--dy": m.dy,
            "--delay": m.delay,
          }}
        />
      ))}
    </div>
  );
}

export function DiaryFoyer({
  checking,
  busy,
  error,
  dark,
  diaryTheme,
  onSetDark,
  onSetTheme,
  onLogin,
  onReturnBlog,
}: {
  checking: boolean;
  busy: boolean;
  error: string;
  dark: boolean;
  diaryTheme: DiaryThemeKey;
  onSetDark: (dark: boolean, origin?: TransitionOrigin) => void;
  onSetTheme: (theme: DiaryThemeKey, origin?: TransitionOrigin) => void;
  onLogin: (e: Event) => void;
  onReturnBlog: () => void;
}) {
  const greeting = useMemo(() => getTimeGreeting(), []);

  return (
    <div class="diary-foyer">
      <div class="diary-foyer-ambient" aria-hidden="true">
        <span class="diary-foyer-speck diary-foyer-speck--1" />
        <span class="diary-foyer-speck diary-foyer-speck--2" />
        <span class="diary-foyer-speck diary-foyer-speck--3" />
        <span class="diary-foyer-speck diary-foyer-speck--4" />
        <span class="diary-foyer-speck diary-foyer-speck--5" />
      </div>

      <header class="diary-foyer-bar">
        <button
          type="button"
          class="diary-back-blog"
          onClick={onReturnBlog}
        >
          ← 返回博客
        </button>
        <DiaryThemeSwitcher
          dark={dark}
          diaryTheme={diaryTheme}
          onSetDark={onSetDark}
          onSetTheme={onSetTheme}
        />
      </header>

      <div class="diary-foyer-center">
        <div class="diary-foyer-card">
          <div class="diary-foyer-badge" aria-hidden="true">
            ✦
          </div>
          <p class="diary-eyebrow">PRIVATE SANCTUARY</p>
          <h1>私人日记</h1>
          <p class="diary-foyer-greeting">
            <strong>{greeting.title}</strong>
            <span>{greeting.subtitle}</span>
          </p>

          {error && <Callout class="diary-error">{error}</Callout>}

          {checking ? (
            <div class="diary-foyer-checking">
              <Loading>正在核验秘境通行证…</Loading>
            </div>
          ) : (
            <form class="diary-foyer-form" onSubmit={onLogin}>
              <Input
                label="账号"
                name="username"
                autoComplete="username"
                required
                maxLength={256}
                disabled={busy}
              />
              <Input
                label="密码"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                disabled={busy}
              />
              <Button
                class="diary-primary diary-foyer-submit"
                type="submit"
                disabled={busy}
                loading={busy}
              >
                {busy ? "推门中…" : "推门进入"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
