package main

import (
	"context"
	"diary/internal/storage"
	"errors"
	"strings"
	"testing"
)

type diagnosticStore struct {
	objects       map[string][]byte
	puts, deletes int
	readError     bool
}

func (s *diagnosticStore) Get(_ context.Context, k string) ([]byte, error) {
	if strings.HasPrefix(k, "control/probes/") && s.readError {
		return nil, errors.New("injected read failure")
	}
	b, ok := s.objects[k]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return b, nil
}
func (s *diagnosticStore) Put(_ context.Context, k string, b []byte) error {
	s.puts++
	if !strings.HasPrefix(k, "control/probes/") {
		return errors.New("must not overwrite diary or index")
	}
	s.objects[k] = b
	return nil
}
func (s *diagnosticStore) Delete(_ context.Context, k string) error {
	s.deletes++
	delete(s.objects, k)
	return nil
}
func (s *diagnosticStore) List(context.Context, string) ([]string, error) { return []string{}, nil }
func TestStorageDiagnosticReadOnlyAndCleanup(t *testing.T) {
	s := &diagnosticStore{objects: map[string][]byte{}}
	if err := verifyStorage(context.Background(), s, false); err != nil || s.puts != 0 || s.deletes != 0 {
		t.Fatal("read-only check wrote data", err)
	}
	if err := verifyStorage(context.Background(), s, true); err != nil || s.puts != 1 || s.deletes != 1 || len(s.objects) != 0 {
		t.Fatal("write check cleanup failed", err)
	}
	s.readError = true
	if err := verifyStorage(context.Background(), s, true); err == nil || s.deletes != 2 || len(s.objects) != 0 {
		t.Fatal("failed probe was not cleaned up", err)
	}
}
