// These tests run the real github.com/coreos/go-oidc/v3/oidc discovery and
// verification code against a minimal fake IdP server this file stands up —
// not a mocked Verifier interface. That exercises the actual signature,
// issuer, audience, and expiry checks go-oidc performs, without needing a
// full Keycloak container for every test run (Keycloak's own realm/claims
// shape was validated by hand against a live container — see keycloak/CLAUDE.md).
package oidcverifier_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/golang-jwt/jwt/v5"

	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/oidcverifier"
)

const clientID = "cv-gateway"

// fakeIdP serves the two endpoints go-oidc needs for discovery: the OIDC
// configuration document and the JWKS it points at.
func fakeIdP(t *testing.T, key *rsa.PrivateKey) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	var issuer string

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer":   issuer,
			"jwks_uri": issuer + "/jwks",
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		jwk, err := jwkset.NewJWKFromKey(&key.PublicKey, jwkset.JWKOptions{
			Metadata: jwkset.JWKMetadataOptions{KID: "test-kid", ALG: jwkset.ALG("RS256")},
		})
		if err != nil {
			t.Fatalf("building jwk: %v", err)
		}
		raw, _ := json.Marshal(jwkset.JWKSMarshal{Keys: []jwkset.JWKMarshal{jwk.Marshal()}})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(raw)
	})

	srv := httptest.NewServer(mux)
	issuer = srv.URL
	return srv
}

func signIDToken(t *testing.T, key *rsa.PrivateKey, issuer string, claims jwt.MapClaims) string {
	t.Helper()
	base := jwt.MapClaims{
		"iss": issuer, "aud": clientID, "sub": "acc-1",
		"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
	}
	for k, v := range claims {
		base[k] = v
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, base)
	tok.Header["kid"] = "test-kid"
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("signing: %v", err)
	}
	return signed
}

func TestVerify_AcceptsAValidIDToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()

	v, err := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	tok := signIDToken(t, key, srv.URL, jwt.MapClaims{
		"preferred_username": "mario@unibo.it",
		"email_verified":     true,
		// Real shape, confirmed against a live Keycloak 26 + Organizations
		// feature: an array of org names, not a map.
		"organization": []string{"unibo"},
		"roles":        []string{"standard_customer"},
	})

	claims, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if claims.Sub != "acc-1" || claims.PreferredUsername != "mario@unibo.it" || !claims.EmailVerified {
		t.Fatalf("got %+v", claims)
	}
	if claims.Organization != "unibo" {
		t.Fatalf("got organization %q, want unibo", claims.Organization)
	}
	if len(claims.Roles) != 1 || claims.Roles[0] != "standard_customer" {
		t.Fatalf("got roles %v", claims.Roles)
	}
}

func TestVerify_ReadsNameClaimForDisplayName(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, key, srv.URL, jwt.MapClaims{"name": "Mario Rossi"})
	claims, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Name != "Mario Rossi" {
		t.Fatalf("got name %q, want Mario Rossi", claims.Name)
	}
}

func TestVerify_NoNameClaim_IsEmptyNotError(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, key, srv.URL, jwt.MapClaims{"preferred_username": "mario@unibo.it"})
	claims, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Name != "" {
		t.Fatalf("got name %q, want empty (no display name set for this account yet)", claims.Name)
	}
}

func TestVerify_NoOrganizationClaim_IsEmptyNotError(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, key, srv.URL, jwt.MapClaims{"preferred_username": "solo"})
	claims, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Organization != "" {
		t.Fatalf("got organization %q, want empty (self-signup, no org yet)", claims.Organization)
	}
}

func TestVerify_RejectsWrongAudience(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, key, srv.URL, jwt.MapClaims{"aud": "some-other-app"})
	if _, err := v.Verify(context.Background(), tok); err == nil {
		t.Fatal("expected an error for a token minted for a different client")
	}
}

