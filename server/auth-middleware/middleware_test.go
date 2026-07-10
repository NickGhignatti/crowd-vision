package authmiddleware_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	authmiddleware "github.com/NickGhignatti/crowd-vision/server/auth-middleware"
)

const issuer = "cv-gateway"

func testKeyfunc(t *testing.T, pub *rsa.PublicKey) keyfunc.Keyfunc {
	t.Helper()
	jwk, err := jwkset.NewJWKFromKey(pub, jwkset.JWKOptions{
		Metadata: jwkset.JWKMetadataOptions{KID: "test-kid", ALG: jwkset.ALG("RS256")},
	})
	if err != nil {
		t.Fatalf("building jwk: %v", err)
	}
	raw, err := json.Marshal(jwkset.JWKSMarshal{Keys: []jwkset.JWKMarshal{jwk.Marshal()}})
	if err != nil {
		t.Fatalf("marshaling jwks: %v", err)
	}
	kf, err := keyfunc.NewJWKSetJSON(raw)
	if err != nil {
		t.Fatalf("building keyfunc: %v", err)
	}
	return kf
}

func signRS256(t *testing.T, key *rsa.PrivateKey, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = "test-kid"
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("signing token: %v", err)
	}
	return signed
}

func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"sub":         "acc-1",
		"accountName": "mario",
		"sid":         "sid-1",
		"memberships": []map[string]string{{"domain": "unibo", "role": "standard_customer"}},
		"iss":         issuer,
		"exp":         time.Now().Add(time.Hour).Unix(),
	}
}

func newHandler(kf keyfunc.Keyfunc) (http.Handler, *bool) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		claims, ok := authmiddleware.FromContext(r.Context())
		if !ok || claims.Sub != "acc-1" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	return authmiddleware.RequireAuthentication(kf, issuer)(next), &called
}

func TestRequireAuthentication_AcceptsValidToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, called := newHandler(kf)

	tok := signRS256(t, key, validClaims())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	if !*called {
		t.Fatal("next handler was not called")
	}
}

func TestRequireAuthentication_RejectsMissingToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, called := newHandler(kf)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
	if *called {
		t.Fatal("next handler must not run for an unauthenticated request")
	}
}

func TestRequireAuthentication_RejectsExpiredToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, _ := newHandler(kf)

	claims := validClaims()
	claims["exp"] = time.Now().Add(-time.Hour).Unix()
	tok := signRS256(t, key, claims)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
}

func TestRequireAuthentication_RejectsWrongIssuer(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, _ := newHandler(kf)

	claims := validClaims()
	claims["iss"] = "someone-elses-gateway"
	tok := signRS256(t, key, claims)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
}

func TestRequireAuthentication_RejectsWrongSigningKey(t *testing.T) {
	trusted, _ := rsa.GenerateKey(rand.Reader, 2048)
	attacker, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &trusted.PublicKey)
	handler, _ := newHandler(kf)

	// Token is well-formed and even carries the trusted key's kid, but is
	// signed by a different private key — signature verification must fail.
	tok := signRS256(t, attacker, validClaims())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
}

func TestRequireAuthentication_RejectsAlgNoneConfusion(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, _ := newHandler(kf)

	// Classic alg-confusion attempt: an unsigned token claiming alg "none".
	// jwt.SigningMethodNone requires an explicit opt-in to sign, and the
	// middleware must reject it regardless because it only accepts RS256.
	tok := jwt.NewWithClaims(jwt.SigningMethodNone, validClaims())
	signed, err := tok.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("signing none-alg token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
}

func TestRequireAuthentication_AcceptsTokenFromCookie(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, _ := newHandler(kf)

	tok := signRS256(t, key, validClaims())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: authmiddleware.CookieName, Value: tok})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
}
