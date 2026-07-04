package config

import (
	"fmt"
	"os"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	InternalSecret []byte
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
	return Config{Addr: addr, DatabaseURL: dbURL, InternalSecret: []byte(secret)}, nil
}
