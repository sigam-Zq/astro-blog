package diary

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"go.yaml.in/yaml/v3"
)

type frontmatter struct {
	Schema      int        `yaml:"schemaVersion"`
	ID          string     `yaml:"id"`
	Revision    int        `yaml:"revision"`
	Mutation    string     `yaml:"lastMutationId"`
	RequestHash string     `yaml:"requestHash"`
	Title       string     `yaml:"title"`
	DiaryDate   string     `yaml:"diaryDate"`
	Tags        []string   `yaml:"tags"`
	CreatedAt   time.Time  `yaml:"createdAt"`
	UpdatedAt   time.Time  `yaml:"updatedAt"`
	DeletedAt   *time.Time `yaml:"deletedAt,omitempty"`
}

func encodeMarkdown(e Entry) ([]byte, error) {
	h, err := yaml.Marshal(frontmatter{e.Schema, e.ID, e.Revision, e.Mutation, e.RequestHash, e.Document.Title, e.Document.DiaryDate, e.Document.Tags, e.CreatedAt, e.UpdatedAt, e.DeletedAt})
	if err != nil {
		return nil, err
	}
	return append(append(append([]byte("---\n"), h...), []byte("---\n\n")...), []byte(e.Document.Content)...), nil
}
func decodeMarkdown(b []byte) (Entry, error) {
	var e Entry
	b = bytes.TrimPrefix(b, []byte{0xef, 0xbb, 0xbf})
	offset := 4
	if bytes.HasPrefix(b, []byte("---\r\n")) {
		offset = 5
	} else if !bytes.HasPrefix(b, []byte("---\n")) {
		return e, errors.New("Markdown frontmatter opening delimiter missing")
	}
	rest := b[offset:]
	end := -1
	closingLength := 0
	for _, closing := range [][]byte{[]byte("\n---\n"), []byte("\n---\r\n")} {
		if i := bytes.Index(rest, closing); i >= 0 && (end < 0 || i < end) {
			end = i
			closingLength = len(closing)
		}
	}
	if end < 0 {
		return e, errors.New("Markdown frontmatter closing delimiter missing")
	}
	var h frontmatter
	d := yaml.NewDecoder(bytes.NewReader(rest[:end]))
	d.KnownFields(true)
	if err := d.Decode(&h); err != nil {
		return e, errors.New("invalid Markdown frontmatter")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return e, errors.New("invalid Markdown frontmatter document")
	}
	body := rest[end+closingLength:]
	if bytes.HasPrefix(body, []byte("\r\n")) {
		body = body[2:]
	} else {
		body = bytes.TrimPrefix(body, []byte("\n"))
	}
	e = Entry{Schema: h.Schema, ID: h.ID, Revision: h.Revision, Mutation: h.Mutation, RequestHash: h.RequestHash, Document: Document{h.Title, h.DiaryDate, h.Tags, string(body)}, CreatedAt: h.CreatedAt, UpdatedAt: h.UpdatedAt, DeletedAt: h.DeletedAt}
	return e, nil
}
func (e *Engine) putEntry(ctx context.Context, en Entry) error {
	b, err := encodeMarkdown(en)
	if err != nil {
		return err
	}
	return e.store.Put(ctx, entryKey(en.ID), b)
}

// Legacy JSON remains untouched as a backup. Reading chooses Markdown when both
// formats exist; the next save upgrades the latest saved content to one MD file.
type legacyEntry struct {
	Schema      int        `json:"schemaVersion"`
	ID          string     `json:"id"`
	Revision    int        `json:"revision"`
	Mutation    string     `json:"lastMutationId"`
	RequestHash string     `json:"requestHash"`
	Draft       Document   `json:"draft"`
	Published   *Document  `json:"published"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	PublishedAt *time.Time `json:"publishedAt"`
	DeletedAt   *time.Time `json:"deletedAt"`
}

func upgradeLegacy(old legacyEntry) Entry {
	doc := old.Draft
	if doc.Title == "" && old.Published != nil {
		doc = *old.Published
	}
	if doc.Tags == nil {
		doc.Tags = []string{}
	}
	return Entry{Schema: 2, ID: old.ID, Revision: old.Revision, Mutation: old.Mutation, RequestHash: old.RequestHash, Document: doc, CreatedAt: old.CreatedAt, UpdatedAt: old.UpdatedAt, DeletedAt: old.DeletedAt, sourceKey: legacyKey(old.ID)}
}
func validEntry(en Entry, id string) bool {
	return en.Schema == 2 && en.ID == id && ValidID(en.ID) && en.Revision > 0 && ValidID(en.Mutation) && en.RequestHash != "" && !en.CreatedAt.IsZero() && !en.UpdatedAt.IsZero()
}
func decodePending(b []byte) (pending, error) {
	var raw struct {
		BaseRevision int             `json:"baseRevision"`
		Target       json.RawMessage `json:"target"`
		Checksum     string          `json:"checksum"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return pending{}, fmt.Errorf("invalid pending journal JSON: %w", ErrUnavailable)
	}
	var version struct {
		Schema int `json:"schemaVersion"`
	}
	if json.Unmarshal(raw.Target, &version) != nil {
		return pending{}, ErrUnavailable
	}
	var target Entry
	if version.Schema == 1 {
		var old legacyEntry
		if json.Unmarshal(raw.Target, &old) != nil || digest(old) != raw.Checksum {
			return pending{}, fmt.Errorf("legacy pending journal checksum mismatch: %w", ErrUnavailable)
		}
		target = upgradeLegacy(old)
	} else {
		if json.Unmarshal(raw.Target, &target) != nil || digest(target) != raw.Checksum {
			return pending{}, fmt.Errorf("pending journal checksum mismatch: %w", ErrUnavailable)
		}
	}
	if !validEntry(target, target.ID) || raw.BaseRevision < 0 || target.Revision != raw.BaseRevision+1 {
		return pending{}, fmt.Errorf("invalid pending journal schema or revision: %w", ErrUnavailable)
	}
	target.sourceKey = entryKey(target.ID)
	return pending{raw.BaseRevision, target, digest(target)}, nil
}
