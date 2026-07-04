package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/store"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/storefake"
)

func newSvc() (*service.Service, *storefake.Fake) {
	fake := storefake.New()
	return service.New(fake), fake
}

func TestCreateDomain_DefaultsToInviteOnly(t *testing.T) {
	svc, _ := newSvc()
	d, err := svc.CreateDomain(context.Background(), service.CreateDomainInput{
		Name: "acme", DisplayName: "Acme Inc",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.JoinPolicy != "invite-only" {
		t.Fatalf("got join policy %q, want invite-only", d.JoinPolicy)
	}
}

func TestCreateDomain_IsIdempotent(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	in := service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"}

	first, err := svc.CreateDomain(ctx, in)
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	// Simulates the provisioner retrying after a crash between creating the
	// domain and marking the organization ready — must not error.
	second, err := svc.CreateDomain(ctx, in)
	if err != nil {
		t.Fatalf("second create (retry) should not error: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("got a different domain on retry: %q vs %q", first.ID, second.ID)
	}
}

func TestCreateOwnDomain_CreatorBecomesBusinessAdmin(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()

	d, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "creator-1", Name: "acme", DisplayName: "Acme Inc",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.JoinPolicy != "invite-only" {
		t.Fatalf("got join policy %q, want invite-only default", d.JoinPolicy)
	}

	ms, err := svc.MembershipsFor(ctx, "creator-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ms) != 1 || ms[0].Domain != "acme" || ms[0].Role != "business_admin" {
		t.Fatalf("got %+v, want creator as business_admin of acme", ms)
	}
}

// A self-created domain colliding with an existing name must be a hard
// conflict, never the CreateDomain idempotency behaviour — otherwise any
// authenticated user could "create" an existing organization's domain and
// silently become its business_admin.
func TestCreateOwnDomain_RejectsExistingName(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{AccountID: "u1", Name: "acme", DisplayName: "Acme"})
	if err != nil {
		t.Fatalf("first create: %v", err)
	}

	_, err = svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{AccountID: "attacker", Name: "acme", DisplayName: "Not Acme"})
	if !errors.Is(err, service.ErrDomainNameTaken) {
		t.Fatalf("got %v, want ErrDomainNameTaken", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "attacker")
	if len(ms) != 0 {
		t.Fatalf("attacker must not gain membership in the existing domain: %+v", ms)
	}
}

func TestCreateSubdomain_NestsUnderTheParent(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	parent, _ := svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})

	sub, err := svc.CreateSubdomain(ctx, service.CreateSubdomainInput{
		ParentDomainName: "acme", Name: "acme-engineering", DisplayName: "Acme Engineering",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sub.ParentID != parent.ID {
		t.Fatalf("got parent id %q, want %q", sub.ParentID, parent.ID)
	}
}

func TestCreateSubdomain_UnknownParentIsNotFound(t *testing.T) {
	svc, _ := newSvc()
	_, err := svc.CreateSubdomain(context.Background(), service.CreateSubdomainInput{
		ParentDomainName: "ghost", Name: "sub", DisplayName: "Sub",
	})
	if !errors.Is(err, service.ErrDomainNotFound) {
		t.Fatalf("got %v, want ErrDomainNotFound", err)
	}
}

func TestCreateSubdomain_RejectsExistingName(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "taken", DisplayName: "Taken"})

	_, err := svc.CreateSubdomain(ctx, service.CreateSubdomainInput{
		ParentDomainName: "acme", Name: "taken", DisplayName: "Collides",
	})
	if !errors.Is(err, service.ErrDomainNameTaken) {
		t.Fatalf("got %v, want ErrDomainNameTaken", err)
	}
}

func TestListSubdomains_ReturnsOnlyDirectChildren(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "globex", DisplayName: "Globex"})
	_, err := svc.CreateSubdomain(ctx, service.CreateSubdomainInput{ParentDomainName: "acme", Name: "acme-eng", DisplayName: "Eng"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	subs, err := svc.ListSubdomains(ctx, "acme")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(subs) != 1 || subs[0].Name != "acme-eng" {
		t.Fatalf("got %+v, want only acme-eng", subs)
	}

	none, err := svc.ListSubdomains(ctx, "globex")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("got %+v, want no subdomains for globex", none)
	}
}