func TestVerify_RejectsExpiredToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, key, srv.URL, jwt.MapClaims{"exp": time.Now().Add(-time.Hour).Unix()})
	if _, err := v.Verify(context.Background(), tok); err == nil {
		t.Fatal("expected an error for an expired token")
	}
}

func TestVerify_RejectsWrongSigningKey(t *testing.T) {
	trusted, _ := rsa.GenerateKey(rand.Reader, 2048)
	attacker, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, trusted)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, attacker, srv.URL, nil)
	if _, err := v.Verify(context.Background(), tok); err == nil {
		t.Fatal("expected an error for a token signed by an untrusted key")
	}
}

func TestVerify_RejectsWrongIssuer(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()
	v, _ := oidcverifier.New(context.Background(), srv.URL, srv.URL, clientID)

	tok := signIDToken(t, key, "https://not-the-real-issuer.example", nil)
	if _, err := v.Verify(context.Background(), tok); err == nil {
		t.Fatal("expected an error for a mismatched issuer")
	}
}

// TestVerify_RewritesUnreachableJWKSURIOntoTheDiscoveryHost reproduces the
// real bug this design was changed to fix: an IdP with a pinned public
// hostname (Keycloak's KC_HOSTNAME) advertises jwks_uri using that external
// host in its discovery document, even when reached over an internal
// hostname a container network can actually route to. Verify must still
// succeed by rewriting jwks_uri onto the discovery host.
func TestVerify_RewritesUnreachableJWKSURIOntoTheDiscoveryHost(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)

	mux := http.NewServeMux()
	const externalIssuer = "http://external-host.invalid" // must never actually be dialed
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer":   externalIssuer,
			"jwks_uri": externalIssuer + "/jwks", // unreachable from this process
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		jwk, _ := jwkset.NewJWKFromKey(&key.PublicKey, jwkset.JWKOptions{
			Metadata: jwkset.JWKMetadataOptions{KID: "test-kid", ALG: jwkset.ALG("RS256")},
		})
		raw, _ := json.Marshal(jwkset.JWKSMarshal{Keys: []jwkset.JWKMarshal{jwk.Marshal()}})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(raw)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// discoveryURL is the only host this process can actually reach;
	// issuerURL is what tokens carry (matching the discovery doc's `issuer`).
	v, err := oidcverifier.New(context.Background(), srv.URL, externalIssuer, clientID)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	tok := signIDToken(t, key, externalIssuer, nil)
	if _, err := v.Verify(context.Background(), tok); err != nil {
		t.Fatalf("expected verification to succeed via the rewritten jwks_uri: %v", err)
	}
}

func TestVerify_AcceptsSplitDiscoveryAndIssuerURLs(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	srv := fakeIdP(t, key)
	defer srv.Close()

	// Simulates the real container topology: the gateway discovers/fetches
	// JWKS over one URL (here, srv.URL — standing in for the internal
	// Docker-network hostname), but tokens carry a different externally-
	// visible canonical issuer (standing in for the browser-facing hostname).
	const externalIssuer = "https://id.crowdvision.app/realms/crowdvision"
	v, err := oidcverifier.New(context.Background(), srv.URL, externalIssuer, clientID)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	tok := signIDToken(t, key, externalIssuer, nil)
	if _, err := v.Verify(context.Background(), tok); err != nil {
		t.Fatalf("expected the external issuer to validate: %v", err)
	}

	// A token still carrying the internal discovery URL as `iss` must be
	// rejected — only the configured external issuer is trusted.
	internalTok := signIDToken(t, key, srv.URL, nil)
	if _, err := v.Verify(context.Background(), internalTok); err == nil {
		t.Fatal("expected the internal discovery URL to be rejected as an issuer")
	}
}

func TestNew_FailsFastWhenIssuerIsUnreachable(t *testing.T) {
	_, err := oidcverifier.New(context.Background(), "http://127.0.0.1:1", "http://127.0.0.1:1", clientID)
	if err == nil {
		t.Fatal("expected discovery to fail for an unreachable issuer")
	}
}
