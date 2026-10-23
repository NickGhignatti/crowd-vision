package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/store"
)

var refusedGrants = []struct {
	name, role string
	want       error
}{
	{"admin", "admin", service.ErrRoleNotGrantable},
	{"off the ladder", "owner", service.ErrUnknownRole},
	{"empty", "", service.ErrUnknownRole},
}

func TestInvite_RefusesARoleAboveBusinessAdmin(t *testing.T) {
	for _, tc := range refusedGrants {
		t.Run(tc.name, func(t *testing.T) {
			svc, _ := newSvc()
			ctx := context.Background()
			_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})

			err := svc.Invite(ctx, service.InviteInput{AccountID: "u2", DomainName: "acme", Role: tc.role})

			if !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
			if ms, _ := svc.MembershipsFor(ctx, "u2"); len(ms) != 0 {
				t.Fatalf("got memberships %+v, want none", ms)
			}
		})
	}
}

func TestInvite_MayGrantBusinessAdmin(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})

	if err := svc.Invite(ctx, service.InviteInput{AccountID: "u2", DomainName: "acme", Role: "business_admin"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ms, _ := svc.MembershipsFor(ctx, "u2"); len(ms) != 1 || ms[0].Role != "business_admin" {
		t.Fatalf("got %+v, want business_admin", ms)
	}
}

func TestCreateInviteCode_RefusesARoleAboveBusinessAdmin(t *testing.T) {
	for _, tc := range refusedGrants {
		t.Run(tc.name, func(t *testing.T) {
			svc, _ := newSvc()
			ctx := context.Background()
			_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})

			ic, err := svc.CreateInviteCode(ctx, service.CreateInviteCodeInput{DomainName: "acme", Role: tc.role})

			if !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
			if ic.Code != "" {
				t.Fatalf("got code %q, want none", ic.Code)
			}
		})
	}
}

func TestRedeemInviteCode_RefusesACodeMintedWithAdmin(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	d, _ := svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme"})
	_, _ = fake.CreateInviteCode(ctx, store.InviteCode{
		DomainID: d.ID, Code: "minted-before-the-fix", Role: "admin", ExpiresAt: time.Now().Add(time.Hour),
	})

	err := svc.RedeemInviteCode(ctx, "minted-before-the-fix", "u1")

	if !errors.Is(err, service.ErrRoleNotGrantable) {
		t.Fatalf("got %v, want ErrRoleNotGrantable", err)
	}
	if ms, _ := svc.MembershipsFor(ctx, "u1"); len(ms) != 0 {
		t.Fatalf("got memberships %+v, want none", ms)
	}
}

func TestSelfJoin_RefusesAnyRoleAboveStandardCustomer(t *testing.T) {
	cases := []struct {
		role string
		want error
	}{
		{"admin", service.ErrRoleNotGrantable},
		{"business_admin", service.ErrRoleNotGrantable},
		{"business_staff", service.ErrRoleNotGrantable},
		{"owner", service.ErrUnknownRole},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			svc, _ := newSvc()
			ctx := context.Background()
			_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})

			err := svc.SelfJoin(ctx, service.JoinInput{AccountID: "u1", DomainName: "unibo", Role: tc.role})

			if !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
			if ms, _ := svc.MembershipsFor(ctx, "u1"); len(ms) != 0 {
				t.Fatalf("got memberships %+v, want none", ms)
			}
		})
	}
}

func TestSelfJoin_WithoutARoleJoinsAsStandardCustomer(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})

	if err := svc.SelfJoin(ctx, service.JoinInput{AccountID: "u1", DomainName: "unibo"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ms, _ := svc.MembershipsFor(ctx, "u1"); len(ms) != 1 || ms[0].Role != "standard_customer" {
		t.Fatalf("got %+v, want standard_customer", ms)
	}
}

func TestSelfJoin_StillHonoursTheJoinPolicy(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "acme", DisplayName: "Acme", JoinPolicy: "invite-only"})

	err := svc.SelfJoin(ctx, service.JoinInput{AccountID: "u1", DomainName: "acme", Role: "standard_customer"})

	if !errors.Is(err, service.ErrInviteOnly) {
		t.Fatalf("got %v, want ErrInviteOnly", err)
	}
}

func TestJoin_StillGrantsAdminFromTheIdentityProvider(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})

	if err := svc.Join(ctx, service.JoinInput{AccountID: "owner", DomainName: "unibo", Role: "admin"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ms, _ := svc.MembershipsFor(ctx, "owner"); len(ms) != 1 || ms[0].Role != "admin" {
		t.Fatalf("got %+v, want admin", ms)
	}
}
