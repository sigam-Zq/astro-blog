package diary

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Optional local scale smoke test. These timings do not represent real OSS or
// the deployment host; no production bucket is ever accessed.
func TestScale5000(t *testing.T) {
	if os.Getenv("DIARY_SCALE_TEST") != "1" {
		t.Skip("opt-in local scale measurement")
	}
	ctx := context.Background()
	s := newMemory()
	seed := New(s)
	now := time.Now().UTC()
	body := strings.Repeat("daily journal 中文检索 ", 512)
	for i := 0; i < 5000; i++ {
		id := fmt.Sprintf("%08x-0000-4000-8000-%012d", i*100003, i)
		en := Entry{Schema: 2, ID: id, Revision: 1, Mutation: "b0000000-0000-4000-8000-000000000001", RequestHash: "fixture", Document: Document{Title: fmt.Sprintf("日记 %d", i), DiaryDate: "2026-10-17", Tags: []string{"test"}, Content: body}, CreatedAt: now, UpdatedAt: now}
		if err := seed.putEntry(ctx, en); err != nil {
			t.Fatal(err)
		}
	}
	if err := seed.Recover(ctx, true); err != nil {
		t.Fatal(err)
	}
	runtime.GC()
	s.gets = 0
	s.lists = 0
	boot := New(s)
	start := time.Now()
	if err := boot.Recover(ctx, false); err != nil {
		t.Fatal(err)
	}
	startup := time.Since(start)
	f := Filter{Query: "中文检索", Page: 1, PageSize: 20}
	start = time.Now()
	result, err := boot.List(ctx, f)
	first := time.Since(start)
	if err != nil || result.Total != 5000 {
		t.Fatal(err, result.Total)
	}
	start = time.Now()
	for i := 0; i < 10; i++ {
		if _, err := boot.List(ctx, f); err != nil {
			t.Fatal(err)
		}
	}
	average := time.Since(start) / 10
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	t.Logf("local memory-store: entries=5000 average_body=%d bytes startup=%s first_search=%s cached_search_average=%s total_fixture_heap=%d MiB GETs=%d LISTs=%d", len(body), startup, first, average, memory.Alloc>>20, s.gets, s.lists)
}
