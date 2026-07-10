package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

type fakeAuthenticator struct {
	idToken          string
	err              error
	gotUser, gotPass string
}

func (f *fakeAuthenticator) PasswordGrant(_ context.Context, username, password string) (string, error) {
	f.gotUser, f.gotPass = username, password
	return f.idToken, f.err
}

type fakeRegistrar struct {
	err                        error
	gotEmail, gotPass, gotName string
}

func (f *fakeRegistrar) CreateUser(_ context.Context, email, password, name string) error {
	f.gotEmail, f.gotPass, f.gotName = email, password, name
	return f.err
}

func newGatewayWithPasswordAuth(t *testing.T, verifier service.Verifier, auth service.PasswordAuthenticator, reg service.UserRegistrar) *service.Gateway {
	t.Helper()
	tenancy := &fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}}
	return service.New(verifier, tenancy, &fakeSigner{}, time.Hour).WithPasswordAuth(auth, reg)
}

func TestLogin_ExchangesPasswordGrantIDTokenLikeARedirectLogin(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("acc-1", "")}
	auth := &fakeAuthenticator{idToken: "raw-id-token"}
	gw := newGatewayWithPasswordAuth(t, verifier, auth, &fakeRegistrar{})

	tok, err := gw.Login(context.Background(), "mario@unibo.it", "correct-password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok == "" {
		t.Fatal("expected a signed token")
	}
	if auth.gotUser != "mario@unibo.it" || auth.gotPass != "correct-password" {
		t.Fatalf("got authenticator call (%q, %q)", auth.gotUser, auth.gotPass)
	}
}

func TestLogin_PassesThroughInvalidCredentials(t *testing.T) {
	auth := &fakeAuthenticator{err: service.ErrInvalidCredentials}
	gw := newGatewayWithPasswordAuth(t, &fakeVerifier{}, auth, &fakeRegistrar{})

	_, err := gw.Login(context.Background(), "mario@unibo.it", "wrong-password")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Fatalf("got %v, want ErrInvalidCredentials", err)
	}
}

func TestLogin_WrapsOtherAuthenticatorFailuresAsKeycloakUnavailable(t *testing.T) {
	auth := &fakeAuthenticator{err: errors.New("connection refused")}
	gw := newGatewayWithPasswordAuth(t, &fakeVerifier{}, auth, &fakeRegistrar{})

	_, err := gw.Login(context.Background(), "mario@unibo.it", "x")
	if !errors.Is(err, service.ErrKeycloakUnavailable) {
		t.Fatalf("got %v, want ErrKeycloakUnavailable (a system failure, not a rejected login)", err)
	}
}

func TestRegister_CreatesTheUserThenLogsIn(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("new-acc", "")}
	auth := &fakeAuthenticator{idToken: "raw-id-token"}
	reg := &fakeRegistrar{}
	gw := newGatewayWithPasswordAuth(t, verifier, auth, reg)

	tok, err := gw.Register(context.Background(), "new@unibo.it", "s3cret!", "Mario Rossi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok == "" {
		t.Fatal("expected a signed token from the login that follows registration")
	}
	if reg.gotEmail != "new@unibo.it" || reg.gotPass != "s3cret!" || reg.gotName != "Mario Rossi" {
		t.Fatalf("got registrar call (%q, %q, %q)", reg.gotEmail, reg.gotPass, reg.gotName)
	}
	if auth.gotUser != "new@unibo.it" {
		t.Fatalf("got authenticator username %q, want the newly registered email", auth.gotUser)
	}
}

func TestRegister_PassesThroughEmailTaken(t *testing.T) {
	reg := &fakeRegistrar{err: service.ErrEmailTaken}
	gw := newGatewayWithPasswordAuth(t, &fakeVerifier{}, &fakeAuthenticator{}, reg)

	_, err := gw.Register(context.Background(), "taken@unibo.it", "s3cret!", "Mario Rossi")
	if !errors.Is(err, service.ErrEmailTaken) {
		t.Fatalf("got %v, want ErrEmailTaken", err)
	}
}

func TestRegister_WrapsOtherRegistrarFailuresAsKeycloakUnavailable(t *testing.T) {
	reg := &fakeRegistrar{err: errors.New("connection reset")}
	gw := newGatewayWithPasswordAuth(t, &fakeVerifier{}, &fakeAuthenticator{}, reg)

	_, err := gw.Register(context.Background(), "new@unibo.it", "s3cret!", "Mario Rossi")
	if !errors.Is(err, service.ErrKeycloakUnavailable) {
		t.Fatalf("got %v, want ErrKeycloakUnavailable", err)
	}
}

func TestRegister_DoesNotLoginWhenUserCreationFails(t *testing.T) {
	auth := &fakeAuthenticator{idToken: "raw-id-token"}
	reg := &fakeRegistrar{err: service.ErrEmailTaken}
	gw := newGatewayWithPasswordAuth(t, &fakeVerifier{}, auth, reg)

	_, _ = gw.Register(context.Background(), "taken@unibo.it", "s3cret!", "Mario Rossi")
	if auth.gotUser != "" {
		t.Fatal("must not attempt a login when registration itself failed")
	}
}
