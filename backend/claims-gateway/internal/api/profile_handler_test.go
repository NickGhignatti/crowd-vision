package api_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

type fakeProfileReader struct {
	email, name, picture string
	err                  error
}

func (f *fakeProfileReader) GetUser(context.Context, string) (string, string, string, error) {
	return f.email, f.name, f.picture, f.err
}

type fakeProfileUpdater struct{ err error }

func (f *fakeProfileUpdater) UpdateUser(context.Context, string, string, string) error { return f.err }

type fakePasswordChanger struct{ err error }

func (f *fakePasswordChanger) ResetPassword(context.Context, string, string) error { return f.err }

// gatewayWithProfileManagement wires a Gateway with password-auth and profile deps
// plus a real signing key, so authenticated routes can be exercised with a genuine JWT.
func gatewayWithProfileManagement(
	reader service.ProfileReader, updater service.ProfileUpdater, changer service.PasswordChanger,
) (*service.Gateway, *rsa.PrivateKey) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	gw := service.New(
		&fakeVerifier{},
		&fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}},
		fakeSigner{}, time.Hour,
	)
	gw.WithPasswordAuth(&fakeAuthenticator{}, &fakeRegistrar{})
	gw.WithProfileManagement(reader, updater, changer)
	return gw, key
}

func authedRequest(t *testing.T, method, path, body string, key *rsa.PrivateKey) *http.Request {
	t.Helper()
	token := signRealToken(t, key, authcontracts.StandardClaims{Sub: "acc-1", AccountName: "mario"})
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}

func TestProfileHandler_ReturnsEmailNameAndPicture(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{email: "mario@unibo.it", name: "Mario Rossi", picture: "https://lh3.googleusercontent.com/a/abc"}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodGet, "/profile", "", key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct{ Email, Name, Picture string }
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Email != "mario@unibo.it" || resp.Name != "Mario Rossi" || resp.Picture != "https://lh3.googleusercontent.com/a/abc" {
		t.Fatalf("got %+v", resp)
	}
}

func TestProfileHandler_OmitsPictureWhenAccountHasNone(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{email: "mario@unibo.it", name: "Mario Rossi"}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodGet, "/profile", "", key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	var resp struct{ Email, Name, Picture string }
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Picture != "" {
		t.Fatalf("got picture %q, want empty for a password-signup account", resp.Picture)
	}
}

