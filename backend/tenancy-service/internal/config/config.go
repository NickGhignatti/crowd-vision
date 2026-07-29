package config

import (
	"fmt"
	"os"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	RedisURL       string
	InternalSecret []byte
	TenancyEnabled bool
}

func Load() (Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	secret := os.Getenv("INTERNAL_SIGNING_SECRET")
	if secret == "" {
		return Config{}, fmt.Errorf("INTERNAL_SIGNING_SECRET is required")
	}

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":3000"
	}

	return Config{
		Addr:           addr,
		DatabaseURL:    dbURL,
		RedisURL:       os.Getenv("REDIS_URL"),
		InternalSecret: []byte(secret),
		// Absent (not "false") means enabled: explicit opt-out for tiers that
		// disable tenancy, not opt-in.
		TenancyEnabled: os.Getenv("CV_TENANCY") != "disabled",
	}, nil
}
