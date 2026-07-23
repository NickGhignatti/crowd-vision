package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/config"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/events"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := runMigrations(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connecting to postgres: %v", err)
	}
	defer pool.Close()

	svc := service.New(store.NewPostgres(pool))

	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

	if cfg.TenancyEnabled {
		api.Mount(r, svc, api.Config{
			InternalSecret: cfg.InternalSecret, TenancyEnabled: true,
		})

		if cfg.RedisURL != "" {
			opts, err := redis.ParseURL(cfg.RedisURL)
			if err != nil {
				log.Fatalf("parsing REDIS_URL: %v", err)
			}
			rdb := redis.NewClient(opts)
			hostname, _ := os.Hostname()
			consumer := events.NewConsumer(rdb, svc, hostname)
			if err := consumer.EnsureGroup(ctx); err != nil {
				log.Fatalf("ensuring consumer group: %v", err)
			}
			go consumer.Run(ctx)
		}
	}

	srv := &http.Server{Addr: cfg.Addr, Handler: r}
	go func() {
		log.Printf("tenancy-service listening on %s (tenancy=%v)", cfg.Addr, cfg.TenancyEnabled)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

func runMigrations(databaseURL string) error {
	m, err := migrate.New("file://migrations", databaseURL)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
