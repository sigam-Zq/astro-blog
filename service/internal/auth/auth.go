package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"sync"
	"time"
)

const CookieName = "__Host-diary_session"
const HTTPCookieName = "diary_session"

type Session struct {
	Username  string    `json:"username"`
	ExpiresAt time.Time `json:"expiresAt"`
	CSRFToken string    `json:"csrfToken"`
}
type bucket struct {
	Count int
	Until time.Time
}
type Manager struct {
	mu             sync.Mutex
	username, hash string
	sessions       map[[32]byte]Session
	failures       map[string]bucket
	global         bucket
	loginGate      chan struct{}
}

func New(username, hash string) (*Manager, error) {
	if e := ValidateHash(hash); e != nil {
		return nil, e
	}
	return &Manager{username: username, hash: hash, sessions: map[[32]byte]Session{}, failures: map[string]bucket{}, loginGate: make(chan struct{}, 2)}, nil
}
func Token() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic("system random source unavailable")
	}
	return hex.EncodeToString(b)
}
func (m *Manager) Login(username, password, ip string) (string, Session, int) {
	// Bound concurrent expensive hashes before allocating Argon2 memory.
	select {
	case m.loginGate <- struct{}{}:
		defer func() { <-m.loginGate }()
	default:
		return "", Session{}, 5
	}
	now := time.Now()
	m.mu.Lock()
	for k, v := range m.failures {
		if !now.Before(v.Until) {
			delete(m.failures, k)
		}
	}
	for k, v := range m.sessions {
		if !now.Before(v.ExpiresAt) {
			delete(m.sessions, k)
		}
	}
	b := m.failures[ip]
	if !now.Before(m.global.Until) {
		m.global = bucket{Until: now.Add(15 * time.Minute)}
	}
	if b.Count >= 10 || m.global.Count >= 100 || len(m.failures) >= 10000 {
		m.mu.Unlock()
		return "", Session{}, 900
	}
	if b.Until.IsZero() {
		b.Until = now.Add(15 * time.Minute)
	}
	b.Count++
	m.failures[ip] = b
	m.global.Count++
	m.mu.Unlock()
	valid := VerifyPassword(m.hash, password)
	same := subtle.ConstantTimeCompare([]byte(username), []byte(m.username)) == 1
	if !valid || !same {
		return "", Session{}, 0
	}
	token := Token()
	s := Session{m.username, now.Add(12 * time.Hour), Token()}
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.failures, ip)
	// Bound sessions and avoid unbounded growth from successful logins.
	if len(m.sessions) >= 1000 {
		for k := range m.sessions {
			delete(m.sessions, k)
			break
		}
	}
	m.sessions[sha256.Sum256([]byte(token))] = s
	return token, s, 0
}
func (m *Manager) Session(token string) (Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := sha256.Sum256([]byte(token))
	s, ok := m.sessions[k]
	if ok && !time.Now().Before(s.ExpiresAt) {
		delete(m.sessions, k)
		return Session{}, false
	}
	return s, ok
}
func (m *Manager) Logout(token string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, sha256.Sum256([]byte(token)))
}
