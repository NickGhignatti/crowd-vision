package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

// --- fakes ---

type fakeVerifier struct {
	claims service.IDTokenClaims
	err    error
}

func (f *fakeVerifier) Verify(_ context.Context, _ string) (service.IDTokenClaims, error) {
	return f.claims, f.err
}

type fakeTenancy struct {
	memberships    []authcontracts.Membership
	lookupErr      error
	provisionErr   error
	provisionedReq *service.ProvisionRequest
}

func (f *fakeTenancy) MembershipsFor(_ context.Context, _ string) ([]authcontracts.Membership, error) {
	return f.memberships, f.lookupErr
}

func (f *fakeTenancy) Provision(_ context.Context, req service.ProvisionRequest) error {
	f.provisionedReq = &req
	return f.provisionErr
}

type fakeSigner struct {
	lastClaims authcontracts.StandardClaims
}

func (f *fakeSigner) Sign(claims authcontracts.StandardClaims, _ time.Duration) (string, error) {
	f.lastClaims = claims
	return "signed." + claims.Sub, nil
}

func kcClaims(sub, org string, roles ...string) service.IDTokenClaims {
	return service.IDTokenClaims{Sub: sub, PreferredUsername: sub, EmailVerified: true, Organization: org, Roles: roles}
}

// --- tests ---

func TestExchange_ExistingMember_SignsWithCurrentMemberships(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("acc-1", "")}
	tenancy := &fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}}
	signer := &fakeSigner{}
	gw := service.New(verifier, tenancy, signer, time.Hour)

	tok, err := gw.Exchange(context.Background(), "raw-id-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok == "" {
		t.Fatal("expected a signed token")
	}
	if len(signer.lastClaims.Memberships) != 1 || signer.lastClaims.Memberships[0].Domain != "unibo" {
		t.Fatalf("got %+v, want the existing unibo membership", signer.lastClaims.Memberships)
	}
}

func TestRefreshSession_ReMintsWithCurrentTenancyMemberships(t *testing.T) {
	// Caller's current claims have no memberships, but tenancy now reports one;
	// Refresh must re-sign with the fresh set while preserving identity fields.
	tenancy := &fakeTenancy{memberships: []authcontracts.Membership{{Domain: "kubeet.com", Role: "business_admin"}}}
	signer := &fakeSigner{}
	gw := service.New(&fakeVerifier{}, tenancy, signer, time.Hour)

	stale := authcontracts.StandardClaims{Sub: "acc-1", AccountName: "Ada", SID: "sid-1"}
	tok, err := gw.RefreshSession(context.Background(), stale)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok == "" {
		t.Fatal("expected a signed token")
	}
	if len(signer.lastClaims.Memberships) != 1 || signer.lastClaims.Memberships[0].Domain != "kubeet.com" {
		t.Fatalf("got %+v, want the new kubeet.com membership", signer.lastClaims.Memberships)
	}
	if signer.lastClaims.Sub != "acc-1" || signer.lastClaims.AccountName != "Ada" {
		t.Fatalf("identity fields not preserved: %+v", signer.lastClaims)
	}
}

func TestRefreshSession_FailsClosed_WhenTenancyLookupErrors(t *testing.T) {
	tenancy := &fakeTenancy{lookupErr: errors.New("connection refused")}
	gw := service.New(&fakeVerifier{}, tenancy, &fakeSigner{}, time.Hour)

	_, err := gw.RefreshSession(context.Background(), authcontracts.StandardClaims{Sub: "acc-1"})
	if !errors.Is(err, service.ErrTenancyUnavailable) {
		t.Fatalf("got %v, want ErrTenancyUnavailable", err)
	}
}

func TestExchange_PrefersNameOverPreferredUsernameForAccountName(t *testing.T) {
	verifier := &fakeVerifier{claims: service.IDTokenClaims{Sub: "acc-1", PreferredUsername: "mario@unibo.it", Name: "Mario Rossi"}}
	tenancy := &fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}}
	signer := &fakeSigner{}
	gw := service.New(verifier, tenancy, signer, time.Hour)

	if _, err := gw.Exchange(context.Background(), "raw-id-token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if signer.lastClaims.AccountName != "Mario Rossi" {
		t.Fatalf("got AccountName %q, want the display name over the bare username", signer.lastClaims.AccountName)
	}
}

func TestExchange_FallsBackToPreferredUsername_WhenNameIsAbsent(t *testing.T) {
	verifier := &fakeVerifier{claims: service.IDTokenClaims{Sub: "acc-1", PreferredUsername: "mario@unibo.it"}}
	tenancy := &fakeTenancy{memberships: []authcontracts.Membership{{Domain: "unibo", Role: "standard_customer"}}}
	signer := &fakeSigner{}
	gw := service.New(verifier, tenancy, signer, time.Hour)

	if _, err := gw.Exchange(context.Background(), "raw-id-token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if signer.lastClaims.AccountName != "mario@unibo.it" {
		t.Fatalf("got AccountName %q, want the fallback username (no display name set yet)", signer.lastClaims.AccountName)
	}
}

