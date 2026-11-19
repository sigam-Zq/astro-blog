package config

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
)

type Config struct {
	Server struct {
		Addr         string `yaml:"addr"`
		AppOrigin    string `yaml:"app_origin"`
		RequireHTTPS bool   `yaml:"require_https"`
	} `yaml:"server"`
	Admin struct {
		Username     string `yaml:"username"`
		Password     string `yaml:"password"`
		PasswordHash string `yaml:"password_hash"`
	} `yaml:"admin"`
	S3 struct {
		Endpoint        string `yaml:"endpoint"`
		Region          string `yaml:"region"`
		Bucket          string `yaml:"bucket"`
		Prefix          string `yaml:"prefix"`
		AccessKeyID     string `yaml:"access_key_id"`
		SecretAccessKey string `yaml:"secret_access_key"`
		ForcePathStyle  bool   `yaml:"force_path_style"`
	} `yaml:"s3"`
}

func Load(path string) (Config, error) { return load(path, os.LookupEnv) }
func load(path string, env func(string) (string, bool)) (c Config, err error) {
	c.Server.Addr = "0.0.0.0:8080"
	c.Server.AppOrigin = "http://localhost:4321"
	c.S3.Prefix = "diary/v1/"
	c.S3.ForcePathStyle = true
	if path == "" {
		path, _ = env("DIARY_CONFIG")
	}
	if path != "" {
		f, e := os.Open(path)
		if e != nil {
			return c, errors.New("cannot open configuration file")
		}
		defer f.Close()
		d := yaml.NewDecoder(io.LimitReader(f, 1<<20))
		d.KnownFields(true)
		if e = d.Decode(&c); e != nil {
			return c, errors.New("invalid configuration YAML")
		}
		var extra any
		if e = d.Decode(&extra); e != io.EOF {
			return c, errors.New("configuration must contain one YAML document")
		}
	}
	if c.Admin.Password != "" && c.Admin.PasswordHash != "" {
		return c, errors.New("configure only one file password representation")
	}
	fields := map[string]*string{"HTTP_ADDR": &c.Server.Addr, "APP_ORIGIN": &c.Server.AppOrigin, "ADMIN_USERNAME": &c.Admin.Username, "S3_ENDPOINT": &c.S3.Endpoint, "S3_REGION": &c.S3.Region, "S3_BUCKET": &c.S3.Bucket, "S3_PREFIX": &c.S3.Prefix, "S3_ACCESS_KEY_ID": &c.S3.AccessKeyID, "S3_SECRET_ACCESS_KEY": &c.S3.SecretAccessKey}
	for k, p := range fields {
		if v, ok := env(k); ok {
			*p = v
		}
	}
	pass, pok := env("ADMIN_PASSWORD")
	hash, hok := env("ADMIN_PASSWORD_HASH")
	if pok && hok {
		return c, errors.New("configure only one environment password representation")
	}
	if pok || hok {
		c.Admin.Password = pass
		c.Admin.PasswordHash = hash
	}
	for name, target := range map[string]*bool{"S3_FORCE_PATH_STYLE": &c.S3.ForcePathStyle, "REQUIRE_HTTPS": &c.Server.RequireHTTPS} {
		if v, ok := env(name); ok {
			parsed, e := strconv.ParseBool(v)
			if e != nil {
				return c, fmt.Errorf("invalid %s", name)
			}
			*target = parsed
		}
	}

	if _, _, e := net.SplitHostPort(c.Server.Addr); e != nil {
		return c, errors.New("invalid server address")
	}
	u, e := url.Parse(c.Server.AppOrigin)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return c, errors.New("APP_ORIGIN must be an HTTP or HTTPS origin without a path (for example http://localhost:4321)")
	}
	c.Server.AppOrigin = strings.TrimSuffix(u.String(), "/")
	if c.Server.RequireHTTPS && u.Scheme != "https" {
		return c, errors.New("REQUIRE_HTTPS is enabled: APP_ORIGIN must use HTTPS")
	}
	u, e = url.Parse(c.S3.Endpoint)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return c, errors.New("invalid S3 endpoint")
	}
	for k, v := range map[string]string{"admin.username": c.Admin.Username, "s3.region": c.S3.Region, "s3.bucket": c.S3.Bucket, "s3.access_key_id": c.S3.AccessKeyID, "s3.secret_access_key": c.S3.SecretAccessKey} {
		if strings.TrimSpace(v) == "" {
			return c, fmt.Errorf("missing required configuration: %s", k)
		}
	}
	if (c.Admin.Password == "") == (c.Admin.PasswordHash == "") {
		return c, errors.New("exactly one administrator password representation is required")
	}
	if len(c.Admin.Password) > 1024 {
		return c, errors.New("administrator password is too long")
	}
	if c.S3.Prefix == "" || strings.HasPrefix(c.S3.Prefix, "/") || !strings.HasSuffix(c.S3.Prefix, "/") || strings.Contains(c.S3.Prefix, "..") {
		return c, errors.New("S3 prefix must be a nonempty relative prefix ending in /")
	}
	return c, nil
}
