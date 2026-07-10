package authcontracts

import "testing"

func claims() StandardClaims {
	return StandardClaims{
		Sub:         "acc-1",
		AccountName: "mario",
		SID:         "sid-1",
		Memberships: []Membership{
			{Domain: "unibo", Role: "standard_customer"},
			{Domain: "acme", Role: "business_admin"},
		},
	}
}

func TestRoleIn_ReturnsRoleForKnownDomain(t *testing.T) {
	role, ok := claims().RoleIn("acme")
	if !ok || role != "business_admin" {
		t.Fatalf("got (%q, %v), want (business_admin, true)", role, ok)
	}
}

func TestRoleIn_FalseForUnknownDomain(t *testing.T) {
	if _, ok := claims().RoleIn("someone-elses-domain"); ok {
		t.Fatal("expected no membership for a foreign domain")
	}
}

func TestCanIn_ScopesTheCheckToTheDomain(t *testing.T) {
	c := claims()
	if !c.CanIn("acme", "business_admin") {
		t.Fatal("business_admin in acme should pass a business_admin check")
	}
	// admin in acme, but only standard_customer in unibo — the same person,
	// different tenants, different outcome. This is the whole point of
	// per-membership roles rather than a role on the user.
	if c.CanIn("unibo", "business_admin") {
		t.Fatal("standard_customer in unibo must not pass a business_admin check")
	}
}

func TestCanIn_DeniesDomainsNotInMemberships(t *testing.T) {
	if claims().CanIn("someone-elses-domain", "standard_customer") {
		t.Fatal("a non-member must never pass, regardless of required role")
	}
}

func TestTenants_ListsAllMemberDomains(t *testing.T) {
	got := claims().Tenants()
	want := []string{"unibo", "acme"}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %v, want %v", got, want)
	}
}
