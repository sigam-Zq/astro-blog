package diary

import (
	"bytes"
	"compress/gzip"
	"context"
	"diary/internal/storage"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"
)

const catalogKey = "index/catalog.json.gz"
const pendingKey = "control/pending.json"

type catalog struct {
	Schema      int                 `json:"schemaVersion"`
	State       string              `json:"state"`
	GeneratedAt time.Time           `json:"generatedAt"`
	Items       map[string]Metadata `json:"items"`
}
type searchItem struct {
	Revision int    `json:"revision"`
	Text     string `json:"text"`
}
type shard struct {
	Schema int                   `json:"schemaVersion"`
	Items  map[string]searchItem `json:"items"`
}
type pending struct {
	BaseRevision int    `json:"baseRevision"`
	Target       Entry  `json:"target"`
	Checksum     string `json:"checksum"`
}
type Engine struct {
	mu            sync.Mutex
	store         storage.Store
	cat           catalog
	shards        map[byte]shard
	ready         bool
	rebuildNeeded bool
}

func New(s storage.Store) *Engine { return &Engine{store: s, shards: map[byte]shard{}} }
func (e *Engine) Ready() bool     { e.mu.Lock(); defer e.mu.Unlock(); return e.ready }
func emptyCatalog() catalog {
	return catalog{Schema: 2, State: "ready", GeneratedAt: time.Now().UTC(), Items: map[string]Metadata{}}
}
func shardKey(b byte) string { return fmt.Sprintf("index/search/%c.json.gz", b) }
func decode(b []byte, v any, compressed bool) error {
	var r io.Reader = bytes.NewReader(b)
	if compressed {
		z, err := gzip.NewReader(r)
		if err != nil {
			return err
		}
		defer z.Close()
		r = z
	}
	b, err := io.ReadAll(io.LimitReader(r, (128<<20)+1))
	if err != nil || len(b) > 128<<20 {
		return errors.New("invalid object size")
	}
	return json.Unmarshal(b, v)
}
func (e *Engine) put(ctx context.Context, key string, v any, compressed bool) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if compressed {
		var buf bytes.Buffer
		w := gzip.NewWriter(&buf)
		if _, err = w.Write(b); err != nil {
			return err
		}
		if err = w.Close(); err != nil {
			return err
		}
		b = buf.Bytes()
	}
	return e.store.Put(ctx, key, b)
}
func (e *Engine) readEntry(ctx context.Context, id string) (Entry, error) {
	b, err := e.store.Get(ctx, entryKey(id))
	var en Entry
	if errors.Is(err, storage.ErrNotFound) {
		b, err = e.store.Get(ctx, legacyKey(id))
		if err != nil {
			return en, err
		}
		var old legacyEntry
		if decode(b, &old, false) != nil || old.Schema != 1 {
			return en, fmt.Errorf("invalid legacy entry: %w", ErrUnavailable)
		}
		en = upgradeLegacy(old)
	} else if err != nil {
		return en, err
	} else {
		en, err = decodeMarkdown(b)
		if err != nil {
			return en, fmt.Errorf("invalid Markdown entry: %w", ErrUnavailable)
		}
		en.sourceKey = entryKey(id)
	}
	if !validEntry(en, id) {
		return en, fmt.Errorf("invalid entry metadata: %w", ErrUnavailable)
	}
	return en, nil
}

