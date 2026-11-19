package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"golang.org/x/crypto/argon2"
	"strings"
)

func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, e := rand.Read(salt); e != nil {
		return "", e
	}
	key := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=2$%s$%s", base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}
func parseHash(hash string) (uint32, uint32, uint8, []byte, []byte, error) {
	invalid := errors.New("invalid or unsupported Argon2id password hash")
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" || parts[2] != "v=19" {
		return 0, 0, 0, nil, nil, invalid
	}
	var m, t uint32
	var p uint8
	if n, e := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); e != nil || n != 3 || fmt.Sprintf("m=%d,t=%d,p=%d", m, t, p) != parts[3] || m < 8192 || m > 262144 || t < 1 || t > 10 || p < 1 || p > 8 {
		return 0, 0, 0, nil, nil, invalid
	}
	salt, e := base64.RawStdEncoding.DecodeString(parts[4])
	if e != nil || len(salt) < 16 || len(salt) > 64 {
		return 0, 0, 0, nil, nil, invalid
	}
	key, e := base64.RawStdEncoding.DecodeString(parts[5])
	if e != nil || len(key) != 32 {
		return 0, 0, 0, nil, nil, invalid
	}
	return m, t, p, salt, key, nil
}
func ValidateHash(hash string) error { _, _, _, _, _, e := parseHash(hash); return e }
func VerifyPassword(hash, password string) bool {
	m, t, p, salt, key, e := parseHash(hash)
	if e != nil {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, t, m, p, uint32(len(key)))
	return subtle.ConstantTimeCompare(got, key) == 1
}