func TestExchange_FailsClosed_WhenTenancyLookupErrors(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("acc-1", "")}
	tenancy := &fakeTenancy{lookupErr: errors.New("connection refused")}
	gw := service.New(verifier, tenancy, &fakeSigner{}, time.Hour)

	_, err := gw.Exchange(context.Background(), "raw-id-token")
	if !errors.Is(err, service.ErrTenancyUnavailable) {
		t.Fatalf("got %v, want ErrTenancyUnavailable (login must be denied, not degraded)", err)
	}
}

func TestExchange_RejectsInvalidIDToken(t *testing.T) {
	verifier := &fakeVerifier{err: errors.New("signature verification failed")}
	gw := service.New(verifier, &fakeTenancy{}, &fakeSigner{}, time.Hour)

	_, err := gw.Exchange(context.Background(), "garbage")
	if !errors.Is(err, service.ErrInvalidIDToken) {
		t.Fatalf("got %v, want ErrInvalidIDToken", err)
	}
}

func TestExchange_FirstLogin_ProvisionsFromOrganizationClaim(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("new-user", "unibo", "standard_customer")}
	tenancy := &fakeTenancy{memberships: nil} // brand-new account: zero memberships
	signer := &fakeSigner{}
	gw := service.New(verifier, tenancy, signer, time.Hour)

	_, err := gw.Exchange(context.Background(), "raw-id-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if tenancy.provisionedReq == nil {
		t.Fatal("expected a provision call for a brand-new user with an organization claim")
	}
	if tenancy.provisionedReq.DomainName != "unibo" || tenancy.provisionedReq.AccountID != "new-user" {
		t.Fatalf("got %+v", tenancy.provisionedReq)
	}
	if len(signer.lastClaims.Memberships) != 1 || signer.lastClaims.Memberships[0].Domain != "unibo" {
		t.Fatalf("got %+v, want the newly provisioned membership reflected in the signed token", signer.lastClaims.Memberships)
	}
}

func TestExchange_FirstLogin_NoOrganizationClaim_StaysEmpty(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("new-user", "")} // no org — e.g. pooled self-signup
	tenancy := &fakeTenancy{memberships: nil}
	signer := &fakeSigner{}
	gw := service.New(verifier, tenancy, signer, time.Hour)

	_, err := gw.Exchange(context.Background(), "raw-id-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tenancy.provisionedReq != nil {
		t.Fatal("must not attempt to provision a membership with no organization claim")
	}
	if len(signer.lastClaims.Memberships) != 0 {
		t.Fatalf("got %+v, want zero memberships (a valid state)", signer.lastClaims.Memberships)
	}
}

func TestExchange_FirstLogin_InviteOnlyDomain_ContinuesWithoutMembership(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("new-user", "acme", "standard_customer")}
	tenancy := &fakeTenancy{memberships: nil, provisionErr: service.ErrInviteOnly}
	signer := &fakeSigner{}
	gw := service.New(verifier, tenancy, signer, time.Hour)

	tok, err := gw.Exchange(context.Background(), "raw-id-token")
	if err != nil {
		t.Fatalf("an invite-only domain must not fail the whole login: %v", err)
	}
	if tok == "" {
		t.Fatal("expected a signed token even without the membership")
	}
	if len(signer.lastClaims.Memberships) != 0 {
		t.Fatalf("got %+v, want zero memberships (JIT was correctly refused)", signer.lastClaims.Memberships)
	}
}

func TestExchange_ProvisionSystemFailure_FailsClosed(t *testing.T) {
	verifier := &fakeVerifier{claims: kcClaims("new-user", "unibo", "standard_customer")}
	tenancy := &fakeTenancy{memberships: nil, provisionErr: errors.New("connection reset")}
	gw := service.New(verifier, tenancy, &fakeSigner{}, time.Hour)

	_, err := gw.Exchange(context.Background(), "raw-id-token")
	if !errors.Is(err, service.ErrTenancyUnavailable) {
		t.Fatalf("got %v, want ErrTenancyUnavailable for a genuine system failure (not policy refusal)", err)
	}
}

func TestHighestRole_PicksTheStrongestRecognizedRole(t *testing.T) {
	got := service.HighestRole([]string{"offline_access", "business_admin", "default-roles-crowdvision", "uma_authorization"})
	if got != "business_admin" {
		t.Fatalf("got %q, want business_admin (unrecognised Keycloak default roles must be ignored)", got)
	}
}

func TestHighestRole_DefaultsToStandardCustomer(t *testing.T) {
	got := service.HighestRole([]string{"offline_access", "uma_authorization"})
	if got != "standard_customer" {
		t.Fatalf("got %q, want standard_customer (the floor role when nothing else matches)", got)
	}
}
