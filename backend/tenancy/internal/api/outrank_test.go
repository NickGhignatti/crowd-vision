package api_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/store"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/storefake"
)

const (
	owner = "77777777-7777-7777-7777-777777777777"
	peer  = "88888888-8888-8888-8888-888888888888"
	staff = "99999999-9999-9999-9999-999999999999"
)

// acmeWith seeds acme with the caller (the manager) plus the given members.
func acmeWith(t *testing.T, members map[string]string) (http.Handler, *storefake.Fake) {
	t.Helper()
	r, fake := newTestServer(t)
	seedDomain(t, r, "acme", "invite-only")
	d, err := fake.DomainByName(context.Background(), "acme")
	if err != nil {
		t.Fatalf("acme: %v", err)
	}
	members[admin] = "business_admin"
	for id, role := range members {
		m := store.Membership{AccountID: id, DomainID: d.ID, DomainName: d.Name, Role: role, JoinedVia: "invite"}
		if err := fake.UpsertMembership(context.Background(), m); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}
	return r, fake
}

func TestInviteMember_CannotChangeAMemberWhoOutranksIt(t *testing.T) {
	r, _ := acmeWith(t, map[string]string{owner: "admin"})
	body := []byte(`{"accountId":"` + owner + `","role":"standard_customer"}`)

	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), body))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, owner); len(got) != 1 || got[0] != "admin" {
		t.Fatalf("got %v, want [admin] untouched", got)
	}
}

func TestInviteMember_MayChangeAPeer(t *testing.T) {
	r, _ := acmeWith(t, map[string]string{peer: "business_admin"})
	body := []byte(`{"accountId":"` + peer + `","role":"business_staff"}`)

	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), body))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, peer); len(got) != 1 || got[0] != "business_staff" {
		t.Fatalf("got %v, want [business_staff]", got)
	}
}

func TestInviteMember_LastManagerCannotLowerThemselves(t *testing.T) {
	r, _ := acmeWith(t, map[string]string{})
	body := []byte(`{"accountId":"` + admin + `","role":"standard_customer"}`)

	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), body))

	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, admin); len(got) != 1 || got[0] != "business_admin" {
		t.Fatalf("got %v, want [business_admin] untouched", got)
	}
}

func TestLeaveDomain_CannotRemoveAMemberWhoOutranksIt(t *testing.T) {
	r, _ := acmeWith(t, map[string]string{owner: "admin"})

	rec := do(r, userRequest(t, http.MethodDelete, "/domains/acme/members/"+owner, admin, adminOf("acme"), nil))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403: %s", rec.Code, rec.Body.String())
	}
	if got := rolesOf(t, r, owner); len(got) != 1 {
		t.Fatalf("got %v, want the admin still a member", got)
	}
}

func TestLeaveDomain_MayRemoveAPeerOrSomeoneBelow(t *testing.T) {
	for id, role := range map[string]string{peer: "business_admin", staff: "business_staff"} {
		t.Run(role, func(t *testing.T) {
			r, _ := acmeWith(t, map[string]string{id: role})

			rec := do(r, userRequest(t, http.MethodDelete, "/domains/acme/members/"+id, admin, adminOf("acme"), nil))

			if rec.Code != http.StatusNoContent {
				t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
			}
			if got := rolesOf(t, r, id); len(got) != 0 {
				t.Fatalf("got %v, want the member removed", got)
			}
		})
	}
}