func TestCreateInviteCode_GeneratesARedeemableCode(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})

	ic, err := svc.CreateInviteCode(ctx, service.CreateInviteCodeInput{
		DomainName: "acme", Role: "business_staff", CreatedBy: "admin-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ic.Code == "" {
		t.Fatal("expected a non-empty code")
	}
	if ic.ExpiresAt.Before(time.Now()) {
		t.Fatal("expected a future expiry")
	}
}

func TestCreateInviteCode_UnknownDomainIsNotFound(t *testing.T) {
	svc, _ := newSvc()
	_, err := svc.CreateInviteCode(context.Background(), service.CreateInviteCodeInput{
		DomainName: "ghost", Role: "business_staff", CreatedBy: "admin-1",
	})
	if !errors.Is(err, service.ErrDomainNotFound) {
		t.Fatalf("got %v, want ErrDomainNotFound", err)
	}
}

func TestRedeemInviteCode_GrantsTheStatedRole(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	ic, _ := svc.CreateInviteCode(ctx, service.CreateInviteCodeInput{DomainName: "acme", Role: "business_staff", CreatedBy: "admin-1"})

	if err := svc.RedeemInviteCode(ctx, ic.Code, "new-hire"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "new-hire")
	if len(ms) != 1 || ms[0].Domain != "acme" || ms[0].Role != "business_staff" {
		t.Fatalf("got %+v", ms)
	}
}

func TestRedeemInviteCode_CannotBeRedeemedTwice(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	ic, _ := svc.CreateInviteCode(ctx, service.CreateInviteCodeInput{DomainName: "acme", Role: "business_staff", CreatedBy: "admin-1"})

	if err := svc.RedeemInviteCode(ctx, ic.Code, "first"); err != nil {
		t.Fatalf("first redemption: %v", err)
	}
	err := svc.RedeemInviteCode(ctx, ic.Code, "second")
	if !errors.Is(err, service.ErrInviteCodeInvalid) {
		t.Fatalf("got %v, want ErrInviteCodeInvalid on the second redemption", err)
	}
}

func TestRedeemInviteCode_RejectsExpiredCode(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	ic, _ := svc.CreateInviteCode(ctx, service.CreateInviteCodeInput{DomainName: "acme", Role: "business_staff", CreatedBy: "admin-1"})
	fake.ExpireInviteCodeForTests(ic.Code)

	err := svc.RedeemInviteCode(ctx, ic.Code, "too-late")
	if !errors.Is(err, service.ErrInviteCodeInvalid) {
		t.Fatalf("got %v, want ErrInviteCodeInvalid for an expired code", err)
	}
}

func TestRedeemInviteCode_UnknownCodeIsInvalid(t *testing.T) {
	svc, _ := newSvc()
	err := svc.RedeemInviteCode(context.Background(), "not-a-real-code", "someone")
	if !errors.Is(err, service.ErrInviteCodeInvalid) {
		t.Fatalf("got %v, want ErrInviteCodeInvalid", err)
	}
}

func TestJoin_DeniedWhenDomainIsInviteOnly(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})

	err := svc.Join(ctx, service.JoinInput{AccountID: "u1", DomainName: "acme", Role: "standard_customer"})
	if !errors.Is(err, service.ErrInviteOnly) {
		t.Fatalf("got %v, want ErrInviteOnly", err)
	}
}