func TestProfileHandler_RequiresAuthentication(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := httptest.NewRequest(http.MethodGet, "/profile", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestUpdateProfileHandler_UpdatesAndReturnsNoContent(t *testing.T) {
	updater := &fakeProfileUpdater{}
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, updater, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodPatch, "/profile", `{"email":"new@unibo.it","name":"Mario Rossi"}`, key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

// TestUpdateProfileHandler_RefreshesTheSessionCookie: a successful profile update
// must set a new session cookie, else /me keeps re-serving the pre-edit name.
func TestUpdateProfileHandler_RefreshesTheSessionCookie(t *testing.T) {
	updater := &fakeProfileUpdater{}
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, updater, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodPatch, "/profile", `{"name":"Mario Bianchi"}`, key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	cookies := rec.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == api.CookieName {
			sessionCookie = c
		}
	}
	if sessionCookie == nil || sessionCookie.Value == "" {
		t.Fatalf("expected a refreshed %q cookie, got %+v", api.CookieName, cookies)
	}
}

func TestUpdateProfileHandler_EmailTakenIs409(t *testing.T) {
	updater := &fakeProfileUpdater{err: service.ErrEmailTaken}
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, updater, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodPatch, "/profile", `{"email":"taken@unibo.it"}`, key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
}

func TestUpdateProfileHandler_RequiresAuthentication(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := httptest.NewRequest(http.MethodPatch, "/profile", strings.NewReader(`{"email":"new@unibo.it"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestChangePasswordHandler_ChangesAndReturnsNoContent(t *testing.T) {
	reader := &fakeProfileReader{email: "mario@unibo.it"}
	gw, key := gatewayWithProfileManagement(reader, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodPost, "/profile/password", `{"currentPassword":"old","newPassword":"new-s3cret!"}`, key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestChangePasswordHandler_WrongCurrentPasswordIs401(t *testing.T) {
	reader := &fakeProfileReader{email: "mario@unibo.it"}
	gw, key := gatewayWithProfileManagement(reader, &fakeProfileUpdater{}, &fakePasswordChanger{})
	gw.WithPasswordAuth(&fakeAuthenticator{err: service.ErrInvalidCredentials}, &fakeRegistrar{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodPost, "/profile/password", `{"currentPassword":"wrong","newPassword":"new-s3cret!"}`, key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestChangePasswordHandler_RejectsMissingBody(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodPost, "/profile/password", `{"currentPassword":"old"}`, key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestChangePasswordHandler_RequiresAuthentication(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := httptest.NewRequest(http.MethodPost, "/profile/password", strings.NewReader(`{"currentPassword":"old","newPassword":"new"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

// POST /refresh re-mints the session cookie with current memberships. The frontend
// calls it every 10 minutes against a 15-minute TTL, so a regression here logs
// every user out mid-session rather than failing loudly.
func TestRefreshHandler_ReMintsTheSessionCookie(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authedRequest(t, http.MethodPost, "/refresh", "", key))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	var session *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == api.CookieName {
			session = c
		}
	}
	if session == nil {
		t.Fatal("no session cookie set — the caller's token would expire on schedule")
	}
	if session.Value == "" || !session.HttpOnly || !session.Secure || session.SameSite != http.SameSiteLaxMode {
		t.Fatalf("got %+v, want a non-empty HttpOnly/Secure/Lax cookie", session)
	}
}

func TestRefreshHandler_RequiresAuthentication(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/refresh", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestUpdateProfileHandler_RejectsMalformedBody(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authedRequest(t, http.MethodPatch, "/profile", "{not json", key))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

// writeAuthError is the one place a service error becomes a status code, and each
// arm means something different to the caller. A missing account is a 404 they can
// act on; an unrecognised error is a 500 they cannot — collapsing them hides real
// failures behind "account not found".
func TestWriteAuthError_MapsEachServiceErrorToItsOwnStatus(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"user not found", service.ErrUserNotFound, http.StatusNotFound},
		{"keycloak unavailable", service.ErrKeycloakUnavailable, http.StatusServiceUnavailable},
		{"something unrecognised", errors.New("disk on fire"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gw, key := gatewayWithProfileManagement(&fakeProfileReader{err: tc.err}, &fakeProfileUpdater{}, &fakePasswordChanger{})
			r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, authedRequest(t, http.MethodGet, "/profile", "", key))

			if rec.Code != tc.want {
				t.Fatalf("got %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// ChangePassword talks to Keycloak three times and each failure means something
// different to the caller: a missing account is a 404, a wrong current password is
// a 401, and an unhealthy Keycloak is a 503 they should retry. Mapping any of them
// to 500 tells the user to give up on a request that would succeed a moment later.
func TestChangePasswordHandler_DistinguishesEachUpstreamFailure(t *testing.T) {
	cases := []struct {
		name    string
		reader  *fakeProfileReader
		changer *fakePasswordChanger
		want    int
	}{
		{"account gone", &fakeProfileReader{err: service.ErrUserNotFound}, &fakePasswordChanger{}, http.StatusNotFound},
		{"lookup failed", &fakeProfileReader{err: errors.New("connection refused")}, &fakePasswordChanger{}, http.StatusServiceUnavailable},
		{"reset failed", &fakeProfileReader{email: "mario@unibo.it"}, &fakePasswordChanger{err: errors.New("connection refused")}, http.StatusServiceUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gw, key := gatewayWithProfileManagement(tc.reader, &fakeProfileUpdater{}, tc.changer)
			r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, authedRequest(t, http.MethodPost, "/profile/password",
				`{"currentPassword":"old-pw","newPassword":"new-pw"}`, key))

			if rec.Code != tc.want {
				t.Fatalf("got %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// Refresh reaches tenancy for current memberships. If that fails the session must
// not be silently re-minted from stale claims — the caller would keep access they
// may no longer have.
func TestRefreshHandler_TenancyFailureIsReportedNotSilentlyReMinted(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	gw := service.New(&fakeVerifier{}, erroringTenancy{}, fakeSigner{}, time.Hour)
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authedRequest(t, http.MethodPost, "/refresh", "", key))

	if rec.Code == http.StatusNoContent {
		t.Fatal("got 204 — the session was re-minted despite tenancy failing")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == api.CookieName && c.Value != "" {
			t.Fatal("a session cookie was set despite the refresh failing")
		}
	}
}
