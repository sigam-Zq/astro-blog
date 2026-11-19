package diary

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrConflict = errors.New("revision or mutation conflict")
var ErrNotFound = errors.New("diary not found")
var ErrUnavailable = errors.New("diary storage or index unavailable")
var ErrWriteOutcomeUnknown = fmt.Errorf("write outcome unknown: %w", ErrUnavailable)
var idPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func ValidID(id string) bool { return idPattern.MatchString(id) }

type Document struct {
	Title     string   `json:"title"`
	DiaryDate string   `json:"diaryDate"`
	Tags      []string `json:"tags"`
	Content   string   `json:"contentMarkdown"`
}
type Entry struct {
	Schema      int        `json:"schemaVersion"`
	ID          string     `json:"id"`
	Revision    int        `json:"revision"`
	Mutation    string     `json:"lastMutationId"`
	RequestHash string     `json:"requestHash"`
	Document    Document   `json:"document"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	DeletedAt   *time.Time `json:"deletedAt"`
	sourceKey   string
}

func (e Entry) State() string {
	if e.DeletedAt != nil {
		return "deleted"
	}
	return "active"
}

type Metadata struct {
	ID          string     `json:"id"`
	Revision    int        `json:"revision"`
	Mutation    string     `json:"lastMutationId"`
	RequestHash string     `json:"requestHash"`
	EntryKey    string     `json:"entryKey"`
	Title       string     `json:"title,omitempty"`
	DiaryDate   string     `json:"diaryDate,omitempty"`
	Tags        []string   `json:"tags,omitempty"`
	State       string     `json:"state"`
	Excerpt     string     `json:"excerpt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	DeletedAt   *time.Time `json:"deletedAt"`
}

func metadata(e Entry) Metadata {
	key := e.sourceKey
	if key == "" {
		key = entryKey(e.ID)
	}
	m := Metadata{ID: e.ID, Revision: e.Revision, Mutation: e.Mutation, RequestHash: e.RequestHash, EntryKey: key, State: e.State(), CreatedAt: e.CreatedAt, UpdatedAt: e.UpdatedAt, DeletedAt: e.DeletedAt}
	if e.DeletedAt == nil {
		m.Title = e.Document.Title
		m.DiaryDate = e.Document.DiaryDate
		m.Tags = e.Document.Tags
		r := []rune(e.Document.Content)
		if len(r) > 120 {
			r = r[:120]
		}
		m.Excerpt = string(r)
	}
	return m
}

type Mutation struct {
	ExpectedRevision int      `json:"expectedRevision"`
	MutationID       string   `json:"mutationId"`
	Document         Document `json:"document"`
}

func (m *Mutation) Validate(deleting bool) error {
	if m.ExpectedRevision < 0 || !ValidID(m.MutationID) {
		return errors.New("版本或操作标识无效")
	}
	if deleting {
		return nil
	}
	m.Document.Title = strings.TrimSpace(m.Document.Title)
	if !utf8.ValidString(m.Document.Title) || m.Document.Title == "" || utf8.RuneCountInString(m.Document.Title) > 100 {
		return errors.New("标题必填且最多 100 字符")
	}
	if _, e := time.Parse("2006-01-02", m.Document.DiaryDate); e != nil {
		return errors.New("日记日期无效")
	}
	if !utf8.ValidString(m.Document.Content) || len(m.Document.Content) > 256<<10 {
		return errors.New("正文最多 256 KiB")
	}
	if strings.TrimSpace(m.Document.Content) == "" {
		return errors.New("正文不能为空")
	}
	if len(m.Document.Tags) > 10 {
		return errors.New("最多 10 个标签")
	}
	tags := []string{}
	for _, t := range m.Document.Tags {
		t = strings.TrimSpace(t)
		if !utf8.ValidString(t) || t == "" || utf8.RuneCountInString(t) > 20 {
			return errors.New("标签须为 1 至 20 字符")
		}
		if !slices.Contains(tags, t) {
			tags = append(tags, t)
		}
	}
	slices.Sort(tags)
	m.Document.Tags = tags
	return nil
}
func digest(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
func entryKey(id string) string  { return "entries/" + id + ".md" }
func legacyKey(id string) string { return "entries/" + id + ".json" }
