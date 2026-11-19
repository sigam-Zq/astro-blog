package main

import (
	"bytes"
	"context"
	"diary/internal/auth"
	"diary/internal/storage"
	"errors"
	"fmt"
	"time"
)

// Normal checks never write. The explicit write check uses a random control
// object outside entries/index, and attempts cleanup even after a timed-out PUT.
func verifyStorage(ctx context.Context, store storage.Store, write bool) (err error) {
	for _, key := range []string{"control/pending.json", "index/catalog.json.gz"} {
		if _, err = store.Get(ctx, key); err != nil && !errors.Is(err, storage.ErrNotFound) {
			return fmt.Errorf("read-only storage check: %w", err)
		}
	}
	if _, err = store.List(ctx, "entries/"); err != nil {
		return fmt.Errorf("bucket list check: %w", err)
	}
	if !write {
		return nil
	}
	key := "control/probes/" + auth.Token() + ".json"
	payload := []byte(`{"diagnostic":true}`)
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if cleanupErr := store.Delete(cleanup, key); cleanupErr != nil {
			err = errors.Join(err, fmt.Errorf("diagnostic object cleanup failed: %w", cleanupErr))
		}
	}()
	if err = store.Put(ctx, key, payload); err != nil {
		return fmt.Errorf("isolated write check: %w", err)
	}
	got, err := store.Get(ctx, key)
	if err != nil {
		return fmt.Errorf("read diagnostic object: %w", err)
	}
	if !bytes.Equal(got, payload) {
		return errors.New("diagnostic object content mismatch")
	}
	return nil
}
