package storage

import (
	"context"
	"errors"
)

var ErrNotFound = errors.New("object not found")

type Store interface {
	Get(context.Context, string) ([]byte, error)
	Put(context.Context, string, []byte) error
	Delete(context.Context, string) error
	List(context.Context, string) ([]string, error)
}
