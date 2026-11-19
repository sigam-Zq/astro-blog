package config

import (
	"os"
	"path/filepath"
	"testing"
)

func env(values map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := values[k]; return v, ok }
}
func baseEnv() map[string]string {
	return map[string]string{"APP_ORIGIN": "https://diary.example.com", "ADMIN_USERNAME": "owner", "ADMIN_PASSWORD": "example", "S3_ENDPOINT": "http://localhost:9000", "S3_REGION": "test", "S3_BUCKET": "private", "S3_ACCESS_KEY_ID": "key", "S3_SECRET_ACCESS_KEY": "secret"}
}
func TestEnvironmentAndValidation(t *testing.T) {
	m := baseEnv()
	c, err := load("", env(m))
	if err != nil || c.Server.Addr != "0.0.0.0:8080" || !c.S3.ForcePathStyle {
		t.Fatal(err)
	}
	m["S3_FORCE_PATH_STYLE"] = "false"
	c, err = load("", env(m))
	if err != nil || c.S3.ForcePathStyle {
		t.Fatal(err)
	}
	for _, change := range []map[string]string{{"S3_SECRET_ACCESS_KEY": ""}, {"S3_FORCE_PATH_STYLE": "not-bool"}, {"APP_ORIGIN": "ftp://example.com"}, {"ADMIN_PASSWORD_HASH": "also-set"}} {
		m := baseEnv()
		for k, v := range change {
			m[k] = v
		}
		if _, err := load("", env(m)); err == nil {
			t.Fatal("accepted bad config", change)
		}
	}
}
func TestFileAndPasswordOverride(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	data := `server:
  app_origin: https://file.example.com
admin:
  username: file-owner
  password_hash: '$argon2id$file-hash'
s3:
  endpoint: http://localhost:9000
  region: test
  bucket: private
  access_key_id: file-key
  secret_access_key: file-secret
`
	if err := os.WriteFile(path, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	c, err := load(path, env(map[string]string{}))
	if err != nil || c.Admin.PasswordHash != "$argon2id$file-hash" {
		t.Fatal(err)
	}
	c, err = load(path, env(map[string]string{"ADMIN_PASSWORD": "override", "S3_ACCESS_KEY_ID": "env-key"}))
	if err != nil || c.Admin.PasswordHash != "" || c.Admin.Password != "override" || c.S3.AccessKeyID != "env-key" || c.S3.SecretAccessKey != "file-secret" {
		t.Fatal("merge", err)
	}
	if _, err = load(path, env(map[string]string{"S3_SECRET_ACCESS_KEY": ""})); err == nil {
		t.Fatal("empty env silently fell back")
	}
	if err = os.WriteFile(path, []byte(data+"unknown: value\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = load(path, env(nil)); err == nil {
		t.Fatal("unknown field ignored")
	}
}

func TestHTTPOriginSupported(t *testing.T) {
	values := baseEnv()
	values["APP_ORIGIN"] = "http://localhost:4321"
	c, err := load("", env(values))
	if err != nil {
		t.Fatalf("local HTTP configuration must start without HTTPS enforcement: %v", err)
	}
	if c.Server.AppOrigin != "http://localhost:4321" {
		t.Fatal("unexpected origin", c.Server.AppOrigin)
	}
}

func TestHTTPSRequirementAndDefaults(t *testing.T) {
	values := baseEnv()
	delete(values, "APP_ORIGIN")
	c, err := load("", env(values))
	if err != nil || c.Server.AppOrigin != "http://localhost:4321" || c.Server.RequireHTTPS {
		t.Fatal("local defaults", err)
	}
	values["REQUIRE_HTTPS"] = "true"
	if _, err = load("", env(values)); err == nil {
		t.Fatal("HTTP accepted when HTTPS required")
	}
	values["APP_ORIGIN"] = "https://diary.example.com/"
	c, err = load("", env(values))
	if err != nil || c.Server.AppOrigin != "https://diary.example.com" {
		t.Fatal("HTTPS origin normalization", err)
	}
	values["REQUIRE_HTTPS"] = "not-bool"
	if _, err = load("", env(values)); err == nil {
		t.Fatal("invalid switch accepted")
	}
}
func TestFileHTTPSRequirementEnvironmentOverride(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("server:\n  require_https: true\n"), 0600); err != nil {
		t.Fatal(err)
	}
	values := baseEnv()
	values["APP_ORIGIN"] = "http://localhost:4321/"
	if _, err := load(path, env(values)); err == nil {
		t.Fatal("file HTTPS requirement ignored")
	}
	values["REQUIRE_HTTPS"] = "false"
	c, err := load(path, env(values))
	if err != nil || c.Server.RequireHTTPS || c.Server.AppOrigin != "http://localhost:4321" {
		t.Fatal("environment override", err)
	}
}