func validCatalog(c catalog) bool {
	if c.Schema != 2 || c.State != "ready" || c.Items == nil {
		return false
	}
	for id, m := range c.Items {
		if !ValidID(id) || m.ID != id || m.Revision < 1 || (m.EntryKey != entryKey(id) && m.EntryKey != legacyKey(id)) || !ValidID(m.Mutation) || m.RequestHash == "" {
			return false
		}
		switch m.State {
		case "active":
			if m.DeletedAt != nil {
				return false
			}
		case "deleted":
			if m.DeletedAt == nil {
				return false
			}
		default:
			return false
		}
	}
	return true
}
func (e *Engine) loadCatalog(ctx context.Context) error {
	b, err := e.store.Get(ctx, catalogKey)
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		return err
	}
	var c catalog
	if err == nil && decode(b, &c, true) == nil && validCatalog(c) {
		e.cat = c
		return nil
	}
	return e.rebuild(ctx)
}
func (e *Engine) rebuild(ctx context.Context) error {
	c := emptyCatalog()
	c.State = "rebuilding"
	if err := e.put(ctx, catalogKey, c, true); err != nil {
		return err
	}
	keys, err := e.store.List(ctx, "entries/")
	if err != nil {
		return err
	}
	shards := map[byte]shard{}
	for _, b := range []byte("0123456789abcdef") {
		shards[b] = shard{2, map[string]searchItem{}}
	}
	seen := map[string]bool{}
	for _, key := range keys {
		if strings.HasSuffix(key, "/") {
			continue
		}
		id := strings.TrimPrefix(key, "entries/")
		id = strings.TrimSuffix(strings.TrimSuffix(id, ".md"), ".json")
		if !ValidID(id) || (key != entryKey(id) && key != legacyKey(id)) {
			return fmt.Errorf("unexpected object in entries prefix: %w", ErrUnavailable)
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		en, err := e.readEntry(ctx, id)
		if err != nil {
			return err
		}
		c.Items[id] = metadata(en)
		if en.DeletedAt == nil {
			shards[id[0]].Items[id] = searchItem{en.Revision, strings.ToLower(en.Document.Content)}
		}
	}

	for b, s := range shards {
		if err := e.put(ctx, shardKey(b), s, true); err != nil {
			return err
		}
	}
	c.State = "ready"
	if err = e.put(ctx, catalogKey, c, true); err != nil {
		return err
	}
	e.cat = c
	e.shards = shards
	return nil
}
func (e *Engine) loadShard(ctx context.Context, b byte) (shard, error) {
	if s, ok := e.shards[b]; ok {
		return s, nil
	}
	var s shard
	data, err := e.store.Get(ctx, shardKey(b))
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			e.rebuildNeeded = true
		}
		return s, err
	}
	if decode(data, &s, true) != nil || s.Schema != 2 || s.Items == nil {
		e.rebuildNeeded = true
		return s, ErrUnavailable
	}
	for id, item := range s.Items {
		m, ok := e.cat.Items[id]
		if !ValidID(id) || id[0] != b || !ok || m.State == "deleted" || m.Revision != item.Revision {
			e.rebuildNeeded = true
			return s, ErrUnavailable
		}
	}
	for id, m := range e.cat.Items {
		if id[0] == b && m.State != "deleted" {
			item, ok := s.Items[id]
			if !ok || item.Revision != m.Revision {
				e.rebuildNeeded = true
				return s, ErrUnavailable
			}
		}
	}
	e.shards[b] = s
	return s, nil
}

