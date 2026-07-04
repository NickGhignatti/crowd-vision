package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

func writePKCS8Key(t *testing.T) (*rsa.PrivateKey, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	path := filepath.Join(t.TempDir(), "gateway-key.pem")
	if err := os.WriteFile(path, pemBytes, 0o600); err != nil {
		t.Fatalf("write key: %v", err)
	}
	return key, path
}

func TestLoadOrGenerateKey_FromFileIsStable(t *testing.T) {
	want, path := writePKCS8Key(t)
	t.Setenv("GATEWAY_PRIVATE_KEY", "")
	t.Setenv("GATEWAY_PRIVATE_KEY_FILE", path)

	got, kid, err := loadOrGenerateKey()
	if err != nil {
		t.Fatalf("loadOrGenerateKey: %v", err)
	}
	if got.N.Cmp(want.N) != 0 {
		t.Error("loaded key does not match the file's key")
	}
	// A file-backed key is stable across restarts, so it must not use the
	// ephemeral kid — otherwise consumers can't cache-key it.
	if kid != "cv-gateway-1" {
		t.Errorf("kid = %q, want cv-gateway-1", kid)
	}
}

func TestLoadOrGenerateKey_FileWinsOverEphemeralFallback(t *testing.T) {
	_, path := writePKCS8Key(t)
	t.Setenv("GATEWAY_PRIVATE_KEY", "")
	t.Setenv("GATEWAY_PRIVATE_KEY_FILE", path)

	_, kid, err := loadOrGenerateKey()
	if err != nil {
		t.Fatalf("loadOrGenerateKey: %v", err)
	}
	if kid == "ephemeral-dev-key" {
		t.Error("fell back to ephemeral key despite GATEWAY_PRIVATE_KEY_FILE being set")
	}
}

func TestLoadOrGenerateKey_MissingFileErrors(t *testing.T) {
	t.Setenv("GATEWAY_PRIVATE_KEY", "")
	t.Setenv("GATEWAY_PRIVATE_KEY_FILE", filepath.Join(t.TempDir(), "does-not-exist.pem"))

	if _, _, err := loadOrGenerateKey(); err == nil {
		t.Error("expected an error for a missing key file, got nil")
	}
}
