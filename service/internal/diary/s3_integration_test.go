package diary

import (
	"context"
	"diary/internal/auth"
	"diary/internal/config"
	s3store "diary/internal/storage/s3"
	"os"
	"strings"
	"testing"
	"time"
)

// Explicit opt-in live test. Every object is confined to a unique child prefix;
// cleanup cannot enumerate or delete the application's existing diary objects.
func TestIsolatedS3Lifecycle(t *testing.T) {
	if os.Getenv("DIARY_S3_INTEGRATION") != "1" {
		t.Skip("opt-in isolated S3 integration")
	}
	path := os.Getenv("DIARY_S3_TEST_CONFIG")
	if path == "" {
		t.Fatal("DIARY_S3_TEST_CONFIG is required")
	}
	c, err := config.Load(path)
	if err != nil {
		t.Fatal("integration configuration invalid")
	}
	c.S3.Prefix += "control/probes/integration-" + auth.Token() + "/"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	store, err := s3store.New(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), time.Minute)
		defer stop()
		keys, err := store.List(cleanup, "")
		if err != nil {
			t.Error("cannot enumerate isolated diagnostic objects for cleanup", err)
			return
		}
		for _, key := range keys {
			if err := store.Delete(cleanup, key); err != nil {
				t.Error("cannot delete isolated diagnostic object", err)
			}
		}
	}()
	e := New(store)
	if err = e.Recover(ctx, false); err != nil {
		t.Fatal("fresh index initialization", err)
	}
	t.Log("isolated fresh index initialization passed")
	en, err := e.Mutate(ctx, testID, mutation(1, 0, "isolated RustFS lifecycle"), false)
	if err != nil || en.Revision != 1 {
		t.Fatal("isolated save", err)
	}
	raw, err := store.Get(ctx, entryKey(testID))
	if err != nil || !strings.HasPrefix(string(raw), "---\n") {
		t.Fatal("saved object is not Markdown", err)
	}
	reboot := New(store)
	if err = reboot.Recover(ctx, false); err != nil {
		t.Fatal("isolated restart", err)
	}
	list, err := reboot.List(ctx, Filter{Query: "RustFS", Page: 1, PageSize: 20})
	if err != nil || list.Total != 1 {
		t.Fatal("isolated persisted search", err)
	}
	if _, err = reboot.Mutate(ctx, testID, Mutation{ExpectedRevision: 1, MutationID: "d0000000-0000-4000-8000-000000000001"}, true); err != nil {
		t.Fatal("isolated delete", err)
	}
	t.Log("isolated save, restart, search and delete passed")
}
