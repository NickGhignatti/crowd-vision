package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

type fakeAuthenticator struct {
	idToken string
	err     error
}

func (f *fakeAuthenticator) PasswordGrant(context.Context, string, string) (string, error) {
	return f.idToken, f.err
}

type fakeRegistrar struct {
	err     error
	gotName string
}

func (f *fakeRegistrar) CreateUser(_ context.Context, _, _, name string) error {
	f.gotName = name
	return f.err
}

func gatewayWithPasswordAuth(auth service.PasswordAuthenticator, reg service.UserRegistrar) *service.Gateway {
	return service.New(
		&fakeVerifier{claims: service.IDTokenClaims{Sub: "acc-1", PreferredUsername: "mario"}},
		&fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}},
		fakeSigner{}, time.Hour,
	).WithPasswordAuth(auth, reg)
}

func TestLoginHandler_ReturnsTokenAndSetsCookie(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{idToken: "raw-id-token"}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"mario","password":"correct"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "authentication_token" || !cookies[0].HttpOnly {
		t.Fatalf("got cookies %+v", cookies)
	}
}

func TestLoginHandler_RejectsMissingBody(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"mario"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestLoginHandler_InvalidCredentialsIs401(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{err: service.ErrInvalidCredentials}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"mario","password":"wrong"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestLoginHandler_KeycloakUnavailableIs503(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{err: service.ErrKeycloakUnavailable}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"username":"mario","password":"x"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}

func TestRegisterHandler_CreatesUserLogsInAndSetsCookie(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{idToken: "raw-id-token"}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"email":"new@unibo.it","password":"s3cret!"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct{ Token string }
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Fatal("expected a signed session token from the login that follows registration")
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "authentication_token" {
		t.Fatalf("got cookies %+v", cookies)
	}
}

func TestRegisterHandler_RejectsMissingBody(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"email":"new@unibo.it"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestRegisterHandler_ForwardsNameToTheRegistrar(t *testing.T) {
	reg := &fakeRegistrar{}
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{idToken: "raw-id-token"}, reg)
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"email":"new@unibo.it","password":"s3cret!","name":"Mario Rossi"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if reg.gotName != "Mario Rossi" {
		t.Fatalf("got name %q, want it forwarded to the registrar", reg.gotName)
	}
}

func TestRegisterHandler_NameIsOptional(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{idToken: "raw-id-token"}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"email":"new@unibo.it","password":"s3cret!"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: a missing display name must not fail registration", rec.Code)
	}
}

func TestRegisterHandler_EmailTakenIs409(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{}, &fakeRegistrar{err: service.ErrEmailTaken})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"email":"taken@unibo.it","password":"s3cret!"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
}

func TestRegisterHandler_KeycloakUnavailableIs503(t *testing.T) {
	gw := gatewayWithPasswordAuth(&fakeAuthenticator{}, &fakeRegistrar{err: service.ErrKeycloakUnavailable})
	r := api.Mount(gw, fakeSigner{}, nil, issuer)

	req := httptest.NewRequest(http.MethodPost, "/register", strings.NewReader(`{"email":"new@unibo.it","password":"s3cret!"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}
