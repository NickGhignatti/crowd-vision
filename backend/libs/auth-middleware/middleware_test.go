package authmiddleware_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
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

	// Classic alg-confusion: unsigned token claiming alg "none" — must be rejected
	// regardless, since the middleware only accepts RS256.
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

// --- RequireMeshClaims ---
//
// The mesh path is what every service except claims-gateway actually runs: the
// edge verifies the JWT once and injects x-gateway-claims, and this middleware
// decodes that header and trusts it without any signature check. It had no tests
// of its own, which for the repo's downstream trust boundary is the wrong place
// to be taking the edge's word for it.

func meshHandler() (http.Handler, *bool, *authcontracts.StandardClaims) {
	called := false
	var seen authcontracts.StandardClaims
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		claims, _ := authmiddleware.FromContext(r.Context())
		seen = claims
		w.WriteHeader(http.StatusOK)
	})
	return authmiddleware.RequireMeshClaims()(next), &called, &seen
}

func meshHeader(t *testing.T, payload any) string {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshaling claims: %v", err)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

func TestRequireMeshClaims_AcceptsAndForwardsInjectedClaims(t *testing.T) {
	handler, called, seen := meshHandler()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("x-gateway-claims", meshHeader(t, map[string]any{
		"sub": "acc-1", "accountName": "mario", "sid": "sid-1",
		"memberships": []map[string]string{{"domain": "unibo", "role": "business_admin", "externalId": "ext-9"}},
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || !*called {
		t.Fatalf("got status %d called=%v, want 200 and the next handler run", rec.Code, *called)
	}
	if seen.Sub != "acc-1" || seen.AccountName != "mario" || seen.SID != "sid-1" {
		t.Fatalf("got %+v, want the identity fields carried through", *seen)
	}
	if len(seen.Memberships) != 1 || seen.Memberships[0].Domain != "unibo" ||
		seen.Memberships[0].Role != "business_admin" || seen.Memberships[0].ExternalID != "ext-9" {
		t.Fatalf("got memberships %+v, want the full membership carried through", seen.Memberships)
	}
}

// Each rejection is a separate reason and they must not be collapsed: an absent
// header is an unauthenticated caller, whereas a present-but-unusable one means
// something upstream is injecting garbage.
func TestRequireMeshClaims_Rejections(t *testing.T) {
	cases := []struct {
		name   string
		header string
		set    bool
	}{
		{"no header at all", "", false},
		{"empty header", "", true},
		{"not base64", "!!!not-base64!!!", true},
		{"base64 of something that is not JSON", base64.StdEncoding.EncodeToString([]byte("not json")), true},
		{"valid JSON with no sub", base64.StdEncoding.EncodeToString([]byte(`{"accountName":"mario"}`)), true},
		{"valid JSON with an empty sub", base64.StdEncoding.EncodeToString([]byte(`{"sub":""}`)), true},
		{"JSON array instead of an object", base64.StdEncoding.EncodeToString([]byte(`[]`)), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler, called, _ := meshHandler()
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.set {
				req.Header.Set("x-gateway-claims", tc.header)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("got status %d, want 401", rec.Code)
			}
			if *called {
				t.Fatal("next handler ran despite the claims being rejected")
			}
		})
	}
}

// A membership-less account is a real state (freshly signed up, no domain yet):
// it must authenticate, not 401, and arrive with no memberships rather than a nil
// dereference downstream.
func TestRequireMeshClaims_AcceptsAnAccountWithNoMemberships(t *testing.T) {
	handler, called, seen := meshHandler()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("x-gateway-claims", meshHeader(t, map[string]any{"sub": "acc-new"}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || !*called {
		t.Fatalf("got status %d called=%v, want 200", rec.Code, *called)
	}
	if len(seen.Memberships) != 0 {
		t.Fatalf("got %+v, want no memberships", seen.Memberships)
	}
}

// --- decodeClaims, through the JWT path ---

func TestRequireAuthentication_TokenWithNoMembershipsClaimIsValid(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)
	handler, called := newHandler(kf)

	claims := validClaims()
	delete(claims, "memberships") // a brand-new account, before it joins anything
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+signRS256(t, key, claims))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || !*called {
		t.Fatalf("got status %d called=%v, want 200", rec.Code, *called)
	}
}

// One malformed entry must not discard the rest: dropping a caller's valid
// memberships silently downgrades what they are allowed to do.
func TestRequireAuthentication_SkipsMalformedMembershipEntries(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)

	var seen authcontracts.StandardClaims
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, _ = authmiddleware.FromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authmiddleware.RequireAuthentication(kf, issuer)(next)

	claims := validClaims()
	claims["memberships"] = []any{
		"a bare string, not an object",
		map[string]any{"domain": "unibo", "role": "business_admin"},
		42,
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+signRS256(t, key, claims))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	if len(seen.Memberships) != 1 || seen.Memberships[0].Domain != "unibo" {
		t.Fatalf("got %+v, want only the one well-formed membership kept", seen.Memberships)
	}
}

// The two paths are documented as delivering an identical contract, so they must
// also reject identically. RequireMeshClaims refuses an empty sub; a signed token
// without one is just as unusable — every downstream authorization decision keys
// off Sub, and an empty one is an anonymous caller wearing a valid signature.
func TestRequireAuthentication_RejectsTokenWithNoSub(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kf := testKeyfunc(t, &key.PublicKey)

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	handler := authmiddleware.RequireAuthentication(kf, issuer)(next)

	for _, tc := range []struct {
		name string
		mut  func(jwt.MapClaims)
	}{
		{"sub absent", func(c jwt.MapClaims) { delete(c, "sub") }},
		{"sub empty", func(c jwt.MapClaims) { c["sub"] = "" }},
		{"sub not a string", func(c jwt.MapClaims) { c["sub"] = 42 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called = false
			claims := validClaims()
			tc.mut(claims)

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Authorization", "Bearer "+signRS256(t, key, claims))
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("got status %d, want 401", rec.Code)
			}
			if called {
				t.Fatal("next handler ran with no usable subject")
			}
		})
	}
}