func TestJoin_AllowedWhenDomainIsOpenViaIdP(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})

	err := svc.Join(ctx, service.JoinInput{
		AccountID: "u1", DomainName: "unibo", Role: "standard_customer", ExternalID: "eppn:mario@unibo.it",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ms, err := svc.MembershipsFor(ctx, "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ms) != 1 || ms[0].Domain != "unibo" || ms[0].Role != "standard_customer" {
		t.Fatalf("got %+v, want one unibo/standard_customer membership", ms)
	}
}

func TestJoin_UnknownDomainIsNotFound(t *testing.T) {
	svc, _ := newSvc()
	err := svc.Join(context.Background(), service.JoinInput{AccountID: "u1", DomainName: "ghost", Role: "standard_customer"})
	if !errors.Is(err, service.ErrDomainNotFound) {
		t.Fatalf("got %v, want ErrDomainNotFound", err)
	}
}

func TestJoin_IsIdempotent(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})

	in := service.JoinInput{AccountID: "u1", DomainName: "unibo", Role: "standard_customer"}
	if err := svc.Join(ctx, in); err != nil {
		t.Fatalf("first join: %v", err)
	}
	if err := svc.Join(ctx, in); err != nil {
		t.Fatalf("second join (retry) should not error: %v", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "u1")
	if len(ms) != 1 {
		t.Fatalf("got %d memberships, want exactly 1 (no duplicate row)", len(ms))
	}
}

func TestInvite_BypassesJoinPolicy(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})

	err := svc.Invite(ctx, service.InviteInput{AccountID: "u2", DomainName: "acme", Role: "business_staff"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "u2")
	if len(ms) != 1 || ms[0].Role != "business_staff" {
		t.Fatalf("got %+v, want one business_staff membership", ms)
	}
}

func TestJoin_RecordsJoinedViaSelfIdP(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	_ = svc.Join(ctx, service.JoinInput{AccountID: "u1", DomainName: "unibo", Role: "standard_customer"})

	ms, _ := fake.MembershipsFor(ctx, "u1")
	if len(ms) != 1 || ms[0].JoinedVia != "self-idp" {
		t.Fatalf("got %+v, want joined_via=self-idp", ms)
	}
}

func TestInvite_RecordsJoinedViaInvite(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	_ = svc.Invite(ctx, service.InviteInput{AccountID: "u2", DomainName: "acme", Role: "business_staff"})

	ms, _ := fake.MembershipsFor(ctx, "u2")
	if len(ms) != 1 || ms[0].JoinedVia != "invite" {
		t.Fatalf("got %+v, want joined_via=invite", ms)
	}
}

func TestMembershipsFor_EmptyForNewAccount(t *testing.T) {
	svc, _ := newSvc()
	ms, err := svc.MembershipsFor(context.Background(), "brand-new")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ms) != 0 {
		t.Fatalf("got %d memberships, want 0 (zero memberships is a valid state)", len(ms))
	}
}

func TestLeave_RemovesOnlyThatMembership(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	_ = svc.Invite(ctx, service.InviteInput{AccountID: "u1", DomainName: "acme", Role: "business_staff"})
	_ = svc.Join(ctx, service.JoinInput{AccountID: "u1", DomainName: "unibo", Role: "standard_customer"})

	if err := svc.Leave(ctx, "u1", "acme"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "u1")
	if len(ms) != 1 || ms[0].Domain != "unibo" {
		t.Fatalf("got %+v, want only the unibo membership left", ms)
	}
}

func TestReapAccount_RemovesEveryMembership(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	_ = svc.Invite(ctx, service.InviteInput{AccountID: "gone", DomainName: "acme", Role: "business_staff"})
	_ = svc.Join(ctx, service.JoinInput{AccountID: "gone", DomainName: "unibo", Role: "standard_customer"})

	if err := svc.ReapAccount(ctx, "gone"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "gone")
	if len(ms) != 0 {
		t.Fatalf("got %d memberships, want 0 after reaping", len(ms))
	}
}

