package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MicahParks/keyfunc/v3"

	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/config"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/oidcverifier"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/signer"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/tenancyclient"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	verifier, err := oidcverifier.New(ctx, cfg.OIDCDiscoveryURL, cfg.OIDCIssuer, cfg.OIDCClientID)
	if err != nil {
		log.Fatalf("oidc discovery: %v", err)
	}
	tenancy := tenancyclient.New(cfg.TenancyURL, cfg.InternalSecret)
	sign := signer.New(cfg.SigningKey, cfg.SigningKeyID, cfg.Issuer)

	gw := service.New(verifier, tenancy, sign, cfg.TokenTTL)

	// /me verifies the gateway's OWN minted tokens — built directly from the
	// Signer's own JWKS bytes, never over HTTP to itself.
	verifyKeys, err := keyfunc.NewJWKSetJSON(sign.JWKS())
	if err != nil {
		log.Fatalf("building self-verification keyfunc: %v", err)
	}
	r := api.Mount(gw, sign, verifyKeys, cfg.Issuer)

	srv := &http.Server{Addr: cfg.Addr, Handler: r}
	go func() {
		log.Printf("claims-gateway listening on %s (issuer=%s)", cfg.Addr, cfg.OIDCIssuer)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
