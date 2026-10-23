package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

const newcomer = "66666666-6666-6666-6666-666666666666"

func seedDomain(t *testing.T, r http.Handler, name, policy string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"name": name, "displayName": name, "joinPolicy": policy})
	if rec := do(r, signedInternalRequest(t, http.MethodPost, "/internal/domains", body)); rec.Code != http.StatusCreated {
		t.Fatalf("seed domain %s: got %d: %s", name, rec.Code, rec.Body.String())
	}
}

func rolesOf(t *testing.T, r http.Handler, accountID string) []string {
	t.Helper()
	rec := do(r, signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId="+accountID, nil))
	var ms []struct {
		Role string `json:"role"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &ms); err != nil {
		t.Fatalf("memberships body %q: %v", rec.Body.String(), err)
	}
	roles := make([]string, len(ms))
	for i, m := range ms {
		roles[i] = m.Role
	}
	return roles
}

var refusedRoles = []struct {
	name, role string
	want       int
}{
	{"admin", "admin", http.StatusForbidden},
	{"off the ladder", "owner", http.StatusBadRequest},
	{"empty", "", http.StatusBadRequest},
}

func TestJoinDomain_RefusesAnyRoleAboveStandardCustomer(t *testing.T) {
	for _, role := range []string{"admin", "business_admin", "business_staff"} {
		t.Run(role, func(t *testing.T) {
			r, _ := newTestServer(t)
			seedDomain(t, r, "unibo", "open-via-idp")

			rec := do(r, userRequest(t, http.MethodPost, "/domains/unibo/join", newcomer, nil, []byte(`{"role":"`+role+`"}`)))

			if rec.Code != http.StatusForbidden {
				t.Fatalf("got %d, want 403: %s", rec.Code, rec.Body.String())
			}
			if got := rolesOf(t, r, newcomer); len(got) != 0 {
				t.Fatalf("got memberships %v, want none", got)
			}
		})
	}
}

func TestJoinDomain_UnknownRoleIs400(t *testing.T) {
	r, _ := newTestServer(t)
	seedDomain(t, r, "unibo", "open-via-idp")

	rec := do(r, userRequest(t, http.MethodPost, "/domains/unibo/join", newcomer, nil, []byte(`{"role":"owner"}`)))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestJoinDomain_WithoutARoleJoinsAsStandardCustomer(t *testing.T) {
	r, _ := newTestServer(t)
	seedDomain(t, r, "unibo", "open-via-idp")

	rec := do(r, userRequest(t, http.MethodPost, "/domains/unibo/join", newcomer, nil, []byte(`{}`)))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, newcomer); len(got) != 1 || got[0] != "standard_customer" {
		t.Fatalf("got %v, want [standard_customer]", got)
	}
}

func TestInviteMember_RefusesARoleItMayNotGrant(t *testing.T) {
	for _, tc := range refusedRoles {
		t.Run(tc.name, func(t *testing.T) {
			r, _ := newTestServer(t)
			seedDomain(t, r, "acme", "invite-only")
			body := []byte(`{"accountId":"` + newcomer + `","role":"` + tc.role + `"}`)

			rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), body))

			if rec.Code != tc.want {
				t.Fatalf("got %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
			if got := rolesOf(t, r, newcomer); len(got) != 0 {
				t.Fatalf("got memberships %v, want none", got)
			}
		})
	}
}

func TestInviteMember_MayGrantItsOwnTier(t *testing.T) {
	r, _ := newTestServer(t)
	seedDomain(t, r, "acme", "invite-only")
	body := []byte(`{"accountId":"` + newcomer + `","role":"business_admin"}`)

	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), body))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, newcomer); len(got) != 1 || got[0] != "business_admin" {
		t.Fatalf("got %v, want [business_admin]", got)
	}
}

func TestCreateInviteCode_RefusesARoleItMayNotGrant(t *testing.T) {
	for _, tc := range refusedRoles {
		t.Run(tc.name, func(t *testing.T) {
			r, _ := newTestServer(t)
			seedDomain(t, r, "acme", "invite-only")

			rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite-codes", admin, adminOf("acme"), []byte(`{"role":"`+tc.role+`"}`)))

			if rec.Code != tc.want {
				t.Fatalf("got %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestInternalProvision_StillGrantsAdminFromTheIdentityProvider(t *testing.T) {
	r, _ := newTestServer(t)
	seedDomain(t, r, "unibo", "open-via-idp")
	body, _ := json.Marshal(map[string]string{"accountId": newcomer, "domainName": "unibo", "role": "admin"})

	rec := do(r, signedInternalRequest(t, http.MethodPost, "/internal/provision", body))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, newcomer); len(got) != 1 || got[0] != "admin" {
		t.Fatalf("got %v, want [admin]", got)
	}
}
