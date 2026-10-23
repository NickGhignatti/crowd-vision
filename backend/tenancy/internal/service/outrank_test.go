package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/store"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/storefake"
)

func acmeMembers(t *testing.T, members map[string]string) (*service.Service, *storefake.Fake) {
	t.Helper()
	svc, fake := newSvc()
	ctx := context.Background()
	d, err := svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	if err != nil {
		t.Fatalf("domain: %v", err)
	}
	for id, role := range members {
		m := store.Membership{AccountID: id, DomainID: d.ID, DomainName: d.Name, Role: role, JoinedVia: "invite"}
		if err := fake.UpsertMembership(ctx, m); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}
	return svc, fake
}

func roleOf(t *testing.T, svc *service.Service, accountID string) string {
	t.Helper()
	ms, _ := svc.MembershipsFor(context.Background(), accountID)
	if len(ms) == 0 {
		return ""
	}
	return ms[0].Role
}

func TestInvite_CannotChangeAMemberWhoOutranksTheActor(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"owner": "admin", "bob": "business_admin"})

	err := svc.Invite(context.Background(), service.InviteInput{
		AccountID: "owner", DomainName: "acme", Role: "standard_customer", ActorRole: "business_admin",
	})

	if !errors.Is(err, service.ErrMemberOutranksActor) {
		t.Fatalf("got %v, want ErrMemberOutranksActor", err)
	}
	if got := roleOf(t, svc, "owner"); got != "admin" {
		t.Fatalf("got role %q, want admin untouched", got)
	}
}

func TestInvite_MayChangeAPeerOrSomeoneBelow(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"bob": "business_admin", "peer": "business_admin", "low": "standard_customer"})
	ctx := context.Background()

	for _, id := range []string{"peer", "low"} {
		err := svc.Invite(ctx, service.InviteInput{AccountID: id, DomainName: "acme", Role: "business_staff", ActorRole: "business_admin"})
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", id, err)
		}
		if got := roleOf(t, svc, id); got != "business_staff" {
			t.Fatalf("%s: got role %q, want business_staff", id, got)
		}
	}
}

func TestInvite_AMembershipAbsentFromTheDomainIsNotOutranking(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"bob": "business_admin"})

	err := svc.Invite(context.Background(), service.InviteInput{
		AccountID: "newcomer", DomainName: "acme", Role: "standard_customer", ActorRole: "business_admin",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestInvite_TheLastManagerCannotLowerThemselves(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"bob": "business_admin"})

	err := svc.Invite(context.Background(), service.InviteInput{
		AccountID: "bob", DomainName: "acme", Role: "standard_customer", ActorRole: "business_admin",
	})

	if !errors.Is(err, service.ErrLastAdminCannotLeave) {
		t.Fatalf("got %v, want ErrLastAdminCannotLeave", err)
	}
	if got := roleOf(t, svc, "bob"); got != "business_admin" {
		t.Fatalf("got role %q, want business_admin untouched", got)
	}
}

func TestInvite_AManagerMayLowerThemselvesWhileAnotherRemains(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"bob": "business_admin", "peer": "business_admin"})

	err := svc.Invite(context.Background(), service.InviteInput{
		AccountID: "bob", DomainName: "acme", Role: "business_staff", ActorRole: "business_admin",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRemove_CannotRemoveAMemberWhoOutranksTheActor(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"owner": "admin", "bob": "business_admin"})

	err := svc.Remove(context.Background(), "business_admin", "owner", "acme")

	if !errors.Is(err, service.ErrMemberOutranksActor) {
		t.Fatalf("got %v, want ErrMemberOutranksActor", err)
	}
	if got := roleOf(t, svc, "owner"); got != "admin" {
		t.Fatalf("got role %q, want the admin still a member", got)
	}
}

func TestRemove_MayRemoveAPeerOrSomeoneBelow(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"bob": "business_admin", "peer": "business_admin", "low": "standard_customer"})
	ctx := context.Background()

	for _, id := range []string{"peer", "low"} {
		if err := svc.Remove(ctx, "business_admin", id, "acme"); err != nil {
			t.Fatalf("%s: unexpected error: %v", id, err)
		}
		if got := roleOf(t, svc, id); got != "" {
			t.Fatalf("%s: got role %q, want removed", id, got)
		}
	}
}

func TestRemove_StillKeepsTheLastManager(t *testing.T) {
	svc, _ := acmeMembers(t, map[string]string{"bob": "business_admin"})

	err := svc.Remove(context.Background(), "admin", "bob", "acme")

	if !errors.Is(err, service.ErrLastAdminCannotLeave) {
		t.Fatalf("got %v, want ErrLastAdminCannotLeave", err)
	}
}

func TestRemove_UnknownDomainIsNotFound(t *testing.T) {
	svc, _ := newSvc()

	err := svc.Remove(context.Background(), "business_admin", "someone", "ghost")

	if !errors.Is(err, service.ErrDomainNotFound) {
		t.Fatalf("got %v, want ErrDomainNotFound", err)
	}
}