func TestReapAccount_IsIdempotent(t *testing.T) {
	svc, _ := newSvc()
	// Reaping an account with no memberships (e.g. a redelivered event after
	// the first delivery already succeeded) must not error.
	if err := svc.ReapAccount(context.Background(), "never-existed"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateOwnDomain_PublicDomainDefaultsToOpenViaIdP(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()

	d, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "creator-1", Name: "unibo", DisplayName: "UniBO", IsPublic: true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.JoinPolicy != "open-via-idp" {
		t.Fatalf("got join policy %q, want open-via-idp default for a public domain", d.JoinPolicy)
	}
	if !d.IsPublic {
		t.Fatal("expected IsPublic to be persisted")
	}
}

func TestCreateOwnDomain_PublicDomainRespectsExplicitJoinPolicy(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()

	// A public domain can still choose to stay invite-only for joining —
	// visibility and joinability are different axes.
	d, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "creator-1", Name: "acme", DisplayName: "Acme", IsPublic: true, JoinPolicy: "invite-only",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.JoinPolicy != "invite-only" {
		t.Fatalf("got join policy %q, want the explicitly requested invite-only", d.JoinPolicy)
	}
}

func TestCreateOwnDomain_PrivateDomainStillDefaultsToInviteOnly(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()

	d, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "creator-1", Name: "acme", DisplayName: "Acme",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.JoinPolicy != "invite-only" || d.IsPublic {
		t.Fatalf("got %+v, want private/invite-only defaults", d)
	}
}

func TestPublicDomains_OnlyListsPublicDomainsWithMemberCounts(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()

	_, _ = svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{AccountID: "u1", Name: "unibo", DisplayName: "UniBO", IsPublic: true})
	_, _ = svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{AccountID: "u2", Name: "acme", DisplayName: "Acme"})
	_ = svc.Join(ctx, service.JoinInput{AccountID: "u3", DomainName: "unibo", Role: "standard_customer"})

	domains, err := svc.PublicDomains(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(domains) != 1 || domains[0].Name != "unibo" {
		t.Fatalf("got %+v, want only the public unibo domain", domains)
	}
	if domains[0].MemberCount != 2 {
		t.Fatalf("got member count %d, want 2 (creator + joiner)", domains[0].MemberCount)
	}
}

func TestLeave_LastAdminIsBlocked(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	// The creator is the sole business_admin.
	if _, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "admin-1", Name: "acme", DisplayName: "Acme",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	err := svc.Leave(ctx, "admin-1", "acme")
	if !errors.Is(err, service.ErrLastAdminCannotLeave) {
		t.Fatalf("got %v, want ErrLastAdminCannotLeave", err)
	}
	// The blocked admin must still be a member.
	if ms, _ := svc.MembershipsFor(ctx, "admin-1"); len(ms) != 1 {
		t.Fatalf("last admin should not have been removed, got %+v", ms)
	}
}

func TestLeave_AdminWithCoAdminIsAllowed(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	d, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "admin-1", Name: "acme", DisplayName: "Acme",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// A second admin exists, so the domain keeps an admin after admin-1 leaves.
	_ = fake.UpsertMembership(ctx, store.Membership{
		AccountID: "admin-2", DomainID: d.ID, DomainName: d.Name, Role: "business_admin",
	})

	if err := svc.Leave(ctx, "admin-1", "acme"); err != nil {
		t.Fatalf("an admin with a co-admin should be able to leave: %v", err)
	}
	if ms, _ := svc.MembershipsFor(ctx, "admin-1"); len(ms) != 0 {
		t.Fatalf("admin-1 should have been removed, got %+v", ms)
	}
}

func TestLeave_NonAdminIsAllowed(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	d, err := svc.CreateOwnDomain(ctx, service.CreateOwnDomainInput{
		AccountID: "admin-1", Name: "acme", DisplayName: "Acme",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// A non-admin member leaves even though admin-1 is the only admin.
	_ = fake.UpsertMembership(ctx, store.Membership{
		AccountID: "member-2", DomainID: d.ID, DomainName: d.Name, Role: "standard_customer",
	})

	if err := svc.Leave(ctx, "member-2", "acme"); err != nil {
		t.Fatalf("a non-admin should be able to leave: %v", err)
	}
	if ms, _ := svc.MembershipsFor(ctx, "member-2"); len(ms) != 0 {
		t.Fatalf("member-2 should have been removed, got %+v", ms)
	}
}
