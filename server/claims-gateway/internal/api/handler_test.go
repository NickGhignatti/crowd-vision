package api_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

const issuer = "cv-gateway"

type fakeVerifier struct {
	claims service.IDTokenClaims
	err    error
}

func (f *fakeVerifier) Verify(context.Context, string) (service.IDTokenClaims, error) {
	return f.claims, f.err
}

type fakeTenancy struct{ memberships []authcontracts.Membership }

func (f *fakeTenancy) MembershipsFor(context.Context, string) ([]authcontracts.Membership, error) {
	return f.memberships, nil
}
func (f *fakeTenancy) Provision(context.Context, service.ProvisionRequest) error { return nil }

type fakeSigner struct{}

func (fakeSigner) Sign(claims authcontracts.StandardClaims, _ time.Duration) (string, error) {
	return "signed." + claims.Sub, nil
}
func (fakeSigner) JWKS() []byte { return []byte(`{"keys":[{"kid":"test-kid"}]}`) }

func TestExchangeHandler_ReturnsTokenAndSetsCookie(t *testing.T) {
	gw := service.New(
		&fakeVerifier{claims: service.IDTokenClaims{Sub: "acc-1", PreferredUsername: "mario"}},
		&fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}},
		fakeSigner{}, time.Hour,
	)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	body := strings.NewReader(`{"idToken":"raw-token"}`)
	req := httptest.NewRequest(http.MethodPost, "/exchange", body)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct{ Token string }
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token != "signed.acc-1" {
		t.Fatalf("got token %q", resp.Token)
	}

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "authentication_token" || cookies[0].Value != "signed.acc-1" {
		t.Fatalf("got cookies %+v", cookies)
	}
	if !cookies[0].HttpOnly {
		t.Fatal("the internal token cookie must be HttpOnly")
	}
}

func TestExchangeHandler_RejectsMissingBody(t *testing.T) {
	gw := service.New(&fakeVerifier{}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/exchange", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestExchangeHandler_InvalidIDTokenIs401(t *testing.T) {
	gw := service.New(&fakeVerifier{err: service.ErrInvalidIDToken}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/exchange", strings.NewReader(`{"idToken":"bad"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestExchangeHandler_TenancyUnavailableIs503(t *testing.T) {
	gw := service.New(&fakeVerifier{claims: service.IDTokenClaims{Sub: "acc-1"}}, &erroringTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/exchange", strings.NewReader(`{"idToken":"ok"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503 (fail closed, distinct from an auth failure)", rec.Code)
	}
}

type erroringTenancy struct{}

func (erroringTenancy) MembershipsFor(context.Context, string) ([]authcontracts.Membership, error) {
	return nil, service.ErrTenancyUnavailable
}
func (erroringTenancy) Provision(context.Context, service.ProvisionRequest) error { return nil }

func TestJWKSHandler_ServesTheKeySet(t *testing.T) {
	gw := service.New(&fakeVerifier{}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodGet, "/.well-known/jwks.json", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("got content-type %q", rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(rec.Body.String(), "test-kid") {
		t.Fatalf("got body %s", rec.Body.String())
	}
}

func TestHealthHandler(t *testing.T) {
	gw := service.New(&fakeVerifier{}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

func TestLogoutHandler_ClearsTheCookie(t *testing.T) {
	gw := service.New(&fakeVerifier{}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204", rec.Code)
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "authentication_token" || cookies[0].MaxAge >= 0 {
		t.Fatalf("got %+v, want a cookie cleared via MaxAge<0", cookies)
	}
}

// --- /me: uses real RSA signing, unlike fakeSigner's non-cryptographic
// "signed.<sub>" stand-in above — /me round-trips through real verification,
// so it needs a real token.

const meKID = "me-test-kid"

func realKeyfunc(t *testing.T, pub *rsa.PublicKey) keyfunc.Keyfunc {
	t.Helper()
	jwk, err := jwkset.NewJWKFromKey(pub, jwkset.JWKOptions{
		Metadata: jwkset.JWKMetadataOptions{KID: meKID, ALG: jwkset.ALG("RS256")},
	})
	if err != nil {
		t.Fatalf("building jwk: %v", err)
	}
	raw, _ := json.Marshal(jwkset.JWKSMarshal{Keys: []jwkset.JWKMarshal{jwk.Marshal()}})
	kf, err := keyfunc.NewJWKSetJSON(raw)
	if err != nil {
		t.Fatalf("building keyfunc: %v", err)
	}
	return kf
}

func signRealToken(t *testing.T, key *rsa.PrivateKey, claims authcontracts.StandardClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": claims.Sub, "accountName": claims.AccountName, "sid": claims.SID,
		"memberships": claims.Memberships,
		"iss":         issuer, "exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = meKID
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("signing: %v", err)
	}
	return signed
}

func TestMeHandler_ReturnsTheCallersClaims(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating key: %v", err)
	}
	gw := service.New(&fakeVerifier{}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	token := signRealToken(t, key, authcontracts.StandardClaims{
		Sub: "acc-1", AccountName: "mario",
		Memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}},
	})
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got authcontracts.StandardClaims
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.Sub != "acc-1" || got.AccountName != "mario" || len(got.Memberships) != 1 {
		t.Fatalf("got %+v", got)
	}
}

func TestMeHandler_RequiresAuthentication(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	gw := service.New(&fakeVerifier{}, &fakeTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}
