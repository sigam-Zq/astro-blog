package auth

import (
	"strings"
	"testing"
)

func TestHashSessionAndRevocation(t *testing.T) {
	h, e := HashPassword("correct horse")
	if e != nil {
		t.Fatal(e)
	}
	if !VerifyPassword(h, "correct horse") || VerifyPassword(h, "wrong") {
		t.Fatal("password check")
	}
	if ValidateHash(strings.Replace(h, "m=65536", "m=999999999", 1)) == nil {
		t.Fatal("unbounded memory accepted")
	}
	m, e := New("owner", h)
	if e != nil {
		t.Fatal(e)
	}
	token, s, retry := m.Login("owner", "correct horse", "127.0.0.1")
	if token == "" || retry != 0 || s.CSRFToken == "" {
		t.Fatal("login")
	}
	if _, ok := m.Session(token); !ok {
		t.Fatal("missing session")
	}
	m.Logout(token)
	if _, ok := m.Session(token); ok {
		t.Fatal("logout failed")
	}
}
func TestRateLimit(t *testing.T) {
	h, _ := HashPassword("correct")
	m, _ := New("owner", h)
	for i := 0; i < 10; i++ {
		token, _, retry := m.Login("wrong", "wrong", "ip")
		if token != "" || retry != 0 {
			t.Fatal("unexpected login")
		}
	}
	if _, _, retry := m.Login("owner", "correct", "ip"); retry == 0 {
		t.Fatal("missing rate limit")
	}
}