// Recovery is also called periodically. Only a complete persisted index becomes visible.
func (e *Engine) Recover(ctx context.Context, forceRebuild bool) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.ready = false
	e.shards = map[byte]shard{}
	b, err := e.store.Get(ctx, pendingKey)
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		return fmt.Errorf("read pending journal: %w", err)
	}
	if forceRebuild || e.rebuildNeeded {
		if err := e.rebuild(ctx); err != nil {
			return fmt.Errorf("rebuild index: %w", err)
		}
	} else if err := e.loadCatalog(ctx); err != nil {
		return fmt.Errorf("load or rebuild catalog: %w", err)
	}
	if err == nil {
		p, decodeErr := decodePending(b)
		if decodeErr != nil {
			return decodeErr
		}
		if err = e.replay(ctx, p); err != nil {
			return fmt.Errorf("replay pending journal: %w", err)
		}
	}

	e.ready = true
	e.rebuildNeeded = false
	return nil
}
func (e *Engine) replay(ctx context.Context, p pending) error {
	t := p.Target
	current, err := e.readEntry(ctx, t.ID)
	switch {
	case errors.Is(err, storage.ErrNotFound):
		if p.BaseRevision != 0 {
			return ErrUnavailable
		}
	case err != nil:
		return err
	case current.Revision == t.Revision:
		if digest(current) != p.Checksum {
			return ErrUnavailable
		}
	case current.Revision != p.BaseRevision:
		return ErrUnavailable
	}
	if m, ok := e.cat.Items[t.ID]; ok && m.Revision > t.Revision {
		return ErrUnavailable
	}
	if err = e.putEntry(ctx, t); err != nil {
		return err
	}
	// This one shard may be partially written; derive its other records from the
	// verified catalog and entries rather than trusting a partial shard.
	s := shard{2, map[string]searchItem{}}
	for id, m := range e.cat.Items {
		if id == t.ID || id[0] != t.ID[0] || m.State == "deleted" {
			continue
		}
		en, err := e.readEntry(ctx, id)
		if err != nil || en.Revision != m.Revision {
			return ErrUnavailable
		}
		s.Items[id] = searchItem{en.Revision, strings.ToLower(en.Document.Content)}
	}
	if t.DeletedAt == nil {
		s.Items[t.ID] = searchItem{t.Revision, strings.ToLower(t.Document.Content)}
	}
	e.cat.Items[t.ID] = metadata(t)
	e.cat.GeneratedAt = time.Now().UTC()
	if err = e.put(ctx, catalogKey, e.cat, true); err != nil {
		return err
	}
	if err = e.put(ctx, shardKey(t.ID[0]), s, true); err != nil {
		return err
	}
	if err = e.store.Delete(ctx, pendingKey); err != nil {
		return err
	}
	if _, err = e.store.Get(ctx, pendingKey); !errors.Is(err, storage.ErrNotFound) {
		return ErrUnavailable
	}
	e.shards[t.ID[0]] = s
	return nil
}
func (e *Engine) Get(ctx context.Context, id string) (Entry, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.ready {
		return Entry{}, ErrUnavailable
	}
	m, ok := e.cat.Items[id]
	if !ok || m.State == "deleted" {
		return Entry{}, ErrNotFound
	}
	en, err := e.readEntry(ctx, id)
	if err != nil || en.Revision != m.Revision || en.DeletedAt != nil {
		if errors.Is(err, ErrUnavailable) || (err == nil && en.Revision != m.Revision) {
			e.rebuildNeeded = true
		}
		e.ready = false
		return Entry{}, ErrUnavailable
	}
	return en, nil
}
func (e *Engine) Mutate(ctx context.Context, id string, m Mutation, deleting bool) (Entry, error) {
	if !ValidID(id) {
		return Entry{}, errors.New("日记 ID 无效")
	}
	if err := m.Validate(deleting); err != nil {
		return Entry{}, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.ready {
		return Entry{}, ErrUnavailable
	}
	hash := digest(struct {
		Mutation Mutation
		Deleting bool
	}{m, deleting})
	meta, exists := e.cat.Items[id]
	if exists && meta.Mutation == m.MutationID {
		if meta.RequestHash != hash {
			return Entry{}, ErrConflict
		}
		en, err := e.readEntry(ctx, id)
		if err != nil || en.Revision != meta.Revision {
			e.ready = false
			return Entry{}, ErrWriteOutcomeUnknown
		}
		return en, nil
	}
	if exists && meta.State == "deleted" {
		return Entry{}, ErrNotFound
	}
	if !exists && deleting {
		return Entry{}, ErrNotFound
	}
	if (!exists && m.ExpectedRevision != 0) || (exists && m.ExpectedRevision != meta.Revision) {
		return Entry{}, ErrConflict
	}
	now := time.Now().UTC()
	en := Entry{Schema: 2, ID: id, CreatedAt: now}
	if exists {
		var err error
		en, err = e.readEntry(ctx, id)
		if err != nil || en.Revision != meta.Revision {
			e.ready = false
			return Entry{}, ErrUnavailable
		}
	}
	base := en.Revision
	en.Revision++
	en.Mutation = m.MutationID
	en.RequestHash = hash
	en.UpdatedAt = now
	en.sourceKey = entryKey(id)
	if deleting {
		en.DeletedAt = &now
	} else {
		en.Document = m.Document
	}

	// Load the affected shard before accepting the intent. Normal saves rewrite
	// only this shard; recovery can reconstruct it from entries after a crash.
	s, err := e.loadShard(ctx, id[0])
	if err != nil {
		e.ready = false
		return Entry{}, ErrUnavailable
	}
	p := pending{base, en, digest(en)}
	e.ready = false
	if err = e.put(ctx, pendingKey, p, false); err != nil {
		return Entry{}, ErrWriteOutcomeUnknown
	}
	if err = e.putEntry(ctx, en); err != nil {
		return Entry{}, ErrWriteOutcomeUnknown
	}
	e.cat.Items[id] = metadata(en)
	e.cat.GeneratedAt = now
	if deleting {
		delete(s.Items, id)
	} else {
		s.Items[id] = searchItem{en.Revision, strings.ToLower(en.Document.Content)}
	}
	if err = e.put(ctx, catalogKey, e.cat, true); err != nil {
		return Entry{}, ErrWriteOutcomeUnknown
	}
	if err = e.put(ctx, shardKey(id[0]), s, true); err != nil {
		return Entry{}, ErrWriteOutcomeUnknown
	}
	if err = e.store.Delete(ctx, pendingKey); err != nil {
		return Entry{}, ErrWriteOutcomeUnknown
	}
	if _, err = e.store.Get(ctx, pendingKey); !errors.Is(err, storage.ErrNotFound) {
		return Entry{}, ErrWriteOutcomeUnknown
	}
	e.shards[id[0]] = s
	e.ready = true
	return en, nil
}

type Filter struct {
	Query, Tag, DateFrom, DateTo string
	Page, PageSize               int
}
type List struct {
	Items    []Metadata `json:"items"`
	Total    int        `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"pageSize"`
}

func (e *Engine) List(ctx context.Context, f Filter) (List, error) {
	out := List{Items: []Metadata{}, Page: f.Page, PageSize: f.PageSize}
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.ready {
		return out, ErrUnavailable
	}
	if f.Query != "" {
		for _, b := range []byte("0123456789abcdef") {
			if _, err := e.loadShard(ctx, b); err != nil {
				e.ready = false
				return out, ErrUnavailable
			}
		}
	}
	words := strings.Fields(strings.ToLower(f.Query))
	items := []Metadata{}
	for _, m := range e.cat.Items {
		if m.State == "deleted" || (f.DateFrom != "" && m.DiaryDate < f.DateFrom) || (f.DateTo != "" && m.DiaryDate > f.DateTo) {
			continue
		}
		if f.Tag != "" {
			found := false
			for _, t := range m.Tags {
				if t == f.Tag {
					found = true
				}
			}
			if !found {
				continue
			}
		}
		text := strings.ToLower(m.Title + "\n" + strings.Join(m.Tags, "\n"))
		if len(words) > 0 {
			text += "\n" + e.shards[m.ID[0]].Items[m.ID].Text
		}
		match := true
		for _, w := range words {
			if !strings.Contains(text, w) {
				match = false
				break
			}
		}
		if match {
			items = append(items, m)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if a.DiaryDate != b.DiaryDate {
			return a.DiaryDate > b.DiaryDate
		}
		if !a.UpdatedAt.Equal(b.UpdatedAt) {
			return a.UpdatedAt.After(b.UpdatedAt)
		}
		return a.ID < b.ID
	})
	out.Total = len(items)
	start := (f.Page - 1) * f.PageSize
	if start < len(items) {
		end := start + f.PageSize
		if end > len(items) {
			end = len(items)
		}
		out.Items = items[start:end]
	}
	return out, nil
}
