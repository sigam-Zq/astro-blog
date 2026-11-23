import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { Button, Dialog } from "./ui";
import {
  type Document,
  type Entry,
  type Metadata,
  type Session,
} from "./types";
import "./diary.css";
import {
  DiaryCommandPalette,
  DiaryFoyer,
  FireflyArrivalOverlay,
  applyThemeTransition,
  isDiaryTheme,
  type DiaryThemeKey,
  type TransitionOrigin,
} from "./DiaryChrome";
import {
  JournalView,
  TerminalView,
  MagazineView,
  type DiaryViewProps,
} from "./DiaryThemes";

type Route = { view: string; id: string };
type HistoryMeta = { idx: number; prev: string | null };
type PendingNav =
  | { kind: "go"; url: string; replace?: boolean }
  | { kind: "pop"; delta: number }
  | { kind: "external"; url: string };
type Filters = {
  q: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
  page: number;
};
type Resume = {
  id: string;
  revision: number;
  document: Document;
  tags: string;
};
type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};
const API_ORIGIN = (
  import.meta.env.PUBLIC_DIARY_API_ORIGIN || ""
).replace(/\/+$/, "");

const emptyFilters: Filters = {
  q: "",
  tag: "",
  dateFrom: "",
  dateTo: "",
  page: 1,
};
const validID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const blank = (): Document => ({
  title: "",
  diaryDate: new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
  tags: [],
  contentMarkdown: "",
});
function parseURL(url: string): Route {
  const p = new URL(url, window.location.origin).searchParams;
  const view = p.get("view") || "list";
  return {
    view: ["list", "new", "read", "edit"].includes(view) ? view : "list",
    id: p.get("id") || "",
  };
}
function routeAtLocation(): Route {
  return parseURL(location.href);
}
function currentHistoryMeta(): HistoryMeta {
  const s = history.state as Partial<HistoryMeta> | null;
  return {
    idx: typeof s?.idx === "number" ? s.idx : 0,
    prev: typeof s?.prev === "string" ? s.prev : null,
  };
}
function filtersAtLocation(): Filters {
  const p = new URLSearchParams(location.search);
  const n = Number(p.get("page") || 1);
  return {
    q: p.get("q") || "",
    tag: p.get("tag") || "",
    dateFrom: p.get("dateFrom") || "",
    dateTo: p.get("dateTo") || "",
    page: Number.isInteger(n) && n > 0 ? n : 1,
  };
}
function readDiaryTheme(): DiaryThemeKey {
  const attr = window.document.documentElement.dataset.diaryTheme;
  if (isDiaryTheme(attr)) return attr;
  try {
    const saved = localStorage.getItem("diary-theme");
    if (isDiaryTheme(saved)) return saved;
  } catch {}
  return "journal";
}
function readDarkMode(): boolean {
  const attr = window.document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr === "dark";
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved === "dark";
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
}
function listURL(f: Filters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v && !(k === "page" && v === 1)) p.set(k, String(v));
  return `/diary/${p.size ? `?${p}` : ""}`;
}
function timestamp(s: string) {
  return new Date(s).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
class APIError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export default function DiaryApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [route, setRoute] = useState<Route>(routeAtLocation);
  const [diaryTheme, setDiaryTheme] = useState<DiaryThemeKey>(readDiaryTheme);
  const [dark, setDark] = useState<boolean>(readDarkMode);
  const [filters, setFilters] = useState<Filters>(filtersAtLocation);
  const [search, setSearch] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<Metadata[]>([]);
  const [total, setTotal] = useState(0);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [document, setDocument] = useState<Document>(blank);
  const [tags, setTags] = useState("");
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);
  const [listReload, setListReload] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Metadata | Entry | null>(
    null
  );
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [arrivedViaFirefly, setArrivedViaFirefly] = useState(false);
  const confirmResolve = useRef<((answer: boolean) => void) | null>(null);

  const setDarkMode = useCallback(
    (nextDark: boolean, origin: TransitionOrigin = null) => {
      applyThemeTransition(origin, () => {
        const mode = nextDark ? "dark" : "light";
        window.document.documentElement.dataset.theme = mode;
        try {
          localStorage.setItem("theme", mode);
        } catch {}
        setDark(nextDark);
      });
    },
    []
  );

  const setThemeStyle = useCallback(
    (nextTheme: DiaryThemeKey, origin: TransitionOrigin = null) => {
      applyThemeTransition(origin, () => {
        window.document.documentElement.dataset.diaryTheme = nextTheme;
        try {
          localStorage.setItem("diary-theme", nextTheme);
        } catch {}
        setDiaryTheme(nextTheme);
      });
    },
    []
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.diaryTheme = diaryTheme;
  }, [dark, diaryTheme]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme" && (e.newValue === "light" || e.newValue === "dark")) {
        window.document.documentElement.dataset.theme = e.newValue;
        setDark(e.newValue === "dark");
      }
      if (e.key === "diary-theme" && isDiaryTheme(e.newValue)) {
        window.document.documentElement.dataset.diaryTheme = e.newValue;
        setDiaryTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("diary-firefly-arrived") === "1") {
        sessionStorage.removeItem("diary-firefly-arrived");
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          setArrivedViaFirefly(true);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!session || (route.view !== "edit" && route.view !== "new")) {
      setZenMode(false);
    }
  }, [session, route.view]);

  useEffect(() => () => confirmResolve.current?.(false), []);
  function ask(options: Confirmation) {
    confirmResolve.current?.(false);
    setConfirmation(options);
    return new Promise<boolean>((resolve) => {
      confirmResolve.current = resolve;
    });
  }
  function settleConfirmation(answer: boolean) {
    confirmResolve.current?.(answer);
    confirmResolve.current = null;
    setConfirmation(null);
  }
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const resume = useRef<Resume | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const listReturn = useRef(listURL(filters));
  const currentURL = useRef(location.pathname + location.search);
  const curIdx = useRef(currentHistoryMeta().idx);
  const pendingNav = useRef<PendingNav | null>(null);
  const bypassDirty = useRef(false);
  const allowUnload = useRef(false);
  const pendingSearchFocus = useRef(false);
  const generation = useRef(0);
  const listGeneration = useRef(0);
  const operation = useRef<{ id: string; method: string; body: string } | null>(
    null
  );
  const dirty =
    (route.view === "edit" || route.view === "new") &&
    JSON.stringify({ document, tags }) !== baseline;
  const editRef = useRef({ route, document, tags, entry, dirty });
  editRef.current = { route, document, tags, entry, dirty };
  const clearSensitive = useCallback((keepInput: boolean) => {
    const e = editRef.current;
    if (
      keepInput &&
      (e.dirty || operation.current) &&
      (e.route.view === "new" || e.route.view === "edit")
    )
      resume.current = {
        id: e.route.id,
        revision: e.entry?.revision || 0,
        document: e.document,
        tags: e.tags,
      };
    if (!keepInput) {
      resume.current = null;
      operation.current = null;
      setUncertain(false);
    }
    generation.current++;
    listGeneration.current++;
    setSession(null);
    setItems([]);
    setTotal(0);
    setEntry(null);
    setDocument(blank());
    setTags("");
    setBaseline("");
    setError("");
    setNotice("");
    setDeleteTarget(null);
    setLeaveTo(null);
    setConflict(false);
    setZenMode(false);
    setPaletteOpen(false);
    settleConfirmation(false);
    setChecking(false);
  }, []);
  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (init.body) headers.set("Content-Type", "application/json");
      if (init.method && !["GET", "HEAD"].includes(init.method))
        headers.set("X-CSRF-Token", sessionRef.current?.csrfToken || "");
      const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
        ...init,
        headers,
        credentials: API_ORIGIN ? "include" : "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const retry = response.headers.get("Retry-After");
        if (response.status === 401 && path !== "/auth/login")
          clearSensitive(true);
        throw new APIError(
          response.status,
          (data?.error?.message || "请求失败，请稍后重试") +
            (retry ? `（${retry} 秒后重试）` : ""),
          data?.error?.code
        );
      }
      if (response.status === 204) return undefined as T;
      return response.json();
    },
    [clearSensitive]
  );
  const installSession = (s: Session) => {
    sessionRef.current = s;
    setSession(s);
  };
  useEffect(() => {
    let active = true;
    request<Session>("/auth/session")
      .then((s) => {
        if (active) installSession(s);
      })
      .catch((e) => {
        if (active && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel("private-diary-session");
    channel.current = c;
    c.onmessage = (e) => {
      if (e.data === "logout") clearSensitive(false);
    };
    return () => {
      channel.current = null;
      c.close();
    };
  }, [clearSensitive]);
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(
      () => clearSensitive(true),
      Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
    );
    return () => clearTimeout(t);
  }, [session]);
  const syncFromLocation = () => {
    generation.current++;
    currentURL.current = location.pathname + location.search;
    curIdx.current = currentHistoryMeta().idx;
    const nextRoute = routeAtLocation();
    setRoute(nextRoute);
    const f = filtersAtLocation();
    if (!new URLSearchParams(location.search).get("view")) {
      setFilters(f);
      setSearch(f.q);
    }
    setError("");
    setNotice("");
    setConflict(false);
    setPreview(false);
    if (nextRoute.view === "list") {
      setListReload((n) => n + 1);
    } else {
      setReload((n) => n + 1);
    }
  };
  const go = (url: string, replace = false) => {
    const meta = currentHistoryMeta();
    const nextMeta: HistoryMeta = replace
      ? meta
      : { idx: meta.idx + 1, prev: currentURL.current };
    history[replace ? "replaceState" : "pushState"](nextMeta, "", url);
    syncFromLocation();
  };
  const runNav = (nav: PendingNav) => {
    if (nav.kind === "go") {
      go(nav.url, nav.replace);
    } else if (nav.kind === "pop") {
      bypassDirty.current = true;
      history.go(nav.delta);
    } else {
      allowUnload.current = true;
      window.location.assign(nav.url);
    }
  };
  const navigate = (url: string, replace = false) => {
    if (busy || uncertain) {
      setError("请先核对当前操作结果");
      return;
    }
    if (dirty) {
      pendingNav.current = { kind: "go", url, replace };
      setLeaveTo(url);
      return;
    }
    go(url, replace);
  };
  const returnToBlog = () => {
    if (busy || uncertain) {
      setError("请先核对当前操作结果");
      return;
    }
    if (dirty) {
      pendingNav.current = { kind: "external", url: "/" };
      setLeaveTo("/");
      return;
    }
    allowUnload.current = true;
    window.location.assign("/");
  };
  const goBack = () => {
    if (busy || uncertain) {
      setError("请先核对当前操作结果");
      return;
    }
    const prev = currentHistoryMeta().prev;
    const prevRoute = prev ? parseURL(prev) : null;
    const canBack =
      prevRoute &&
      (prevRoute.view === "list" ||
        (route.view === "edit" &&
          prevRoute.view === "read" &&
          prevRoute.id === route.id));
    if (canBack) {
      if (dirty) {
        pendingNav.current = { kind: "pop", delta: -1 };
        setLeaveTo(prev!);
        return;
      }
      bypassDirty.current = true;
      history.back();
      return;
    }
    const fallback =
      route.view === "edit" && entry
        ? `/diary/?view=read&id=${route.id}`
        : listReturn.current;
    navigate(fallback, true);
  };
  const navRef = useRef({ busy, uncertain, syncFromLocation });
  navRef.current = { busy, uncertain, syncFromLocation };
  useEffect(() => {
    if (!history.state || typeof history.state.idx !== "number") {
      history.replaceState(
        { idx: 0, prev: null } satisfies HistoryMeta,
        "",
        location.pathname + location.search
      );
      curIdx.current = 0;
    }
    const unload = (e: BeforeUnloadEvent) => {
      if (!allowUnload.current && (editRef.current.dirty || operation.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const pageshow = () => {
      allowUnload.current = false;
      setLocking(false);
    };
    const pop = () => {
      const target = location.pathname + location.search;
      const nextMeta = currentHistoryMeta();
      const delta = nextMeta.idx - curIdx.current || -1;
      if (bypassDirty.current) {
        bypassDirty.current = false;
        navRef.current.syncFromLocation();
        return;
      }
      if (navRef.current.busy || navRef.current.uncertain) {
        bypassDirty.current = true;
        history.go(-delta);
        setError("请先核对当前操作结果");
        return;
      }
      if (editRef.current.dirty) {
        bypassDirty.current = true;
        history.go(-delta);
        pendingNav.current = { kind: "pop", delta };
        setLeaveTo(target);
        return;
      }
      navRef.current.syncFromLocation();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("pageshow", pageshow);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("pageshow", pageshow);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.q) updateFilters({ q: search });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (pendingSearchFocus.current && route.view === "list") {
      pendingSearchFocus.current = false;
      requestAnimationFrame(() => {
        window.document
          .querySelector<HTMLElement>(".diary-search-input")
          ?.focus();
      });
    }
  }, [route.view]);
  function updateFilters(update: Partial<Filters>, push = false) {
    const next = { ...filters, ...update, page: update.page ?? 1 };
    setFilters(next);
    setError("");
    const url = listURL(next);
    listReturn.current = url;
    if (route.view === "list") {
      const meta = currentHistoryMeta();
      const nextMeta: HistoryMeta = push
        ? { idx: meta.idx + 1, prev: currentURL.current }
        : meta;
      history[push ? "pushState" : "replaceState"](nextMeta, "", url);
      curIdx.current = nextMeta.idx;
      currentURL.current = url;
    }
  }
  const needList = route.view === "list" || diaryTheme === "terminal";
  useEffect(() => {
    if (!session || !needList) return;
    const controller = new AbortController();
    const gen = ++listGeneration.current;
    let active = true;
    const current = () => active && gen === listGeneration.current;
    setListLoading(true);
    if (route.view === "list") listReturn.current = listURL(filters);
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters))
      if (v) p.set(k, String(v));
    request<{ items: Metadata[]; total: number }>(`/diaries?${p}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (current()) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (current() && e.name !== "AbortError") {
          setError(e.message);
          if (route.view === "list") {
            setItems([]);
            setTotal(0);
          }
        }
      })
      .finally(() => {
        if (current()) setListLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    session,
    needList,
    filters.q,
    filters.tag,
    filters.dateFrom,
    filters.dateTo,
    filters.page,
    listReload,
  ]);
  useEffect(() => {
    if (!session || route.view === "list") {
      setLoading(false);
      setEntry(null);
      setConflict(false);
      return;
    }
    const controller = new AbortController();
    const gen = ++generation.current;
    let active = true;
    const current = () => active && gen === generation.current;
    setError("");
    setLoading(true);
    setEntry(null);
    setConflict(false);
    async function load() {
      if (route.view === "new") {
        const id = route.id || crypto.randomUUID();
        if (!validID.test(id)) throw new Error("日记 ID 无效");
        if (!route.id) {
          history.replaceState(
            currentHistoryMeta(),
            "",
            `/diary/?view=new&id=${id}`
          );
          currentURL.current = location.pathname + location.search;
          setRoute({ view: "new", id });
          return;
        }
        const retained = resume.current;
        const d = retained?.id === id ? retained.document : blank();
        const t = retained?.id === id ? retained.tags : "";
        if (current()) {
          setDocument(d);
          setTags(t);
          setBaseline(JSON.stringify({ document: blank(), tags: "" }));
          resume.current = null;
        }
      } else {
        if (!validID.test(route.id)) throw new Error("日记 ID 无效");
        const data = await request<Entry>(`/diaries/${route.id}`, {
          signal: controller.signal,
        });
        if (current()) {
          const retained =
            resume.current?.id === route.id ? resume.current : null;
          setEntry(retained ? { ...data, revision: retained.revision } : data);
          const d = retained?.document || data.document;
          const t = retained?.tags ?? data.document.tags.join(", ");
          setDocument(d);
          setTags(t);
          setBaseline(
            JSON.stringify({
              document: data.document,
              tags: data.document.tags.join(", "),
            })
          );
          if (retained && retained.revision !== data.revision) {
            setConflict(true);
            setError(
              "重新登录期间日记已更新。可复制未保存内容，或载入最新版本。"
            );
          }
          resume.current = null;
        }
      }
    }
    load()
      .catch((e) => {
        if (current() && e.name !== "AbortError") {
          if (
            e instanceof APIError &&
            e.status === 404 &&
            (route.view === "read" || route.view === "edit")
          ) {
            go(listReturn.current, true);
            setError("日记不存在或已被删除");
            return;
          }
          setError(e.message);
        }
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [session, route.view, route.id, reload]);
  async function login(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    try {
      const s = await request<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: values.get("username"),
          password: values.get("password"),
        }),
      });
      form.reset();
      if (
        resume.current &&
        !(await ask({
          title: "恢复未保存内容？",
          message: "当前页面内存中保留了未保存的日记内容，是否继续编辑？",
          confirmLabel: "继续编辑",
          cancelLabel: "放弃内容",
        }))
      ) {
        resume.current = null;
        operation.current = null;
        setUncertain(false);
        go("/diary/");
      }
      installSession(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (
      dirty &&
      !(await ask({
        title: "锁定并离开？",
        message: "锁定将丢弃当前页面的未保存内容并返回门厅。",
        confirmLabel: "放弃修改并锁定",
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await request("/auth/logout", { method: "POST" });
      setLocking(true);
      await new Promise((r) => setTimeout(r, 220));
      clearSensitive(false);
      channel.current?.postMessage("logout");
      go("/diary/", true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocking(false);
      setBusy(false);
    }
  }
  async function save(nav?: PendingNav | null) {
    if (busy) return;
    if (operation.current && operation.current.method !== "PUT") {
      setError("请先完成删除结果核对");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("保存中…");
    const id = route.id || crypto.randomUUID();
    const payload = {
      expectedRevision: entry?.revision || 0,
      mutationId: crypto.randomUUID(),
      document: {
        ...document,
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      },
    };
    if (!operation.current)
      operation.current = { id, method: "PUT", body: JSON.stringify(payload) };
    const op = operation.current;
    const gen = generation.current;
    try {
      const saved = await request<Entry>(`/diaries/${op.id}`, {
        method: op.method,
        body: op.body,
      });
      if (gen !== generation.current || !sessionRef.current) return;
      operation.current = null;
      setUncertain(false);
      setEntry(saved);
      setDocument(saved.document);
      const t = saved.document.tags.join(", ");
      setTags(t);
      setBaseline(JSON.stringify({ document: saved.document, tags: t }));
      setNotice("");
      setConflict(false);
      setListReload((n) => n + 1);
      if (route.view === "new") {
        const url = `/diary/?view=edit&id=${saved.id}`;
        history.replaceState(currentHistoryMeta(), "", url);
        currentURL.current = url;
        if (!nav) setRoute({ view: "edit", id: saved.id });
      }
      if (nav) {
        setLeaveTo(null);
        runNav(nav);
      }
    } catch (e) {
      const err = e as APIError;
      if (
        err.code === "SERVICE_UNAVAILABLE" ||
        (err.status && err.status < 500 && err.status !== 401)
      ) {
        operation.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }
      if (err.status === 409) setConflict(true);
      setError(err.message);
      setNotice(
        err.code === "SERVICE_UNAVAILABLE"
          ? "服务尚未就绪，内容已保留，可稍后重试"
          : "保存未确认，请保留当前内容"
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleteTarget || busy) return;
    if (operation.current && operation.current.method !== "DELETE") {
      setError("请先完成保存结果核对");
      return;
    }
    setBusy(true);
    setError("");
    const target = deleteTarget;
    if (!operation.current)
      operation.current = {
        id: target.id,
        method: "DELETE",
        body: JSON.stringify({
          expectedRevision: target.revision,
          mutationId: crypto.randomUUID(),
        }),
      };
    const op = operation.current;
    try {
      await request(`/diaries/${op.id}`, { method: op.method, body: op.body });
      operation.current = null;
      setUncertain(false);
      setDeleteTarget(null);
      setBaseline(JSON.stringify({ document, tags }));
      setListReload((n) => n + 1);
      if (route.view !== "list") {
        const prev = currentHistoryMeta().prev;
        if (prev && parseURL(prev).view === "list") {
          bypassDirty.current = true;
          history.back();
        } else {
          go(listReturn.current, true);
        }
      }
    } catch (e) {
      const err = e as APIError;
      if (
        err.code === "SERVICE_UNAVAILABLE" ||
        (err.status && err.status < 500 && err.status !== 401)
      ) {
        operation.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  const modalOpen = useRef(false);
  modalOpen.current = !!(confirmation || deleteTarget || leaveTo);
  const keyStateRef = useRef({ zenMode, paletteOpen });
  keyStateRef.current = { zenMode, paletteOpen };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s" &&
        sessionRef.current &&
        ["edit", "new"].includes(editRef.current.route.view)
      ) {
        e.preventDefault();
        if (!modalOpen.current && !keyStateRef.current.paletteOpen) {
          void saveRef.current();
        }
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        sessionRef.current
      ) {
        if (!modalOpen.current) {
          e.preventDefault();
          setPaletteOpen((v) => !v);
        }
        return;
      }
      if (
        e.key === "Escape" &&
        keyStateRef.current.zenMode &&
        !keyStateRef.current.paletteOpen &&
        !modalOpen.current
      ) {
        e.preventDefault();
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const focusSearch = useCallback(() => {
    if (route.view !== "list" && diaryTheme !== "terminal") {
      pendingSearchFocus.current = true;
      navigate(listURL(filters));
      return;
    }
    requestAnimationFrame(() => {
      window.document
        .querySelector<HTMLElement>(".diary-search-input")
        ?.focus();
    });
  }, [route.view, diaryTheme, filters]);

  const activeFilters = [filters.tag, filters.dateFrom, filters.dateTo].filter(
    Boolean
  ).length;
  const displayed = entry?.document || document;
  const viewProps: DiaryViewProps = {
    route,
    filters,
    emptyFilters,
    search,
    setSearch,
    showFilters,
    setShowFilters,
    activeFilters,
    updateFilters,
    items,
    total,
    loading,
    listLoading,
    error,
    notice,
    busy,
    uncertain,
    conflict,
    dirty,
    entry,
    document,
    setDocument,
    tags,
    setTags,
    preview,
    setPreview,
    displayed,
    dark,
    diaryTheme,
    setDarkMode,
    setThemeStyle,
    returnToBlog,
    zenMode,
    setZenMode,
    openPalette: () => setPaletteOpen(true),
    logout,
    navigate,
    goBack,
    save: () => void save(),
    setDeleteTarget,
    reloadLatest: async () => {
      if (
        await ask({
          title: "载入最新版本？",
          message: "载入最新版本会丢弃当前输入，请先复制需要保留的内容。",
          confirmLabel: "载入最新版本",
          danger: true,
        })
      ) {
        operation.current = null;
        setUncertain(false);
        resume.current = null;
        setReload((n) => n + 1);
      }
    },
    retryLoad: () => {
      setError("");
      setReload((n) => n + 1);
      setListReload((n) => n + 1);
    },
    copyMarkdown: () =>
      navigator.clipboard
        .writeText(document.contentMarkdown)
        .then(() => setNotice("正文已复制"))
        .catch(() => setError("复制失败，请手动复制正文")),
    timestamp,
  };

  const useDarkWA = dark || diaryTheme === "terminal";
  const appClasses = [
    "diary-app",
    `diary-theme-${diaryTheme}`,
    useDarkWA ? "wa-dark" : "wa-light",
    !session ? "diary-unauth" : "",
    zenMode ? "diary-zen" : "",
    locking ? "diary-locking" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div class={appClasses} lang="zh-CN">
      {checking || !session ? (
        <DiaryFoyer
          checking={checking}
          busy={busy}
          error={error}
          dark={dark}
          diaryTheme={diaryTheme}
          onSetDark={setDarkMode}
          onSetTheme={setThemeStyle}
          onLogin={login}
          onReturnBlog={returnToBlog}
        />
      ) : (
        <>
          {diaryTheme === "journal" && <JournalView p={viewProps} />}
          {diaryTheme === "terminal" && <TerminalView p={viewProps} />}
          {diaryTheme === "magazine" && <MagazineView p={viewProps} />}
        </>
      )}
      {arrivedViaFirefly && (
        <FireflyArrivalOverlay onDone={() => setArrivedViaFirefly(false)} />
      )}
      {session && paletteOpen && (
        <DiaryCommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          routeView={route.view}
          zenMode={zenMode}
          dark={dark}
          diaryTheme={diaryTheme}
          items={items}
          onNew={() =>
            navigate(`/diary/?view=new&id=${crypto.randomUUID()}`)
          }
          onFocusSearch={focusSearch}
          onToggleZen={() => setZenMode((v) => !v)}
          onSetTheme={(t) => setThemeStyle(t)}
          onSetDark={(d) => setDarkMode(d)}
          onLock={() => void logout()}
          onReturnBlog={returnToBlog}
          onOpenEntry={(id) => navigate(`/diary/?view=read&id=${id}`)}
        />
      )}
      {session && deleteTarget && (
        <Dialog
          label="删除日记？"
          locked={busy || uncertain}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button
                disabled={busy || uncertain}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </Button>
              <Button
                class="diary-danger"
                disabled={busy}
                loading={busy}
                onClick={remove}
              >
                {busy ? "处理中…" : uncertain ? "核对并重试删除" : "确认删除"}
              </Button>
            </>
          }
        >
          <p>
            将删除“
            {"title" in deleteTarget
              ? deleteTarget.title
              : deleteTarget.document.title}
            ”这篇日记。
          </p>
          <p class="diary-muted">
            服务端保留恢复用的删除记录，当前没有恢复入口。
          </p>
        </Dialog>
      )}
      {session && leaveTo && (
        <Dialog
          label="还有未保存的修改"
          locked={busy || uncertain}
          onClose={() => {
            pendingNav.current = null;
            setLeaveTo(null);
          }}
          footer={
            <>
              <Button
                disabled={busy || uncertain}
                onClick={() => {
                  pendingNav.current = null;
                  setLeaveTo(null);
                }}
              >
                继续编辑
              </Button>
              <Button
                disabled={busy || uncertain}
                onClick={() => {
                  const nav = pendingNav.current;
                  const to = leaveTo;
                  pendingNav.current = null;
                  setLeaveTo(null);
                  if (nav) runNav(nav);
                  else go(to);
                }}
              >
                放弃修改
              </Button>
              <Button
                class="diary-primary"
                disabled={busy || conflict}
                loading={busy}
                onClick={() => {
                  const nav = pendingNav.current;
                  pendingNav.current = null;
                  void save(nav);
                }}
              >
                保存后离开
              </Button>
            </>
          }
        >
          <p>离开前是否保存当前日记？</p>
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          label={confirmation.title}
          onClose={() => settleConfirmation(false)}
          footer={
            <>
              <Button onClick={() => settleConfirmation(false)}>
                {confirmation.cancelLabel || "取消"}
              </Button>
              <Button
                class={confirmation.danger ? "diary-danger" : "diary-primary"}
                onClick={() => settleConfirmation(true)}
              >
                {confirmation.confirmLabel}
              </Button>
            </>
          }
        >
          <p>{confirmation.message}</p>
        </Dialog>
      )}
    </div>
  );
}
