package s3

import (
	"context"
	"diary/internal/config"
	"diary/internal/storage"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	sdk "github.com/aws/aws-sdk-go-v2/service/s3"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestS3WireContractAndPaginatedList(t *testing.T) {
	objects := map[string][]byte{}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 ") {
			t.Error("unsigned request")
		}
		if r.URL.Path == "/private" || r.URL.Path == "/private/" {
			if r.URL.Query().Get("list-type") != "2" {
				t.Error("not list v2")
			}
			calls++
			w.Header().Set("Content-Type", "application/xml")
			if r.URL.Query().Get("continuation-token") == "" {
				fmt.Fprint(w, `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>page2</NextContinuationToken><Contents><Key>isolated/entries/first.json</Key></Contents></ListBucketResult>`)
			} else {
				fmt.Fprint(w, `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>isolated/entries/second.json</Key></Contents></ListBucketResult>`)
			}
			return
		}
		key := strings.TrimPrefix(r.URL.Path, "/private/")
		switch r.Method {
		case "PUT":
			b, err := io.ReadAll(r.Body)
			if err != nil {
				t.Error(err)
			}
			objects[key] = b
			w.WriteHeader(200)
		case "GET":
			b, ok := objects[key]
			if !ok {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(404)
				fmt.Fprint(w, `<Error><Code>NoSuchKey</Code></Error>`)
				return
			}
			_, _ = w.Write(b)
		case "DELETE":
			delete(objects, key)
			w.WriteHeader(204)
		default:
			t.Error("unexpected method")
		}
	}))
	defer server.Close()
	var c config.Config
	c.S3.Endpoint = server.URL
	c.S3.Bucket = "private"
	c.S3.Prefix = "isolated/"
	c.S3.Region = "test"
	c.S3.AccessKeyID = "test-key"
	c.S3.SecretAccessKey = "test-secret"
	c.S3.ForcePathStyle = true
	s, err := New(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err = s.Put(ctx, "entries/a.json", []byte(`{"body":"test"}`)); err != nil {
		t.Fatal(err)
	}
	b, err := s.Get(ctx, "entries/a.json")
	if err != nil || string(b) != `{"body":"test"}` {
		t.Fatal("read", err, string(b))
	}
	if err = s.Delete(ctx, "entries/a.json"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Get(ctx, "entries/a.json"); !errors.Is(err, storage.ErrNotFound) {
		t.Fatal("not found mapping", err)
	}
	keys, err := s.List(ctx, "entries/")
	if err != nil || len(keys) != 2 || keys[1] != "entries/second.json" || calls != 2 {
		t.Fatal("pagination", keys, calls, err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestStorageFailureKeepsSafeDiagnostics(t *testing.T) {
	client := sdk.NewFromConfig(aws.Config{Region: "us-east-1", Credentials: credentials.NewStaticCredentialsProvider("fixture-key", "fixture-secret", ""), HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 403, Header: http.Header{"Content-Type": []string{"application/xml"}}, Body: io.NopCloser(strings.NewReader(`<Error><Code>AccessDenied</Code><Message>private-server-message fixture-secret</Message></Error>`)), Request: r}, nil
	})}, RetryMaxAttempts: 1}, func(o *sdk.Options) { o.BaseEndpoint = aws.String("http://fixture.invalid"); o.UsePathStyle = true })
	s := &Store{client: client, bucket: "fixture-bucket", prefix: "fixture/"}
	_, err := s.Get(context.Background(), "control/pending.json")
	if err == nil || !strings.Contains(err.Error(), "AccessDenied") || !strings.Contains(err.Error(), "403") {
		t.Fatalf("missing actionable status and error code: %v", err)
	}
	for _, secret := range []string{"fixture-secret", "fixture-key", "private-server-message", "fixture.invalid"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatal("diagnostics leaked sensitive detail")
		}
	}
}
