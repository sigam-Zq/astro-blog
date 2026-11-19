package s3

import (
	"bytes"
	"context"
	"diary/internal/config"
	"diary/internal/storage"
	"errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	sdk "github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"io"
	"net/http"
	"strings"
	"time"
)

type Store struct {
	client         *sdk.Client
	bucket, prefix string
}

func New(ctx context.Context, c config.Config) (*Store, error) {
	a, e := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(c.S3.Region), awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(c.S3.AccessKeyID, c.S3.SecretAccessKey, "")), awsconfig.WithRetryMaxAttempts(1), awsconfig.WithHTTPClient(&http.Client{Timeout: 20 * time.Second}), awsconfig.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired), awsconfig.WithResponseChecksumValidation(aws.ResponseChecksumValidationWhenRequired))
	if e != nil {
		return nil, errors.New("cannot initialize S3 client")
	}
	client := sdk.NewFromConfig(a, func(o *sdk.Options) { o.BaseEndpoint = aws.String(c.S3.Endpoint); o.UsePathStyle = c.S3.ForcePathStyle })
	return &Store{client, c.S3.Bucket, c.S3.Prefix}, nil
}
func (s *Store) Get(ctx context.Context, key string) ([]byte, error) {
	out, e := s.client.GetObject(ctx, &sdk.GetObjectInput{Bucket: &s.bucket, Key: aws.String(s.prefix + key)})
	if e != nil {
		var api smithy.APIError
		if errors.As(e, &api) && (api.ErrorCode() == "NoSuchKey" || api.ErrorCode() == "NotFound") {
			return nil, storage.ErrNotFound
		}
		return nil, operationError("GetObject", e)
	}
	defer out.Body.Close()
	b, e := io.ReadAll(io.LimitReader(out.Body, 128<<20+1))
	if e != nil || len(b) > 128<<20 {
		return nil, errors.New("S3 object exceeds limit or read failed")
	}
	return b, nil
}
func (s *Store) Put(ctx context.Context, key string, b []byte) error {
	ct := "application/json"
	if strings.HasSuffix(key, ".md") {
		ct = "text/markdown; charset=utf-8"
	}
	if strings.HasSuffix(key, ".gz") {
		ct = "application/gzip"
	}
	_, e := s.client.PutObject(ctx, &sdk.PutObjectInput{Bucket: &s.bucket, Key: aws.String(s.prefix + key), Body: bytes.NewReader(b), ContentType: &ct})
	if e != nil {
		return operationError("PutObject", e)
	}
	return nil
}
func (s *Store) Delete(ctx context.Context, key string) error {
	_, e := s.client.DeleteObject(ctx, &sdk.DeleteObjectInput{Bucket: &s.bucket, Key: aws.String(s.prefix + key)})
	if e != nil {
		return operationError("DeleteObject", e)
	}
	return nil
}
func (s *Store) List(ctx context.Context, prefix string) ([]string, error) {
	p := sdk.NewListObjectsV2Paginator(s.client, &sdk.ListObjectsV2Input{Bucket: &s.bucket, Prefix: aws.String(s.prefix + prefix)})
	keys := []string{}
	for p.HasMorePages() {
		o, e := p.NextPage(ctx)
		if e != nil {
			return nil, operationError("ListObjectsV2", e)
		}
		for _, v := range o.Contents {
			keys = append(keys, strings.TrimPrefix(aws.ToString(v.Key), s.prefix))
		}
	}
	return keys, nil
}
