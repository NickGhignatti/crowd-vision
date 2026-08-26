package authcontracts

import "testing"

func TestCan_HigherOrEqualWeightPasses(t *testing.T) {
	if !Can("admin", "business_admin") {
		t.Fatal("admin should satisfy business_admin")
	}
	if !Can("business_admin", "business_admin") {
		t.Fatal("equal role weight should pass")
	}
}

func TestCan_LowerWeightDenied(t *testing.T) {
	if Can("standard_customer", "business_admin") {
		t.Fatal("standard_customer should not satisfy business_admin")
	}
}

func TestCan_UnknownRoleDenied(t *testing.T) {
	if Can("not-a-role", "standard_customer") {
		t.Fatal("an unrecognised role must never pass a check")
	}
}

func TestRoleWeights_MatchesKnownLadder(t *testing.T) {
	want := map[string]int{
		"admin":             100,
		"business_admin":    80,
		"business_staff":    60,
		"standard_customer": 10,
	}
	for role, weight := range want {
		if RoleWeights[role] != weight {
			t.Fatalf("RoleWeights[%q] = %d, want %d", role, RoleWeights[role], weight)
		}
	}
}

// The ladder is consulted twice — for the role the caller has and for the role the
// route requires — and only the first lookup was asserted. A required role that is
// not on the ladder is a typo in a call site, and it must deny: resolving an
// unknown requirement to weight 0 would let every caller through.
func TestCan_UnknownRequiredRoleDenied(t *testing.T) {
	if Can("business_admin", "not-a-role") {
		t.Fatal("an unrecognised required role must deny, not resolve to zero weight")
	}
	if Can("not-a-role", "also-not-a-role") {
		t.Fatal("two unrecognised roles must still deny")
	}
}
