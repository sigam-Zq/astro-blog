import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import Markdown from "./Markdown";
import {
  Button,
  Input,
  Textarea,
  Dialog,
  Callout,
  Tag,
  Loading,
  EditorTabs,
} from "./ui";
import {
  type Document,
  type Entry,
  type Metadata,
  type Session,
} from "./types";
import "./diary.css";

type Route = { view: string; id: string };
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
function routeAtLocation(): Route {
  const p = new URLSearchParams(location.search);
  const view = p.get("view") || "list";
  return {
    view: ["list", "new", "read", "edit"].includes(view) ? view : "list",
    id: p.get("id") || "",
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [reload, setReload] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Metadata | Entry | null>(
    null
  );
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmResolve = useRef<((answer: boolean) => void) | null>(null);
  const [dark, setDark] = useState(
    () => window.document.documentElement.dataset.theme === "dark"
  );
  useEffect(() => {
    const root = window.document.documentElement;
    const observer = new MutationObserver(() =>
      setDark(root.dataset.theme === "dark")
    );
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
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
  const generation = useRef(0);
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
    settleConfirmation(false);
    setChecking(false);
  }, []);
  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (init.body) headers.set("Content-Type", "application/json");
      if (init.method && !["GET", "HEAD"].includes(init.method))
        headers.set("X-CSRF-Token", sessionRef.current?.csrfToken || "");
      const response = await fetch(`/api/v1${path}`, {
        ...init,
        headers,
        credentials: "same-origin",
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
  const go = (url: string, replace = false) => {
    generation.current++;
    history[replace ? "replaceState" : "pushState"]({}, "", url);
    currentURL.current = location.pathname + location.search;
    setRoute(routeAtLocation());
    const f = filtersAtLocation();
    if (!new URLSearchParams(location.search).get("view")) {
      setFilters(f);
      setSearch(f.q);
    }
    setError("");
    setNotice("");
    setConflict(false);
    setPreview(false);
    setReload((n) => n + 1);
  };
  const navigate = (url: string) => {
    if (busy || uncertain) {
      setError("请先核对当前操作结果");
      return;
    }
    if (dirty) {
      setLeaveTo(url);
      return;
    }
    go(url);
  };
  const navRef = useRef(navigate);
  navRef.current = navigate;
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (editRef.current.dirty || operation.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const pop = () => {
      const target = location.pathname + location.search;
      history.replaceState({}, "", currentURL.current);
      navRef.current(target);
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.q) updateFilters({ q: search });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  function updateFilters(update: Partial<Filters>) {
    const next = { ...filters, ...update, page: update.page ?? 1 };
    setFilters(next);
    const url = listURL(next);
    history.replaceState({}, "", url);
    currentURL.current = url;
    listReturn.current = url;
  }
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const gen = ++generation.current;
    let active = true;
    const current = () => active && gen === generation.current;
    setError("");
    setLoading(true);
    setEntry(null);
    setConflict(false);
    async function load() {
      if (route.view === "list") {
        listReturn.current = listURL(filters);
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(filters))
          if (v) p.set(k, String(v));
        const data = await request<{ items: Metadata[]; total: number }>(
          `/diaries?${p}`,
          { signal: controller.signal }
        );
        if (current()) {
          setItems(data.items);
          setTotal(data.total);
        }
      } else if (route.view === "new") {
        const id = route.id || crypto.randomUUID();
        if (!validID.test(id)) throw new Error("日记 ID 无效");
        if (!route.id) {
          history.replaceState({}, "", `/diary/?view=new&id=${id}`);
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
          setError(e.message);
          if (route.view === "list") {
            setItems([]);
            setTotal(0);
          }
        }
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    session,
    route.view,
    route.id,
    filters.q,
    filters.tag,
    filters.dateFrom,
    filters.dateTo,
    filters.page,
    reload,
  ]);
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
        title: "退出登录？",
        message: "退出将丢弃当前页面的未保存内容。",
        confirmLabel: "放弃修改并退出",
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await request("/auth/logout", { method: "POST" });
      clearSensitive(false);
      channel.current?.postMessage("logout");
      go("/diary/", true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(destination?: string) {
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
      if (destination) {
        setLeaveTo(null);
        go(destination);
      } else if (route.view === "new") {
        const url = `/diary/?view=edit&id=${saved.id}`;
        history.replaceState({}, "", url);
        currentURL.current = url;
        setRoute({ view: "edit", id: saved.id });
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
      go(listReturn.current);
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s" &&
        sessionRef.current &&
        ["edit", "new"].includes(editRef.current.route.view)
      ) {
        e.preventDefault();
        if (!modalOpen.current) void saveRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const editing = route.view === "new" || route.view === "edit";
  const activeFilters = [filters.tag, filters.dateFrom, filters.dateTo].filter(
    Boolean
  ).length;
  const displayed = entry?.document || document;
  return (
    <div class={`diary-app ${dark ? "wa-dark" : "wa-light"}`} lang="zh-CN">
      <div class="diary-heading">
        <div>
          <p class="diary-eyebrow">PRIVATE JOURNAL</p>
          <h1>私人日记</h1>
          <p class="diary-muted">记录日常，留给自己。</p>
        </div>
        {session && (
          <Button disabled={busy} onClick={logout}>
            退出登录
          </Button>
        )}
      </div>
      {error && (
        <Callout class="diary-error">
          {error}
          {session && !editing && (
            <Button onClick={() => setReload((n) => n + 1)}>重试</Button>
          )}
        </Callout>
      )}
      {checking ? (
        <Loading>正在检查登录状态…</Loading>
      ) : !session ? (
        <form class="diary-login diary-panel" onSubmit={login}>
          <h2>登录日记</h2>
          <p class="diary-muted">输入账号和密码，查看私密记录。</p>
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
            class="diary-primary"
            type="submit"
            disabled={busy}
            loading={busy}
          >
            {busy ? "登录中…" : "登录"}
          </Button>
        </form>
      ) : (
        <>
          {route.view === "list" ? (
            <>
              <div class="diary-toolbar">
                <h2>
                  我的日记{" "}
                  <span class="diary-muted">{loading ? "…" : total}</span>
                </h2>
                <Button
                  class="diary-primary"
                  disabled={busy || uncertain}
                  onClick={() => navigate("/diary/?view=new")}
                >
                  写日记
                </Button>
              </div>
              <form
                class="diary-filters diary-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateFilters({ q: search });
                }}
              >
                <Input
                  class="diary-search"
                  label="关键词"
                  type="search"
                  placeholder="搜索标题、标签或正文"
                  maxLength={100}
                  value={search}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
                <Button
                  class="diary-filter-toggle"
                  type="button"
                  aria-expanded={showFilters}
                  aria-controls="diary-filter-options"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? "收起筛选" : "更多筛选"}
                  {activeFilters > 0 && `（${activeFilters}）`}
                </Button>
                <div
                  id="diary-filter-options"
                  class={`diary-filter-options${showFilters ? " is-open" : ""}`}
                >
                  <Input
                    label="标签"
                    placeholder="精确标签"
                    maxLength={20}
                    value={filters.tag}
                    onInput={(e) =>
                      updateFilters({ tag: e.currentTarget.value })
                    }
                  />
                  <Input
                    label="开始日期"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      updateFilters({ dateFrom: e.currentTarget.value })
                    }
                  />
                  <Input
                    label="结束日期"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      updateFilters({ dateTo: e.currentTarget.value })
                    }
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      updateFilters(emptyFilters);
                    }}
                  >
                    清除筛选
                  </Button>
                </div>
              </form>
              {loading ? (
                <Loading>正在加载日记…</Loading>
              ) : !items.length && !error ? (
                <div class="diary-empty diary-panel">
                  <h3>
                    {Object.entries(filters).some(([k, v]) => k !== "page" && v)
                      ? "没有匹配结果"
                      : "写下第一篇日记"}
                  </h3>
                  <p class="diary-muted">
                    {total ? "试试其他筛选条件。" : "从今天的一件小事开始。"}
                  </p>
                </div>
              ) : (
                <div class="diary-list">
                  {items.map((item) => (
                    <article key={item.id} class="diary-panel diary-card">
                      <div>
                        <span class="diary-muted">{item.diaryDate}</span>
                      </div>
                      <h3>
                        <a
                          href={`/diary/?view=read&id=${item.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(e.currentTarget.getAttribute("href")!);
                          }}
                        >
                          {item.title}
                        </a>
                      </h3>
                      <p class="diary-excerpt">{item.excerpt}</p>
                      <div class="diary-tags">
                        {item.tags?.map((t) => (
                          <Tag>{t}</Tag>
                        ))}
                      </div>
                      <div class="diary-card-bottom">
                        <small class="diary-muted">
                          更新于 {timestamp(item.updatedAt)}
                        </small>
                        <div>
                          <Button
                            onClick={() =>
                              navigate(`/diary/?view=edit&id=${item.id}`)
                            }
                          >
                            编辑
                          </Button>
                          <Button
                            class="diary-danger"
                            disabled={busy}
                            onClick={() => setDeleteTarget(item)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {total > 20 && (
                <div class="diary-pagination">
                  <Button
                    disabled={filters.page <= 1 || loading}
                    onClick={() => updateFilters({ page: filters.page - 1 })}
                  >
                    上一页
                  </Button>
                  <span>
                    {filters.page} / {Math.ceil(total / 20)}
                  </span>
                  <Button
                    disabled={filters.page * 20 >= total || loading}
                    onClick={() => updateFilters({ page: filters.page + 1 })}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <Button
                class="diary-back"
                disabled={busy}
                onClick={() => navigate(listReturn.current)}
              >
                ← 返回日记列表
              </Button>
              {loading ? (
                <Loading>正在加载…</Loading>
              ) : editing && (route.view === "new" || entry) ? (
                <>
                  <div class="diary-toolbar">
                    <h2>{route.view === "new" ? "写日记" : "编辑日记"}</h2>
                    <span class="diary-muted" role="status">
                      {notice ||
                        (dirty
                          ? "未保存"
                          : entry
                          ? `已保存于 ${timestamp(entry.updatedAt)}`
                          : "尚未保存")}
                    </span>
                  </div>
                  {conflict && (
                    <Callout variant="warning" class="diary-conflict">
                      <p>请先复制当前输入，再载入最新版本进行合并。</p>
                      <Button
                        onClick={() =>
                          navigator.clipboard
                            .writeText(document.contentMarkdown)
                            .then(() => setNotice("正文已复制"))
                            .catch(() => setError("复制失败，请手动复制正文"))
                        }
                      >
                        复制正文
                      </Button>
                      <Button
                        onClick={async () => {
                          if (
                            await ask({
                              title: "载入最新版本？",
                              message:
                                "载入最新版本会丢弃当前输入，请先复制需要保留的内容。",
                              confirmLabel: "载入最新版本",
                              danger: true,
                            })
                          ) {
                            operation.current = null;
                            setUncertain(false);
                            resume.current = null;
                            setReload((n) => n + 1);
                          }
                        }}
                      >
                        载入最新版本
                      </Button>
                    </Callout>
                  )}
                  <fieldset
                    disabled={busy || uncertain}
                    class="diary-editor-fields"
                  >
                    <div class="diary-panel">
                      <Input
                        label="标题"
                        value={document.title}
                        maxLength={100}
                        placeholder="给今天起个标题"
                        onInput={(e) =>
                          setDocument({
                            ...document,
                            title: e.currentTarget.value,
                          })
                        }
                      />
                      <div class="diary-editor-meta">
                        <Input
                          label="日记日期"
                          type="date"
                          value={document.diaryDate}
                          onChange={(e) =>
                            setDocument({
                              ...document,
                              diaryDate: e.currentTarget.value,
                            })
                          }
                        />
                        <Input
                          label="标签"
                          value={tags}
                          placeholder="逗号分隔，最多 10 个"
                          onInput={(e) => setTags(e.currentTarget.value)}
                        />
                      </div>
                    </div>
                    <EditorTabs
                      preview={preview}
                      onChange={setPreview}
                      editor={
                        <div class="diary-panel">
                          <Textarea
                            label="正文"
                            rows={20}
                            disabled={busy || uncertain}
                            value={document.contentMarkdown}
                            placeholder="今天发生了什么？"
                            onInput={(e) =>
                              setDocument({
                                ...document,
                                contentMarkdown: e.currentTarget.value,
                              })
                            }
                          />
                        </div>
                      }
                      reader={
                        <div class="diary-panel">
                          {preview && (
                            <Markdown content={document.contentMarkdown} />
                          )}
                        </div>
                      }
                    />
                  </fieldset>
                  <div class="diary-actions diary-save-actions">
                    <Button
                      class="diary-primary"
                      disabled={busy || conflict}
                      loading={busy}
                      onClick={() => save()}
                    >
                      {busy
                        ? "保存中…"
                        : uncertain
                        ? "核对并重试原操作"
                        : "保存"}
                    </Button>
                  </div>
                </>
              ) : entry ? (
                <article class="diary-panel diary-reader">
                  <div class="diary-toolbar">
                    <span class="diary-muted">私密日记</span>
                    <div>
                      <Button
                        onClick={() =>
                          navigate(`/diary/?view=edit&id=${entry.id}`)
                        }
                      >
                        编辑
                      </Button>
                      <Button
                        class="diary-danger"
                        onClick={() => setDeleteTarget(entry)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                  <p class="diary-muted">{displayed.diaryDate}</p>
                  <h2>{displayed.title}</h2>
                  <div class="diary-tags">
                    {displayed.tags.map((t) => (
                      <Tag>{t}</Tag>
                    ))}
                  </div>
                  <Markdown content={displayed.contentMarkdown} />
                </article>
              ) : !error ? (
                <p>日记不存在。</p>
              ) : null}
            </>
          )}
        </>
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
          onClose={() => setLeaveTo(null)}
          footer={
            <>
              <Button
                disabled={busy || uncertain}
                onClick={() => setLeaveTo(null)}
              >
                继续编辑
              </Button>
              <Button
                disabled={busy || uncertain}
                onClick={() => {
                  const to = leaveTo;
                  setLeaveTo(null);
                  go(to);
                }}
              >
                放弃修改
              </Button>
              <Button
                class="diary-primary"
                disabled={busy || conflict}
                loading={busy}
                onClick={() => save(leaveTo)}
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
