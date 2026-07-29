package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/config"
	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/reconciler"
	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/registryclient"
	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/tenancyclient"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	registry := registryclient.New(cfg.RegistryURL, cfg.InternalSecret)
	tenancy := tenancyclient.New(cfg.TenancyURL, cfg.InternalSecret)
	rec := reconciler.New(registry, tenancy)

	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
		_ = http.ListenAndServe(":3000", mux)
	}()

	log.Printf("provisioner reconciling every %s", cfg.ReconcileInterval)
	ticker := time.NewTicker(cfg.ReconcileInterval)
	defer ticker.Stop()

	runOnce := func() {
		reconcileCtx, cancel := context.WithTimeout(ctx, cfg.ReconcileInterval)
		defer cancel()
		if err := rec.ReconcileOnce(reconcileCtx); err != nil {
			log.Printf("reconcile: %v", err)
		}
	}

	runOnce()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runOnce()
		}
	}
}
