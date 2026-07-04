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
