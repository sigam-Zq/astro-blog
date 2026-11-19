package s3

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"syscall"

	"github.com/aws/smithy-go"
)

// SDK errors may include signed URLs, server messages, bucket names and keys.
// Keep only a bounded, known error code and transport category in diagnostics.
func operationError(operation string, err error) error {
	code := "TransportError"
	status := 0
	var response interface{ HTTPStatusCode() int }
	if errors.As(err, &response) {
		status = response.HTTPStatusCode()
		code = "HTTPError"
	}
	var api smithy.APIError
	if errors.As(err, &api) {
		switch api.ErrorCode() {
		case "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "AuthorizationHeaderMalformed", "NoSuchBucket", "NoSuchKey", "NotFound", "InvalidBucketName", "InvalidArgument", "InvalidRequest", "NotImplemented", "XAmzContentSHA256Mismatch", "RequestTimeTooSkewed", "RequestExpired", "ExpiredToken", "InvalidToken", "PermanentRedirect", "TemporaryRedirect", "ServiceUnavailable", "SlowDown", "InternalError":
			code = api.ErrorCode()
		default:
			code = "UnknownS3Error"
		}
	}
	var dns *net.DNSError
	var cert *tls.CertificateVerificationError
	var unknownCA x509.UnknownAuthorityError
	var host x509.HostnameError
	var network net.Error
	switch {
	case errors.Is(err, context.Canceled):
		code = "Canceled"
	case errors.Is(err, context.DeadlineExceeded):
		code = "Timeout"
	case errors.As(err, &dns):
		code = "DNSFailure"
	case errors.As(err, &cert), errors.As(err, &unknownCA), errors.As(err, &host):
		code = "TLSCertificateError"
	case errors.Is(err, syscall.ECONNREFUSED):
		code = "ConnectionRefused"
	case errors.As(err, &network) && network.Timeout():
		code = "Timeout"
	}
	return fmt.Errorf("S3 %s failed: code=%s http_status=%d", operation, code, status)
}
