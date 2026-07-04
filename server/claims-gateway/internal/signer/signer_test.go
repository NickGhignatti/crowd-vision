package signer_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/signer"
)

func testKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating key: %v", err)
	}
	return key
}

func TestSign_ProducesAVerifiableRS256Token(t *testing.T) {
	key := testKey(t)
	s := signer.New(key, "test-kid", "cv-gateway")

	claims := authcontracts.StandardClaims{
		Sub: "acc-1", AccountName: "mario", SID: "sid-1",
		Memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}},
	}
	tok, err := s.Sign(claims, time.Hour)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	parsed, err := jwt.Parse(tok, func(*jwt.Token) (any, error) { return &key.PublicKey, nil },
		jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer("cv-gateway"))
	if err != nil || !parsed.Valid {
		t.Fatalf("token did not verify against its own public key: %v", err)
	}

	mc := parsed.Claims.(jwt.MapClaims)
	if mc["sub"] != "acc-1" || mc["accountName"] != "mario" {
		t.Fatalf("got claims %+v", mc)
	}
}

func TestSign_SetsShortExpiryFromTTL(t *testing.T) {
	key := testKey(t)
	s := signer.New(key, "test-kid", "cv-gateway")

	tok, err := s.Sign(authcontracts.StandardClaims{Sub: "acc-1"}, 15*time.Minute)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	parsed, _ := jwt.Parse(tok, func(*jwt.Token) (any, error) { return &key.PublicKey, nil },
		jwt.WithValidMethods([]string{"RS256"}))
	exp, err := parsed.Claims.GetExpirationTime()
	if err != nil || exp == nil {
		t.Fatalf("missing exp claim: %v", err)
	}
	if time.Until(exp.Time) > 16*time.Minute {
		t.Fatalf("expiry too far in the future: %v", exp.Time)
	}
}

func TestJWKSHandler_PublishesTheVerifyingKey(t *testing.T) {
	key := testKey(t)
	s := signer.New(key, "test-kid", "cv-gateway")

	raw := s.JWKS()
	var parsed struct {
		Keys []struct {
			Kid string `json:"kid"`
			Alg string `json:"alg"`
			Use string `json:"use"`
			Kty string `json:"kty"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("jwks is not valid json: %v", err)
	}
	if len(parsed.Keys) != 1 {
		t.Fatalf("got %d keys, want 1", len(parsed.Keys))
	}
	k := parsed.Keys[0]
	if k.Kid != "test-kid" || k.Alg != "RS256" || k.Kty != "RSA" {
		t.Fatalf("got %+v", k)
	}
}
