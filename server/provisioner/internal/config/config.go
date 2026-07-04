package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	RegistryURL      string
	TenancyURL       string
	InternalSecret   []byte
	ReconcileInterval time.Duration
}

func Load() (Config, error) {
	registryURL := os.Getenv("REGISTRY_URL")
	if registryURL == "" {
		return Config{}, fmt.Errorf("REGISTRY_URL is required")
	}
	tenancyURL := os.Getenv("TENANCY_URL")
	if tenancyURL == "" {
		return Config{}, fmt.Errorf("TENANCY_URL is required")
	}
	secret := os.Getenv("INTERNAL_SIGNING_SECRET")
	if secret == "" {
		return Config{}, fmt.Errorf("INTERNAL_SIGNING_SECRET is required")
	}
	return Config{
		RegistryURL: registryURL, TenancyURL: tenancyURL, InternalSecret: []byte(secret),
		ReconcileInterval: 15 * time.Second,
	}, nil
}
