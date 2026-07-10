package api_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
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

// gatewayWithProfileManagement builds a Gateway with both the password-auth
// and profile-management dependencies wired, and a real signing key so /me
// -style authenticated routes can be exercised with a genuine JWT (the fake
// non-cryptographic signer used elsewhere can't be verified).
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

// TestUpdateProfileHandler_RefreshesTheSessionCookie is the regression test
// for the stale-NavBar-name bug: a successful profile update must set a new
// session cookie (see service.Gateway.UpdateProfile), not just 204 with the
// old one left in place — otherwise /me keeps re-serving the pre-edit name
// until the caller's next full login.
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
