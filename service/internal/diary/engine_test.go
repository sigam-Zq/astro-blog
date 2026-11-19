package diary

import (
	"context"
	"diary/internal/storage"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
)

type memoryStore struct {
	mu          sync.Mutex
	objects     map[string][]byte
	failAt      string
	failAfter   bool
	gets, lists int
}

func newMemory() *memoryStore { return &memoryStore{objects: map[string][]byte{}} }
func (s *memoryStore) Get(_ context.Context, k string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gets++
	v, ok := s.objects[k]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return append([]byte{}, v...), nil
}
func (s *memoryStore) Put(_ context.Context, k string, b []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fail := s.failAt == "put:"+k
	if !fail || s.failAfter {
		s.objects[k] = append([]byte{}, b...)
	}
	if fail {
		s.failAt = ""
		return errors.New("injected write failure")
	}
	return nil
}
func (s *memoryStore) Delete(_ context.Context, k string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fail := s.failAt == "delete:"+k
	if !fail || s.failAfter {
		delete(s.objects, k)
	}
	if fail {
		s.failAt = ""
		return errors.New("injected delete failure")
	}
	return nil
}
func (s *memoryStore) List(_ context.Context, prefix string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lists++
	out := []string{}
	for k := range s.objects {
		if strings.HasPrefix(k, prefix) {
			out = append(out, k)
		}
	}
	return out, nil
}

const testID = "a0000000-0000-4000-8000-000000000001"

