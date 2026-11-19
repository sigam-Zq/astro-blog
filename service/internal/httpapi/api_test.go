package httpapi

import (
	"context"
	"diary/internal/auth"
	"diary/internal/diary"
	"diary/internal/storage"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

type testStore struct {
	mu   sync.Mutex
	data map[string][]byte
}

func (s *testStore) Get(_ context.Context, k string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.data[k]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return append([]byte{}, b...), nil
}
func (s *testStore) Put(_ context.Context, k string, b []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[k] = append([]byte{}, b...)
	return nil
}
func (s *testStore) Delete(_ context.Context, k string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, k)
	return nil
}
func (s *testStore) List(_ context.Context, p string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []string{}
	for k := range s.data {
		if strings.HasPrefix(k, p) {
			out = append(out, k)
		}
	}
	return out, nil
}
func setup(t *testing.T, origin string) http.Handler {
	t.Helper()
	en := diary.New(&testStore{data: map[string][]byte{}})
	if err := en.Recover(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	h, _ := auth.HashPassword("test-password")
	a, _ := auth.New("test-owner", h)
	return (&API{en, a, origin}).Handler()
}
func call(h http.Handler, method, path, body, origin, csrf string, cookie *http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", origin)
	r.Header.Set("X-CSRF-Token", csrf)
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func TestAuthenticatedCRUDAndSecurity(t *testing.T) {
	const origin = "https://diary.example.com"
	h := setup(t, origin)
	for _, method := range []string{"GET", "PUT", "DELETE"} {
		if w := call(h, method, "/api/v1/diaries/a0000000-0000-4000-8000-000000000001", "{}", origin, "", nil); w.Code != 401 {
			t.Fatal("unauthorized", method, w.Code)
		}
	}
	loginBody := `{"username":"test-owner","password":"test-password"}`
	if w := call(h, "POST", "/api/v1/auth/login", loginBody, "https://evil.example.com", "", nil); w.Code != 403 {
		t.Fatal("login origin")
	}
	w := call(h, "POST", "/api/v1/auth/login", loginBody, origin, "", nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("cookie missing")
	}
	c := cookies[0]
	if !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.Path != "/" || c.Domain != "" {
		t.Fatal("cookie flags")
	}
	var session auth.Session
	_ = json.Unmarshal(w.Body.Bytes(), &session)
	id := "a0000000-0000-4000-8000-000000000001"
	body := `{"expectedRevision":0,"mutationId":"b0000000-0000-4000-8000-000000000001","document":{"title":"private","diaryDate":"2026-10-17","tags":["生活"],"contentMarkdown":"秘密正文"}}`
	if w = call(h, "PUT", "/api/v1/diaries/"+id, body, origin, "wrong", c); w.Code != 403 {
		t.Fatal("csrf")
	}
	if w = call(h, "PUT", "/api/v1/diaries/"+id, body, origin, session.CSRFToken, c); w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call(h, "GET", "/api/v1/diaries?q=秘密", "", origin, "", c); w.Code != 200 || !strings.Contains(w.Body.String(), `"total":1`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("cache")
	}
	if w = call(h, "GET", "/api/v1/diaries?page=-1", "", origin, "", c); w.Code != 400 {
		t.Fatal("invalid pagination")
	}
	if w = call(h, "PUT", "/api/v1/diaries/"+id, strings.Repeat(" ", 1<<20+1), origin, session.CSRFToken, c); w.Code != 413 {
		t.Fatal("body limit", w.Code)
	}
	if w = call(h, "POST", "/api/v1/auth/logout", "", origin, session.CSRFToken, c); w.Code != 204 {
		t.Fatal("logout", w.Code)
	}
	if w = call(h, "GET", "/api/v1/diaries", "", origin, "", c); w.Code != 401 {
		t.Fatal("revoked session")
	}
}

// Explicit opt-in browser fixture, compiled only by go test, never into the
// application. It uses disposable in-memory storage and public test credentials.
func TestBrowserHarness(t *testing.T) {
	if os.Getenv("DIARY_BROWSER_TEST") != "1" {
		t.Skip("opt-in local browser fixture")
	}
	origin := os.Getenv("DIARY_BROWSER_ORIGIN")
	if origin == "" {
		origin = "http://localhost:4321"
	}
	addr := os.Getenv("DIARY_BROWSER_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	h := setup(t, origin)
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}
	defer srv.Close()
	done := make(chan error, 1)
	go func() { done <- srv.ListenAndServe() }()
	fmt.Println("BROWSER_FIXTURE_READY test-owner / test-password")
	select {
	case err := <-done:
		t.Fatal(err)
	case <-time.After(15 * time.Minute):
	}
}

func TestHTTPLoginSessionAndLogout(t *testing.T) {
	const origin = "http://localhost:4321"
	h := setup(t, origin)
	w := call(h, "POST", "/api/v1/auth/login", `{"username":"test-owner","password":"test-password"}`, origin, "", nil)
	if w.Code != 200 {
		t.Fatal("HTTP login", w.Code)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatal("missing cookie")
	}
	c := cookies[0]
	if c.Name != auth.HTTPCookieName || c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Fatal("HTTP cookie attributes")
	}
	var session auth.Session
	_ = json.Unmarshal(w.Body.Bytes(), &session)
	if w = call(h, "GET", "/api/v1/auth/session", "", origin, "", c); w.Code != 200 {
		t.Fatal("HTTP session not retained", w.Code)
	}
	if w = call(h, "POST", "/api/v1/auth/logout", "", origin, "bad", c); w.Code != 403 {
		t.Fatal("HTTP must still validate CSRF", w.Code)
	}
	if w = call(h, "POST", "/api/v1/auth/logout", "", origin, session.CSRFToken, c); w.Code != 204 {
		t.Fatal("HTTP logout", w.Code)
	}
	expired := w.Result().Cookies()
	if len(expired) != 1 || expired[0].Name != c.Name || expired[0].MaxAge != -1 || expired[0].Secure {
		t.Fatal("HTTP cookie not cleared")
	}
	if w = call(h, "GET", "/api/v1/auth/session", "", origin, "", c); w.Code != 401 {
		t.Fatal("session not revoked")
	}
}

func TestUnavailableAndUncertainResponsesAreDistinct(t *testing.T) {
	for _, tc := range []struct {
		err  error
		code string
	}{{diary.ErrUnavailable, "SERVICE_UNAVAILABLE"}, {diary.ErrWriteOutcomeUnknown, "WRITE_OUTCOME_UNKNOWN"}} {
		r := httptest.NewRequest("PUT", "/api/v1/diaries/fixture", nil)
		w := httptest.NewRecorder()
		diaryError(w, r, tc.err)
		var b errorBody
		if err := json.Unmarshal(w.Body.Bytes(), &b); err != nil {
			t.Fatal(err)
		}
		if w.Code != 503 || b.Error.Code != tc.code {
			t.Fatal(w.Code, b.Error.Code, tc.code)
		}
	}
}

func TestRemovedDraftPayloadIsRejected(t *testing.T) {
	const origin = "https://diary.example.com"
	h := setup(t, origin)
	w := call(h, "POST", "/api/v1/auth/login", `{"username":"test-owner","password":"test-password"}`, origin, "", nil)
	var session auth.Session
	_ = json.Unmarshal(w.Body.Bytes(), &session)
	cookie := w.Result().Cookies()[0]
	body := `{"expectedRevision":0,"mutationId":"b0000000-0000-4000-8000-000000000001","action":"save_draft","draft":{"title":"removed","diaryDate":"2026-10-17","tags":[],"contentMarkdown":"body"}}`
	w = call(h, "PUT", "/api/v1/diaries/a0000000-0000-4000-8000-000000000001", body, origin, session.CSRFToken, cookie)
	if w.Code != 400 {
		t.Fatal("removed draft API is still accepted", w.Code)
	}
}
