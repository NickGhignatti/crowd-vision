package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

type fakeProfileReader struct {
	email, name, picture string
	err                  error
	gotUserID            string
}

func (f *fakeProfileReader) GetUser(_ context.Context, userID string) (string, string, string, error) {
	f.gotUserID = userID
	return f.email, f.name, f.picture, f.err
}

type fakeProfileUpdater struct {
	err                          error
	gotUserID, gotEmail, gotName string
}

func (f *fakeProfileUpdater) UpdateUser(_ context.Context, userID, email, name string) error {
	f.gotUserID, f.gotEmail, f.gotName = userID, email, name
	return f.err
}

type fakePasswordChanger struct {
	err                    error
	gotUserID, gotPassword string
}

func (f *fakePasswordChanger) ResetPassword(_ context.Context, userID, newPassword string) error {
	f.gotUserID, f.gotPassword = userID, newPassword
	return f.err
}

func newGatewayWithProfileManagement(
	t *testing.T,
	reader service.ProfileReader,
	updater service.ProfileUpdater,
	changer service.PasswordChanger,
	auth service.PasswordAuthenticator,
) (*service.Gateway, *fakeSigner) {
	t.Helper()
	tenancy := &fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}}
	signer := &fakeSigner{}
	gw := service.New(&fakeVerifier{}, tenancy, signer, time.Hour)
	gw.WithPasswordAuth(auth, &fakeRegistrar{})
	return gw.WithProfileManagement(reader, updater, changer), signer
}

func TestProfile_ReturnsEmailNameAndPicture(t *testing.T) {
	reader := &fakeProfileReader{email: "mario@unibo.it", name: "Mario Rossi", picture: "https://lh3.googleusercontent.com/a/abc"}
	gw, _ := newGatewayWithProfileManagement(t, reader, &fakeProfileUpdater{}, &fakePasswordChanger{}, &fakeAuthenticator{})

	email, name, picture, err := gw.Profile(context.Background(), "acc-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if email != "mario@unibo.it" || name != "Mario Rossi" || picture != "https://lh3.googleusercontent.com/a/abc" {
		t.Fatalf("got (%q, %q, %q)", email, name, picture)
	}
	if reader.gotUserID != "acc-1" {
		t.Fatalf("got userID %q", reader.gotUserID)
	}
}

func TestUpdateProfile_DelegatesToUpdater(t *testing.T) {
	updater := &fakeProfileUpdater{}
	gw, _ := newGatewayWithProfileManagement(t, &fakeProfileReader{}, updater, &fakePasswordChanger{}, &fakeAuthenticator{})

	current := authcontracts.StandardClaims{Sub: "acc-1"}
	token, err := gw.UpdateProfile(context.Background(), current, "new@unibo.it", "Mario Rossi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token == "" {
		t.Fatal("expected a refreshed session token")
	}
	if updater.gotUserID != "acc-1" || updater.gotEmail != "new@unibo.it" || updater.gotName != "Mario Rossi" {
		t.Fatalf("got (%q, %q, %q)", updater.gotUserID, updater.gotEmail, updater.gotName)
	}
}

func TestUpdateProfile_PassesThroughEmailTaken(t *testing.T) {
	updater := &fakeProfileUpdater{err: service.ErrEmailTaken}
	gw, _ := newGatewayWithProfileManagement(t, &fakeProfileReader{}, updater, &fakePasswordChanger{}, &fakeAuthenticator{})

	_, err := gw.UpdateProfile(context.Background(), authcontracts.StandardClaims{Sub: "acc-1"}, "taken@unibo.it", "")
	if !errors.Is(err, service.ErrEmailTaken) {
		t.Fatalf("got %v, want ErrEmailTaken", err)
	}
}

func TestUpdateProfile_WrapsOtherFailuresAsKeycloakUnavailable(t *testing.T) {
	updater := &fakeProfileUpdater{err: errors.New("connection reset")}
	gw, _ := newGatewayWithProfileManagement(t, &fakeProfileReader{}, updater, &fakePasswordChanger{}, &fakeAuthenticator{})

	_, err := gw.UpdateProfile(context.Background(), authcontracts.StandardClaims{Sub: "acc-1"}, "new@unibo.it", "")
	if !errors.Is(err, service.ErrKeycloakUnavailable) {
		t.Fatalf("got %v, want ErrKeycloakUnavailable", err)
	}
}

