package httpapi

import (
	"context"
	"crypto/subtle"
	"diary/internal/auth"
	"diary/internal/diary"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type API struct {
	Engine *diary.Engine
	Auth   *auth.Manager
	Origin string
}
type errorBody struct {
	Error struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
		RequestID string `json:"requestId"`
	} `json:"error"`
}

func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func fail(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	var b errorBody
	b.Error.Code = code
	b.Error.Message = message
	b.Error.RequestID = w.Header().Get("X-Request-ID")
	write(w, status, b)
}
func body(w http.ResponseWriter, r *http.Request, v any) bool {
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "application/json" {
		fail(w, r, 400, "INVALID_REQUEST", "需要 JSON 请求")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	err = d.Decode(v)
	if err == nil {
		var extra any
		if d.Decode(&extra) != io.EOF {
			err = errors.New("extra JSON")
		}
	}
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			fail(w, r, 413, "BODY_TOO_LARGE", "请求内容过大")
		} else {
			fail(w, r, 400, "INVALID_REQUEST", "请求参数无效")
		}
		return false
	}
	return true
}
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if !a.Engine.Ready() {
			fail(w, r, 503, "NOT_READY", "服务准备中")
			return
		}
		write(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/v1/auth/login", a.login)
	mux.HandleFunc("GET /api/v1/auth/session", a.protected(func(w http.ResponseWriter, r *http.Request, s auth.Session) { write(w, 200, s) }))
	mux.HandleFunc("POST /api/v1/auth/logout", a.protected(func(w http.ResponseWriter, r *http.Request, s auth.Session) {
		c, _ := r.Cookie(a.cookieName())
		a.Auth.Logout(c.Value)
		http.SetCookie(w, a.cookie("", time.Unix(1, 0), -1))
		w.WriteHeader(204)
	}))
	mux.HandleFunc("GET /api/v1/diaries", a.protected(a.list))
	mux.HandleFunc("GET /api/v1/diaries/{id}", a.protected(a.get))
	mux.HandleFunc("PUT /api/v1/diaries/{id}", a.protected(a.mutate))
	mux.HandleFunc("DELETE /api/v1/diaries/{id}", a.protected(a.mutate))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		tracked := &responseStatus{ResponseWriter: w, status: 200}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Request-ID", auth.Token()[:16])
		w.Header().Set("Referrer-Policy", "no-referrer")
		if a.Origin != "" && r.Header.Get("Origin") == a.Origin {
			w.Header().Set("Access-Control-Allow-Origin", a.Origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		mux.ServeHTTP(tracked, r)
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		slog.Info("request", "requestId", w.Header().Get("X-Request-ID"), "route", route, "status", tracked.status, "duration_ms", time.Since(start).Milliseconds())
	})
}
func (a *API) cookie(token string, expires time.Time, maxAge int) *http.Cookie {
	return &http.Cookie{Name: a.cookieName(), Value: token, Path: "/", Secure: strings.HasPrefix(a.Origin, "https://"), HttpOnly: true, SameSite: http.SameSiteStrictMode, Expires: expires, MaxAge: maxAge}
}
func (a *API) login(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != a.Origin {
		fail(w, r, 403, "FORBIDDEN", "请求来源无效")
		return
	}
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !body(w, r, &in) {
		return
	}
	if len(in.Username) > 256 || len(in.Password) > 1024 {
		fail(w, r, 400, "INVALID_REQUEST", "输入过长")
		return
	}
	// Forwarded headers are deliberately ignored; the proxy must also limit logins.
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	token, s, retry := a.Auth.Login(in.Username, in.Password, ip)
	if retry > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		fail(w, r, 429, "RATE_LIMITED", "登录频繁，请稍后重试")
		return
	}
	if token == "" {
		fail(w, r, 401, "INVALID_CREDENTIALS", "账号或密码错误")
		return
	}
	if old, err := r.Cookie(a.cookieName()); err == nil {
		a.Auth.Logout(old.Value)
	}
	http.SetCookie(w, a.cookie(token, s.ExpiresAt, 12*60*60))
	write(w, 200, s)
}
func (a *API) protected(next func(http.ResponseWriter, *http.Request, auth.Session)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(a.cookieName())
		if err != nil {
			fail(w, r, 401, "UNAUTHENTICATED", "请先登录")
			return
		}
		s, ok := a.Auth.Session(c.Value)
		if !ok {
			fail(w, r, 401, "UNAUTHENTICATED", "请重新登录")
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			if r.Header.Get("Origin") != a.Origin || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.CSRFToken)) != 1 {
				fail(w, r, 403, "FORBIDDEN", "请求来源或校验令牌无效")
				return
			}
		}
		next(w, r, s)
	}
}
func diaryError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, diary.ErrNotFound):
		fail(w, r, 404, "NOT_FOUND", "日记不存在")
	case errors.Is(err, diary.ErrConflict):
		fail(w, r, 409, "REVISION_CONFLICT", "日记已更新或操作冲突，请载入最新版本")
	case errors.Is(err, diary.ErrWriteOutcomeUnknown):
		fail(w, r, 503, "WRITE_OUTCOME_UNKNOWN", "操作结果待确认，请在恢复后核对或重试原操作")
	case errors.Is(err, diary.ErrUnavailable):
		fail(w, r, 503, "SERVICE_UNAVAILABLE", "服务或索引尚未就绪，本次操作未提交，请稍后重试")
	default:
		fail(w, r, 400, "INVALID_REQUEST", err.Error())
	}
}
func entryResult(en diary.Entry) any {
	return map[string]any{"id": en.ID, "revision": en.Revision, "document": en.Document, "createdAt": en.CreatedAt, "updatedAt": en.UpdatedAt, "deletedAt": en.DeletedAt}
}
func (a *API) get(w http.ResponseWriter, r *http.Request, _ auth.Session) {
	id := r.PathValue("id")
	if !diary.ValidID(id) {
		fail(w, r, 400, "INVALID_REQUEST", "日记 ID 无效")
		return
	}
	en, err := a.Engine.Get(r.Context(), id)
	if err != nil {
		diaryError(w, r, err)
		return
	}
	write(w, 200, entryResult(en))
}
func (a *API) mutate(w http.ResponseWriter, r *http.Request, _ auth.Session) {
	var m diary.Mutation
	if !body(w, r, &m) {
		return
	}
	deleting := r.Method == "DELETE"
	// Once an operation starts, a disconnected browser cannot cancel its commit.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 90*time.Second)
	defer cancel()
	en, err := a.Engine.Mutate(ctx, r.PathValue("id"), m, deleting)
	if err != nil {
		diaryError(w, r, err)
		return
	}
	if deleting {
		write(w, 200, map[string]any{"id": en.ID, "revision": en.Revision, "deletedAt": en.DeletedAt})
		return
	}
	status := 200
	if m.ExpectedRevision == 0 {
		status = 201
	}
	write(w, status, entryResult(en))
}
func (a *API) list(w http.ResponseWriter, r *http.Request, _ auth.Session) {
	q := r.URL.Query()
	f := diary.Filter{Query: strings.TrimSpace(q.Get("q")), Tag: q.Get("tag"), DateFrom: q.Get("dateFrom"), DateTo: q.Get("dateTo"), Page: 1, PageSize: 20}
	invalid := false
	if v := q.Get("page"); v != "" {
		n, e := strconv.Atoi(v)
		invalid = e != nil || n < 1 || n > 1000000
		f.Page = n
	}
	if v := q.Get("pageSize"); v != "" {
		n, e := strconv.Atoi(v)
		invalid = invalid || e != nil || n < 1 || n > 100
		f.PageSize = n
	}
	if utf8.RuneCountInString(f.Query) > 100 || len(strings.Fields(f.Query)) > 10 || utf8.RuneCountInString(f.Tag) > 20 {
		invalid = true
	}

	for _, date := range []string{f.DateFrom, f.DateTo} {
		if date != "" {
			if _, err := time.Parse("2006-01-02", date); err != nil {
				invalid = true
			}
		}
	}
	if f.DateFrom != "" && f.DateTo != "" && f.DateFrom > f.DateTo {
		invalid = true
	}
	if invalid {
		fail(w, r, 400, "INVALID_REQUEST", "检索或分页参数无效")
		return
	}
	out, err := a.Engine.List(r.Context(), f)
	if err != nil {
		diaryError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(out.Items))
	for _, m := range out.Items {
		items = append(items, map[string]any{"id": m.ID, "revision": m.Revision, "title": m.Title, "diaryDate": m.DiaryDate, "tags": m.Tags, "excerpt": m.Excerpt, "createdAt": m.CreatedAt, "updatedAt": m.UpdatedAt})
	}
	write(w, 200, map[string]any{"items": items, "total": out.Total, "page": out.Page, "pageSize": out.PageSize})
}

type responseStatus struct {
	http.ResponseWriter
	status int
}

func (w *responseStatus) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }

func (a *API) cookieName() string {
	if strings.HasPrefix(a.Origin, "https://") {
		return auth.CookieName
	}
	return auth.HTTPCookieName
}
