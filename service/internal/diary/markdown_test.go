package diary

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestMarkdownRoundTrip(t *testing.T) {
	now := time.Now().UTC()
	doc := Document{Title: "标题: 带符号\n第二行", DiaryDate: "2026-10-17", Tags: []string{"生活", "a: b"}, Content: "\n# 日记\n\n---\n正文\r\n```json\n{}\n```\n"}
	original := Entry{Schema: 2, ID: testID, Revision: 3, Mutation: "b0000000-0000-4000-8000-000000000001", RequestHash: "fixture", Document: doc, CreatedAt: now, UpdatedAt: now}
	encoded, err := encodeMarkdown(original)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeMarkdown(encoded)
	if err != nil || digest(original) != digest(decoded) {
		t.Fatal("Markdown round trip changed document", err)
	}
	if bytes.Contains(encoded, []byte(`"contentMarkdown"`)) || !bytes.HasPrefix(encoded, []byte("---\nschemaVersion: 2\n")) {
		t.Fatal("body is not readable Markdown")
	}
	crlf := bytes.ReplaceAll(encoded, []byte("\n"), []byte("\r\n"))
	windows, err := decodeMarkdown(crlf)
	if err != nil || windows.Document.Content != strings.ReplaceAll(original.Document.Content, "\n", "\r\n") {
		t.Fatal("CRLF Markdown could not be read", err)
	}
	for _, bad := range [][]byte{[]byte("# no header"), []byte("---\ntitle: missing closing"), []byte("---\nunknown: field\n---\n\nbody")} {
		if _, err := decodeMarkdown(bad); err == nil {
			t.Fatal("accepted invalid frontmatter")
		}
	}
}
func TestLegacyJSONUpgradePreservesLatestContent(t *testing.T) {
	s := newMemory()
	ctx := context.Background()
	now := time.Now().UTC()
	oldPublished := Document{Title: "旧定稿", DiaryDate: "2026-10-16", Tags: []string{}, Content: "earlier snapshot"}
	old := legacyEntry{Schema: 1, ID: testID, Revision: 4, Mutation: "b0000000-0000-4000-8000-000000000004", RequestHash: "legacy-request", Draft: Document{Title: "最新内容", DiaryDate: "2026-10-17", Tags: []string{"生活"}, Content: "latest saved content"}, Published: &oldPublished, CreatedAt: now, UpdatedAt: now}
	oldBytes, _ := json.Marshal(old)
	s.objects[legacyKey(testID)] = oldBytes
	e := New(s)
	if err := e.Recover(ctx, false); err != nil {
		t.Fatal(err)
	}
	en, err := e.Get(ctx, testID)
	if err != nil || en.Document.Content != old.Draft.Content {
		t.Fatal("legacy latest content was lost", err)
	}
	en, err = e.Mutate(ctx, testID, mutation(5, 4, "saved as Markdown"), false)
	if err != nil || en.Revision != 5 {
		t.Fatal(err)
	}
	if !bytes.Equal(s.objects[legacyKey(testID)], oldBytes) || !bytes.HasPrefix(s.objects[entryKey(testID)], []byte("---\n")) {
		t.Fatal("legacy file must remain unchanged and new file must be MD")
	}
	if err = e.Recover(ctx, true); err != nil {
		t.Fatal(err)
	}
	out, err := e.List(ctx, Filter{Page: 1, PageSize: 20})
	if err != nil || out.Total != 1 {
		t.Fatal("MD and JSON counted twice", err)
	}
	del := Mutation{ExpectedRevision: 5, MutationID: "c0000000-0000-4000-8000-000000000001"}
	if _, err = e.Mutate(ctx, testID, del, true); err != nil {
		t.Fatal(err)
	}
	if err = e.Recover(ctx, true); err != nil {
		t.Fatal(err)
	}
	if _, err = e.Get(ctx, testID); !errors.Is(err, ErrNotFound) {
		t.Fatal("legacy JSON resurrected deleted MD", err)
	}
}
func TestLegacyPendingJournalRecoversToMarkdown(t *testing.T) {
	e, s := initialized(t)
	ctx := context.Background()
	now := time.Now().UTC()
	old := legacyEntry{Schema: 1, ID: testID, Revision: 1, Mutation: "b0000000-0000-4000-8000-000000000001", RequestHash: "legacy", Draft: Document{Title: "待恢复", DiaryDate: "2026-10-17", Tags: nil, Content: "recover latest legacy content"}, CreatedAt: now, UpdatedAt: now}
	data, _ := json.Marshal(struct {
		BaseRevision int         `json:"baseRevision"`
		Target       legacyEntry `json:"target"`
		Checksum     string      `json:"checksum"`
	}{0, old, digest(old)})
	s.objects[pendingKey] = data
	if err := e.Recover(ctx, false); err != nil {
		t.Fatal(err)
	}
	got, err := e.Get(ctx, testID)
	if err != nil || got.Document.Content != old.Draft.Content || !bytes.HasPrefix(s.objects[entryKey(testID)], []byte("---\n")) {
		t.Fatal("legacy pending not recovered to MD", err)
	}
	if _, ok := s.objects[pendingKey]; ok {
		t.Fatal("pending not cleared")
	}
}
func TestRebuildIgnoresOSSFolderMarkers(t *testing.T) {
	s := newMemory()
	s.objects["entries/"] = []byte{}
	s.objects["entries/folder/"] = []byte{}
	e := New(s)
	if err := e.Recover(context.Background(), false); err != nil {
		t.Fatal("folder markers blocked initialization", err)
	}
}
func TestSaveTouchesOnlyDocumentCatalogOneShardAndJournal(t *testing.T) {
	e, s := initialized(t)
	before := map[string]string{}
	for k, b := range s.objects {
		before[k] = string(b)
	}
	if _, err := e.Mutate(context.Background(), testID, mutation(1, 0, "one saved document"), false); err != nil {
		t.Fatal(err)
	}
	changed := map[string]bool{}
	for k, b := range s.objects {
		if before[k] != string(b) {
			changed[k] = true
		}
	}
	if len(changed) != 3 || !changed[entryKey(testID)] || !changed[catalogKey] || !changed[shardKey('a')] {
		t.Fatal("unexpected persistent objects", changed)
	}
	if _, ok := s.objects[pendingKey]; ok {
		t.Fatal("successful save left journal behind")
	}
	for k := range s.objects {
		if strings.Contains(k, "draft") || strings.Contains(k, "published") {
			t.Fatal("unexpected draft or snapshot file")
		}
	}
}
