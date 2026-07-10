package authcontracts

import (
	"encoding/json"
	"os"
	"testing"
)

// TestFixtureConforms asserts fixtures/standard-claims.json unmarshals cleanly
// into StandardClaims with every required field populated. This is the drift
// detector: any consumer (Go today, others later) asserts against the same
// fixture file, so a shape change that breaks a consumer fails here first,
// not in a production cookie.
func TestFixtureConforms(t *testing.T) {
	raw, err := os.ReadFile("fixtures/standard-claims.json")
	if err != nil {
		t.Fatalf("reading fixture: %v", err)
	}

	var claims StandardClaims
	if err := json.Unmarshal(raw, &claims); err != nil {
		t.Fatalf("fixture does not conform to StandardClaims: %v", err)
	}

	if claims.Sub == "" || claims.AccountName == "" || claims.SID == "" {
		t.Fatal("fixture is missing a required top-level field")
	}
	if len(claims.Memberships) == 0 {
		t.Fatal("fixture must carry at least one membership")
	}
	for _, m := range claims.Memberships {
		if m.Domain == "" || m.Role == "" {
			t.Fatal("fixture membership is missing domain or role")
		}
		if _, known := RoleWeights[m.Role]; !known {
			t.Fatalf("fixture uses role %q, not in RoleWeights", m.Role)
		}
	}
}