// TestUpdateProfile_RefreshesTokenWithNewAccountName is the regression test
// for the bug where the NavBar kept showing a stale name after an edit: the
// session JWT bakes in AccountName at login time, and /me only re-serves
// that same cookie's claims (see api.meHandler) — nothing re-reads Keycloak
// on a page refresh. UpdateProfile must re-sign a token carrying the new
// name so the existing session picks it up immediately, not just Keycloak.
func TestUpdateProfile_RefreshesTokenWithNewAccountName(t *testing.T) {
	gw, signer := newGatewayWithProfileManagement(t, &fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{}, &fakeAuthenticator{})

	current := authcontracts.StandardClaims{
		Sub: "acc-1", AccountName: "Old Name", SID: "sid-1",
		Memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}},
	}
	if _, err := gw.UpdateProfile(context.Background(), current, "", "New Name"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if signer.lastClaims.AccountName != "New Name" {
		t.Fatalf("got AccountName %q, want New Name", signer.lastClaims.AccountName)
	}
	if signer.lastClaims.Sub != "acc-1" || signer.lastClaims.SID != "sid-1" || len(signer.lastClaims.Memberships) != 1 {
		t.Fatalf("expected Sub/SID/Memberships to be preserved, got %+v", signer.lastClaims)
	}
}

// TestUpdateProfile_KeepsExistingAccountNameWhenNameNotChanged covers the
// email-only edit: UpdateUser's contract treats an empty name as "leave
// firstName untouched" (see keycloakadmin.Client.UpdateUser), so the
// refreshed token must not blank out AccountName either.
func TestUpdateProfile_KeepsExistingAccountNameWhenNameNotChanged(t *testing.T) {
	gw, signer := newGatewayWithProfileManagement(t, &fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{}, &fakeAuthenticator{})

	current := authcontracts.StandardClaims{Sub: "acc-1", AccountName: "Existing Name"}
	if _, err := gw.UpdateProfile(context.Background(), current, "new@unibo.it", ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if signer.lastClaims.AccountName != "Existing Name" {
		t.Fatalf("got AccountName %q, want it unchanged", signer.lastClaims.AccountName)
	}
}

func TestChangePassword_VerifiesCurrentPasswordBeforeResetting(t *testing.T) {
	reader := &fakeProfileReader{email: "mario@unibo.it"}
	changer := &fakePasswordChanger{}
	auth := &fakeAuthenticator{idToken: "raw-id-token"}
	gw, _ := newGatewayWithProfileManagement(t, reader, &fakeProfileUpdater{}, changer, auth)

	err := gw.ChangePassword(context.Background(), "acc-1", "correct-current-password", "new-s3cret!")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if auth.gotUser != "mario@unibo.it" || auth.gotPass != "correct-current-password" {
		t.Fatalf("got authenticator call (%q, %q), want the account's looked-up email + current password", auth.gotUser, auth.gotPass)
	}
	if changer.gotUserID != "acc-1" || changer.gotPassword != "new-s3cret!" {
		t.Fatalf("got changer call (%q, %q)", changer.gotUserID, changer.gotPassword)
	}
}

func TestChangePassword_RejectsWrongCurrentPassword(t *testing.T) {
	reader := &fakeProfileReader{email: "mario@unibo.it"}
	changer := &fakePasswordChanger{}
	auth := &fakeAuthenticator{err: service.ErrInvalidCredentials}
	gw, _ := newGatewayWithProfileManagement(t, reader, &fakeProfileUpdater{}, changer, auth)

	err := gw.ChangePassword(context.Background(), "acc-1", "wrong-password", "new-s3cret!")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Fatalf("got %v, want ErrInvalidCredentials", err)
	}
	if changer.gotUserID != "" {
		t.Fatal("must not reset the password when the current password fails to verify")
	}
}

func TestChangePassword_DoesNotResetWhenProfileLookupFails(t *testing.T) {
	reader := &fakeProfileReader{err: errors.New("connection refused")}
	changer := &fakePasswordChanger{}
	auth := &fakeAuthenticator{idToken: "raw-id-token"}
	gw, _ := newGatewayWithProfileManagement(t, reader, &fakeProfileUpdater{}, changer, auth)

	err := gw.ChangePassword(context.Background(), "acc-1", "x", "new-s3cret!")
	if err == nil {
		t.Fatal("expected ChangePassword to fail when it can't look up the account's email")
	}
	if changer.gotUserID != "" {
		t.Fatal("must not reset the password when the profile lookup fails")
	}
}