func mutation(n, rev int, text string) Mutation {
	return Mutation{ExpectedRevision: rev, MutationID: fmt.Sprintf("b0000000-0000-4000-8000-%012d", n), Document: Document{Title: "周末散记", DiaryDate: "2026-10-17", Tags: []string{"生活"}, Content: text}}
}
func initialized(t *testing.T) (*Engine, *memoryStore) {
	t.Helper()
	s := newMemory()
	e := New(s)
	if err := e.Recover(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	return e, s
}
func TestSaveConflictDeleteAndSearch(t *testing.T) {
	e, s := initialized(t)
	ctx := context.Background()
	first := mutation(1, 0, "今天去了公园 Hello")
	en, err := e.Mutate(ctx, testID, first, false)
	if err != nil || en.State() != "active" {
		t.Fatal("save", err)
	}
	raw := s.objects[entryKey(testID)]
	if !strings.HasPrefix(string(raw), "---\n") || !strings.HasSuffix(string(raw), first.Document.Content) {
		t.Fatal("diary must be Markdown with frontmatter")
	}
	if _, exists := s.objects[legacyKey(testID)]; exists {
		t.Fatal("new save wrote legacy JSON")
	}
	same, err := e.Mutate(ctx, testID, first, false)
	if err != nil || same.Revision != 1 {
		t.Fatal("retry incremented revision", err)
	}
	changed := first
	changed.Document.Content = "different"
	if _, err = e.Mutate(ctx, testID, changed, false); !errors.Is(err, ErrConflict) {
		t.Fatal("mutation conflict", err)
	}
	en, err = e.Mutate(ctx, testID, mutation(2, 1, "更新内容 Hello"), false)
	if err != nil || en.Document.Content != "更新内容 Hello" || en.Revision != 2 {
		t.Fatal("edit must immediately update document", err)
	}
	if _, err = e.Mutate(ctx, testID, mutation(3, 1, "stale"), false); !errors.Is(err, ErrConflict) {
		t.Fatal("stale write", err)
	}
	list, err := e.List(ctx, Filter{Query: "更新内容 HELLO", Tag: "生活", DateFrom: "2026-10-17", DateTo: "2026-10-17", Page: 1, PageSize: 20})
	if err != nil || list.Total != 1 {
		t.Fatal("search", err)
	}
	list, _ = e.List(ctx, Filter{Query: "公园", Page: 1, PageSize: 20})
	if list.Total != 0 {
		t.Fatal("old document still searchable")
	}
	del := Mutation{ExpectedRevision: 2, MutationID: "c0000000-0000-4000-8000-000000000001"}
	en, err = e.Mutate(ctx, testID, del, true)
	if err != nil || en.DeletedAt == nil {
		t.Fatal(err)
	}
	if _, err = e.Get(ctx, testID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted visible", err)
	}
	if _, err = e.Mutate(ctx, testID, del, true); err != nil {
		t.Fatal("delete retry", err)
	}
	reboot := New(s)
	if err = reboot.Recover(ctx, false); err != nil {
		t.Fatal(err)
	}
	list, _ = reboot.List(ctx, Filter{Query: "Hello", Page: 1, PageSize: 20})
	if list.Total != 0 {
		t.Fatal("deleted searchable")
	}
	if m := reboot.cat.Items[testID]; m.Title != "" || m.Excerpt != "" || len(m.Tags) > 0 {
		t.Fatal("deleted metadata contains content")
	}
}
func TestEveryCommitBoundaryRecovers(t *testing.T) {
	for _, stage := range []string{"put:" + pendingKey, "put:" + entryKey(testID), "put:" + catalogKey, "put:" + shardKey('a'), "delete:" + pendingKey} {
		for _, after := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/after=%t", stage, after), func(t *testing.T) {
				e, s := initialized(t)
				s.failAt = stage
				s.failAfter = after
				m := mutation(1, 0, "recover me")
				if _, err := e.Mutate(context.Background(), testID, m, false); !errors.Is(err, ErrWriteOutcomeUnknown) {
					t.Fatal("expected uncertain result", err)
				}
				if e.Ready() {
					t.Fatal("partial commit ready")
				}
				reboot := New(s)
				if err := reboot.Recover(context.Background(), false); err != nil {
					t.Fatal(err)
				}
				// If the intent itself never landed, the exact retry creates it now.
				en, err := reboot.Mutate(context.Background(), testID, m, false)
				if err != nil || en.Revision != 1 {
					t.Fatal("idempotent recovery", err, en.Revision)
				}
				list, err := reboot.List(context.Background(), Filter{Query: "recover", Page: 1, PageSize: 20})
				if err != nil || list.Total != 1 {
					t.Fatal("recovered index", err)
				}
			})
		}
	}
}
func TestNormalStartupUsesCatalogOnlyAndSearchIsLazy(t *testing.T) {
	e, s := initialized(t)
	if _, err := e.Mutate(context.Background(), testID, mutation(1, 0, "needle"), false); err != nil {
		t.Fatal(err)
	}
	s.gets = 0
	s.lists = 0
	reboot := New(s)
	if err := reboot.Recover(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if s.gets != 2 || s.lists != 0 || len(reboot.shards) != 0 {
		t.Fatalf("startup gets=%d lists=%d cached=%d", s.gets, s.lists, len(reboot.shards))
	}
	f := Filter{Page: 1, PageSize: 20}
	if _, err := reboot.List(context.Background(), f); err != nil {
		t.Fatal(err)
	}
	if s.gets != 2 {
		t.Fatal("listing read body")
	}
	f.Query = "needle"
	if _, err := reboot.List(context.Background(), f); err != nil {
		t.Fatal(err)
	}
	if s.gets != 18 {
		t.Fatal("search did not load exactly 16 shards", s.gets)
	}
	if _, err := reboot.List(context.Background(), f); err != nil {
		t.Fatal(err)
	}
	if s.gets != 18 {
		t.Fatal("cache not reused")
	}
}
func TestCorruptCatalogRebuildAndInterruptedRebuild(t *testing.T) {
	e, s := initialized(t)
	_, _ = e.Mutate(context.Background(), testID, mutation(1, 0, "still here"), false)
	s.objects[catalogKey] = []byte("broken")
	s.failAt = "put:" + shardKey('a')
	broken := New(s)
	if err := broken.Recover(context.Background(), false); err == nil || broken.Ready() {
		t.Fatal("partial rebuild should fail")
	}
	restarted := New(s)
	if err := restarted.Recover(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.Get(context.Background(), testID); err != nil {
		t.Fatal(err)
	}
}
func TestConcurrentWritersOnlyOneWins(t *testing.T) {
	e, _ := initialized(t)
	ctx := context.Background()
	_, _ = e.Mutate(ctx, testID, mutation(1, 0, "initial"), false)
	results := make(chan error, 2)
	for i := 2; i <= 3; i++ {
		go func(n int) {
			_, err := e.Mutate(ctx, testID, mutation(n, 1, "concurrent"), false)
			results <- err
		}(i)
	}
	a, b := <-results, <-results
	if !((a == nil && errors.Is(b, ErrConflict)) || (b == nil && errors.Is(a, ErrConflict))) {
		t.Fatal(a, b)
	}
}
func TestValidation(t *testing.T) {
	for _, body := range []string{"", "   "} {
		m := mutation(1, 0, body)
		if err := m.Validate(false); err == nil {
			t.Fatal("accepted empty body")
		}
	}
	m := mutation(1, 0, "body")
	m.Document.DiaryDate = "2026-02-30"
	if err := m.Validate(false); err == nil {
		t.Fatal("accepted invalid date")
	}
}

func TestMissingSearchShardTriggersRepair(t *testing.T) {
	e, s := initialized(t)
	ctx := context.Background()
	if _, err := e.Mutate(ctx, testID, mutation(1, 0, "find me"), false); err != nil {
		t.Fatal(err)
	}
	delete(s.objects, shardKey('a'))
	reboot := New(s)
	if err := reboot.Recover(ctx, false); err != nil {
		t.Fatal(err)
	}
	f := Filter{Query: "find", Page: 1, PageSize: 20}
	if _, err := reboot.List(ctx, f); !errors.Is(err, ErrUnavailable) || reboot.Ready() {
		t.Fatal("missing shard must not look empty", err)
	}
	if err := reboot.Recover(ctx, false); err != nil {
		t.Fatal(err)
	}
	list, err := reboot.List(ctx, f)
	if err != nil || list.Total != 1 {
		t.Fatal("shard repair", err)
	}
}

func TestInitializationFailureIsNotAnAcceptedWrite(t *testing.T) {
	e := New(newMemory())
	_, err := e.Mutate(context.Background(), testID, mutation(1, 0, "new"), false)
	if !errors.Is(err, ErrUnavailable) || errors.Is(err, ErrWriteOutcomeUnknown) {
		t.Fatal("uninitialized request must not be marked as accepted", err)
	}
}
