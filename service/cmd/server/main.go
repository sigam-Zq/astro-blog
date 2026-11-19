package main

import (
	"context"
	"diary/internal/auth"
	"diary/internal/config"
	"diary/internal/diary"
	"diary/internal/httpapi"
	"diary/internal/storage/s3"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("service stopped", "reason", err.Error())
		os.Exit(1)
	}
}
func run() error {
	path := flag.String("config", "", "configuration file")
	probe := flag.String("probe", "", "probe URL; no application configuration required")
	checkStorage := flag.Bool("check-storage", false, "check S3 reads and bucket listing without writing objects")
	checkStorageWrite := flag.Bool("check-storage-write", false, "also create, read and delete an isolated diagnostic object; no diary/index changes")
	rebuild := flag.Bool("rebuild-index", false, "rebuild index before serving; only run while all other writers are stopped")
	flag.Parse()
	if *probe != "" {
		client := http.Client{Timeout: 3 * time.Second}
		r, e := client.Get(*probe)
		if e != nil {
			return fmt.Errorf("probe failed")
		}
		defer r.Body.Close()
		if r.StatusCode != 200 {
			return fmt.Errorf("probe unhealthy")
		}
		return nil
	}
	c, err := config.Load(*path)
	if err != nil {
		return err
	}
	if *path != "" || os.Getenv("DIARY_CONFIG") != "" {
		overridden := []string{}
		for _, name := range []string{"HTTP_ADDR", "APP_ORIGIN", "REQUIRE_HTTPS", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_PASSWORD_HASH", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_PREFIX", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE"} {
			if _, ok := os.LookupEnv(name); ok {
				overridden = append(overridden, name)
			}
		}
		if len(overridden) > 0 {
			slog.Info("environment variables override configuration file", "fields", overridden)
		}
	}
	if *checkStorage || *checkStorageWrite {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		store, err := s3.New(ctx, c)
		if err != nil {
			return err
		}
		if err = verifyStorage(ctx, store, *checkStorageWrite); err != nil {
			return err
		}
		slog.Info("storage checks passed", "write_delete_checked", *checkStorageWrite)
		return nil
	}

	if c.Admin.Password != "" {
		c.Admin.PasswordHash, err = auth.HashPassword(c.Admin.Password)
		c.Admin.Password = ""
		if err != nil {
			return fmt.Errorf("password hashing failed")
		}
	}
	manager, err := auth.New(c.Admin.Username, c.Admin.PasswordHash)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	store, err := s3.New(ctx, c)
	if err != nil {
		return err
	}
	engine := diary.New(store)
	api := &httpapi.API{Engine: engine, Auth: manager, Origin: c.Server.AppOrigin}
	server := &http.Server{Addr: c.Server.Addr, Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 100 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	recoverDone := make(chan struct{})
	go func() {
		defer close(recoverDone)
		force := *rebuild
		for {
			if !engine.Ready() {
				attempt, cancel := context.WithTimeout(ctx, 10*time.Minute)
				err := engine.Recover(attempt, force)
				cancel()
				if err != nil {
					slog.Warn("index initialization or recovery pending", "reason", err.Error())
				} else {
					force = false
					slog.Info("diary ready")
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	}()
	errors := make(chan error, 1)
	go func() { slog.Info("service listening"); errors <- server.ListenAndServe() }()
	select {
	case <-ctx.Done():
	case err = <-errors:
		if err != http.ErrServerClosed {
			stop()
			<-recoverDone
			return fmt.Errorf("HTTP listener failed")
		}
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 110*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdown); err != nil {
		return fmt.Errorf("graceful shutdown timed out")
	}
	<-recoverDone
	// Never print endpoint, bucket, credentials or config dumps on shutdown.
	return nil
}
