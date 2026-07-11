package authpolicy_test

import (
	"encoding/json"
	"os"
	"testing"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	authpolicy "github.com/NickGhignatti/crowd-vision/server/auth-policy"
)

type conformanceCase struct {
	Name        string                     `json:"name"`
	Memberships []authcontracts.Membership `json:"memberships"`
	Action      string                     `json:"action"`
	Domain      string                     `json:"domain"`
	Context     map[string]int64           `json:"context"`
	Expected    string                     `json:"expected"`
}

type conformanceFile struct {
	Cases []conformanceCase `json:"cases"`
}

// TestConformance runs the golden fixture shared with every other language
// binding through the real cedar-go engine — the identical-outcomes
// guarantee that justifies having one shared policy bundle at all.
func TestConformance(t *testing.T) {
	raw, err := os.ReadFile("fixtures/conformance.json")
	if err != nil {
		t.Fatalf("reading fixtures/conformance.json: %v", err)
	}
	var f conformanceFile
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parsing fixtures/conformance.json: %v", err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("conformance.json has no cases")
	}

	for _, tc := range f.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			var got bool
			switch tc.Action {
			case "Read":
				got = authpolicy.CanRead(tc.Memberships, tc.Domain)
			case "ReadWithAdminBypass":
				got = authpolicy.CanReadWithAdminBypass(tc.Memberships, tc.Domain)
			case "Edit":
				got = authpolicy.CanEdit(tc.Memberships, tc.Domain)
			case "ManageDomain":
				got = authpolicy.CanManageDomain(tc.Memberships, tc.Domain)
			case "ModelOverride":
				got = authpolicy.CanOverrideModelWeight(tc.Memberships, tc.Context["requiredWeight"])
			default:
				t.Fatalf("unknown action %q in fixture", tc.Action)
			}

			want := tc.Expected == "allow"
			if got != want {
				t.Errorf("%s: got allow=%v, want allow=%v", tc.Name, got, want)
			}
		})
	}
}
