package api_test

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/storefake"
)

const internalSecret = "test-internal-secret"

func newTestServer(t *testing.T) (http.Handler, *storefake.Fake) {
	t.Helper()
	fake := storefake.New()
	svc := service.New(fake)

	r := chi.NewRouter()
	api.Mount(r, svc, api.Config{
		InternalSecret: []byte(internalSecret),
		TenancyEnabled: true,
	})
	return r, fake
}

// signUser builds the base64 x-gateway-claims header the mesh injects after verifying the
// gateway JWT once at the edge; RequireMeshClaims decodes it directly, no signing needed here.
func signUser(t *testing.T, accountID string, memberships []map[string]string) string {
	t.Helper()
	payload := map[string]any{
		"sub": accountID, "accountName": accountID, "sid": "sid-1",
		"memberships": memberships,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshaling claims: %v", err)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

func signedInternalRequest(t *testing.T, method, path string, body []byte) *http.Request {
	t.Helper()
	mac := hmac.New(sha256.New, []byte(internalSecret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("X-Signature", sig)
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestInternalMemberships_RejectsMissingSignature(t *testing.T) {
	r, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/internal/memberships?accountId=11111111-1111-1111-1111-111111111111", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

func TestInternalMemberships_EmptyForNewAccount(t *testing.T) {
	r, _ := newTestServer(t)
	req := signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId=55555555-5555-5555-5555-555555555555", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var ms []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ms)
	if len(ms) != 0 {
		t.Fatalf("got %d memberships, want 0", len(ms))
	}
}

func TestCreateOwnDomain_CreatorBecomesBusinessAdmin(t *testing.T) {
	r, _ := newTestServer(t)
	token := signUser(t, "11111111-1111-1111-1111-111111111111", nil)

	body, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme Inc"})
	req := httptest.NewRequest(http.MethodPost, "/domains", bytes.NewReader(body))
	req.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201: %s", rec.Code, rec.Body.String())
	}

	membershipsReq := signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId=11111111-1111-1111-1111-111111111111", nil)
	membershipsRec := httptest.NewRecorder()
	r.ServeHTTP(membershipsRec, membershipsReq)
	var ms []map[string]any
	_ = json.Unmarshal(membershipsRec.Body.Bytes(), &ms)
	if len(ms) != 1 || ms[0]["role"] != "business_admin" {
		t.Fatalf("got %+v, want the creator as business_admin", ms)
	}
}

func TestCreateOwnDomain_RejectsExistingName(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	token := signUser(t, "22222222-2222-2222-2222-222222222222", nil)
	body, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Not Acme"})
	req2 := httptest.NewRequest(http.MethodPost, "/domains", bytes.NewReader(body))
	req2.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req2)

	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
}

func TestCreateOwnDomain_RequiresAuthentication(t *testing.T) {
	r, _ := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme"})
	req := httptest.NewRequest(http.MethodPost, "/domains", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestCreateSubdomain_RequiresBusinessAdminOfParent(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	lowToken := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "acme", "role": "standard_customer"}})
	body, _ := json.Marshal(map[string]string{"name": "acme-eng", "displayName": "Eng"})
	req2 := httptest.NewRequest(http.MethodPost, "/domains/acme/subdomains", bytes.NewReader(body))
	req2.Header.Set("x-gateway-claims", lowToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("standard_customer: got %d, want 403", rec.Code)
	}

	adminToken := signUser(t, "22222222-2222-2222-2222-222222222222", []map[string]string{{"domain": "acme", "role": "business_admin"}})
	req3 := httptest.NewRequest(http.MethodPost, "/domains/acme/subdomains", bytes.NewReader(body))
	req3.Header.Set("x-gateway-claims", adminToken)
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, req3)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("business_admin: got %d, want 201: %s", rec2.Code, rec2.Body.String())
	}
}

func TestListSubdomains_OnlyAuthenticationRequired(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	adminToken := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "acme", "role": "business_admin"}})
	subBody, _ := json.Marshal(map[string]string{"name": "acme-eng", "displayName": "Eng"})
	createSubReq := httptest.NewRequest(http.MethodPost, "/domains/acme/subdomains", bytes.NewReader(subBody))
	createSubReq.Header.Set("x-gateway-claims", adminToken)
	r.ServeHTTP(httptest.NewRecorder(), createSubReq)

	// Any authenticated user, no admin role anywhere, can list.
	plainToken := signUser(t, "33333333-3333-3333-3333-333333333333", nil)
	listReq := httptest.NewRequest(http.MethodGet, "/domains/acme/subdomains", nil)
	listReq.Header.Set("x-gateway-claims", plainToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, listReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var subs []map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &subs)
	if len(subs) != 1 || subs[0]["name"] != "acme-eng" {
		t.Fatalf("got %+v", subs)
	}
}

func TestInviteCode_CreateAndRedeem_GrantsTheStatedRole(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	adminToken := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "acme", "role": "business_admin"}})
	codeBody, _ := json.Marshal(map[string]string{"role": "business_staff"})
	createReq := httptest.NewRequest(http.MethodPost, "/domains/acme/invite-codes", bytes.NewReader(codeBody))
	createReq.Header.Set("x-gateway-claims", adminToken)
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create invite code: got %d, want 201: %s", createRec.Code, createRec.Body.String())
	}
	var created map[string]string
	_ = json.Unmarshal(createRec.Body.Bytes(), &created)

	redeemerToken := signUser(t, "22222222-2222-2222-2222-222222222222", nil)
	redeemReq := httptest.NewRequest(http.MethodPost, "/invite-codes/"+created["code"]+"/redeem", nil)
	redeemReq.Header.Set("x-gateway-claims", redeemerToken)
	redeemRec := httptest.NewRecorder()
	r.ServeHTTP(redeemRec, redeemReq)
	if redeemRec.Code != http.StatusNoContent {
		t.Fatalf("redeem: got %d, want 204: %s", redeemRec.Code, redeemRec.Body.String())
	}

	membershipsReq := signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId=22222222-2222-2222-2222-222222222222", nil)
	membershipsRec := httptest.NewRecorder()
	r.ServeHTTP(membershipsRec, membershipsReq)
	var ms []map[string]any
	_ = json.Unmarshal(membershipsRec.Body.Bytes(), &ms)
	if len(ms) != 1 || ms[0]["role"] != "business_staff" {
		t.Fatalf("got %+v, want the redeemer as business_staff", ms)
	}
}

func TestInviteCode_CreateRequiresBusinessAdmin(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	lowToken := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "acme", "role": "standard_customer"}})
	codeBody, _ := json.Marshal(map[string]string{"role": "business_staff"})
	codeReq := httptest.NewRequest(http.MethodPost, "/domains/acme/invite-codes", bytes.NewReader(codeBody))
	codeReq.Header.Set("x-gateway-claims", lowToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, codeReq)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

func TestInviteCode_RedeemUnknownCodeIsBadRequest(t *testing.T) {
	r, _ := newTestServer(t)
	token := signUser(t, "11111111-1111-1111-1111-111111111111", nil)
	req := httptest.NewRequest(http.MethodPost, "/invite-codes/not-a-real-code/redeem", nil)
	req.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

// TestInternalMemberships_RejectsMalformedAccountID: a non-UUID accountId reaching Postgres's
// `uuid` column used to surface as an opaque 500 instead of a clean 400.
func TestInternalMemberships_RejectsMalformedAccountID(t *testing.T) {
	r, _ := newTestServer(t)
	req := signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId=not-a-uuid", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestInternalProvision_RejectsMalformedAccountID(t *testing.T) {
	r, _ := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"accountId": "not-a-uuid", "domainName": "unibo", "role": "standard_customer"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/provision", body)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestInternalDomainsAndProvision_JITFlow(t *testing.T) {
	r, _ := newTestServer(t)

	createBody, _ := json.Marshal(map[string]string{
		"name": "unibo", "displayName": "UniBO", "joinPolicy": "open-via-idp",
	})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create domain: got %d, want 201: %s", rec.Code, rec.Body.String())
	}

	provisionBody, _ := json.Marshal(map[string]string{
		"accountId": "44444444-4444-4444-4444-444444444444", "domainName": "unibo", "role": "standard_customer", "externalId": "eppn:mario@unibo.it",
	})
	req = signedInternalRequest(t, http.MethodPost, "/internal/provision", provisionBody)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("provision: got %d, want 204: %s", rec.Code, rec.Body.String())
	}

	req = signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId=44444444-4444-4444-4444-444444444444", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var ms []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ms)
	if len(ms) != 1 || ms[0]["domain"] != "unibo" {
		t.Fatalf("got %+v, want one unibo membership", ms)
	}
}

func TestInternalProvision_RespectsInviteOnlyPolicy(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme", "joinPolicy": "invite-only"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	provisionBody, _ := json.Marshal(map[string]string{"accountId": "11111111-1111-1111-1111-111111111111", "domainName": "acme", "role": "standard_customer"})
	req = signedInternalRequest(t, http.MethodPost, "/internal/provision", provisionBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403 (domain is invite-only)", rec.Code)
	}
}

func TestJoinDomain_EndUserSelfService(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "joinPolicy": "open-via-idp"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	token := signUser(t, "11111111-1111-1111-1111-111111111111", nil)
	req = httptest.NewRequest(http.MethodPost, "/domains/unibo/join", bytes.NewReader([]byte(`{"role":"standard_customer"}`)))
	req.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestJoinDomain_RequiresAuthentication(t *testing.T) {
	r, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/domains/unibo/join", bytes.NewReader([]byte(`{"role":"standard_customer"}`)))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestInviteMember_RequiresBusinessAdminInThatDomain(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme", "joinPolicy": "invite-only"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	// standard_customer in acme cannot invite.
	lowToken := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "acme", "role": "standard_customer"}})
	req = httptest.NewRequest(http.MethodPost, "/domains/acme/invite",
		bytes.NewReader([]byte(`{"accountId":"22222222-2222-2222-2222-222222222222","role":"business_staff"}`)))
	req.Header.Set("x-gateway-claims", lowToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("standard_customer invite: got %d, want 403", rec.Code)
	}

	// business_admin in acme can invite.
	adminToken := signUser(t, "33333333-3333-3333-3333-333333333333", []map[string]string{{"domain": "acme", "role": "business_admin"}})
	req = httptest.NewRequest(http.MethodPost, "/domains/acme/invite",
		bytes.NewReader([]byte(`{"accountId":"22222222-2222-2222-2222-222222222222","role":"business_staff"}`)))
	req.Header.Set("x-gateway-claims", adminToken)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("business_admin invite: got %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestInviteMember_AdminInAnotherDomainCannotInviteHere(t *testing.T) {
	r, _ := newTestServer(t)
	for _, name := range []string{"acme", "other-co"} {
		body, _ := json.Marshal(map[string]string{"name": name, "displayName": name, "joinPolicy": "invite-only"})
		req := signedInternalRequest(t, http.MethodPost, "/internal/domains", body)
		r.ServeHTTP(httptest.NewRecorder(), req)
	}

	// business_admin of "other-co" — not a member of "acme" at all.
	token := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "other-co", "role": "business_admin"}})
	req := httptest.NewRequest(http.MethodPost, "/domains/acme/invite",
		bytes.NewReader([]byte(`{"accountId":"22222222-2222-2222-2222-222222222222","role":"business_staff"}`)))
	req.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403 (cross-tenant admin must not leak permissions)", rec.Code)
	}
}

func TestLeaveDomain_SelfLeaveAlwaysAllowed(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "joinPolicy": "open-via-idp"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	token := signUser(t, "11111111-1111-1111-1111-111111111111", nil)
	joinReq := httptest.NewRequest(http.MethodPost, "/domains/unibo/join", bytes.NewReader([]byte(`{"role":"standard_customer"}`)))
	joinReq.Header.Set("x-gateway-claims", token)
	r.ServeHTTP(httptest.NewRecorder(), joinReq)

	leaveReq := httptest.NewRequest(http.MethodDelete, "/domains/unibo/members/11111111-1111-1111-1111-111111111111", nil)
	leaveReq.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, leaveReq)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestListPublicDomains_OnlyListsPublicOnesWithMemberCounts(t *testing.T) {
	r, _ := newTestServer(t)
	token := signUser(t, "11111111-1111-1111-1111-111111111111", nil)

	publicBody, _ := json.Marshal(map[string]any{"name": "unibo", "displayName": "UniBO", "isPublic": true})
	req := httptest.NewRequest(http.MethodPost, "/domains", bytes.NewReader(publicBody))
	req.Header.Set("x-gateway-claims", token)
	r.ServeHTTP(httptest.NewRecorder(), req)

	privateBody, _ := json.Marshal(map[string]any{"name": "acme", "displayName": "Acme"})
	req2 := httptest.NewRequest(http.MethodPost, "/domains", bytes.NewReader(privateBody))
	req2.Header.Set("x-gateway-claims", token)
	r.ServeHTTP(httptest.NewRecorder(), req2)

	listReq := httptest.NewRequest(http.MethodGet, "/domains", nil)
	listReq.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, listReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var domains []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &domains)
	if len(domains) != 1 || domains[0]["name"] != "unibo" {
		t.Fatalf("got %+v, want only the public unibo domain", domains)
	}
	if domains[0]["memberCount"].(float64) != 1 {
		t.Fatalf("got %+v, want memberCount 1 (the creator)", domains[0])
	}
}

func TestListPublicDomains_RequiresAuthentication(t *testing.T) {
	r, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/domains", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestMyMemberships_ReturnsFreshMembershipsForTheCaller(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "joinPolicy": "open-via-idp"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	token := signUser(t, "11111111-1111-1111-1111-111111111111", nil)
	joinReq := httptest.NewRequest(http.MethodPost, "/domains/unibo/join", bytes.NewReader([]byte(`{"role":"standard_customer"}`)))
	joinReq.Header.Set("x-gateway-claims", token)
	r.ServeHTTP(httptest.NewRecorder(), joinReq)

	meReq := httptest.NewRequest(http.MethodGet, "/me/memberships", nil)
	meReq.Header.Set("x-gateway-claims", token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, meReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var ms []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ms)
	if len(ms) != 1 || ms[0]["domain"] != "unibo" || ms[0]["role"] != "standard_customer" {
		t.Fatalf("got %+v, want one unibo/standard_customer membership", ms)
	}
}

func TestMyMemberships_RequiresAuthentication(t *testing.T) {
	r, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/me/memberships", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestLeaveDomain_CannotRemoveSomeoneElseWithoutBusinessAdmin(t *testing.T) {
	r, _ := newTestServer(t)
	createBody, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "joinPolicy": "open-via-idp"})
	req := signedInternalRequest(t, http.MethodPost, "/internal/domains", createBody)
	r.ServeHTTP(httptest.NewRecorder(), req)

	standardToken := signUser(t, "11111111-1111-1111-1111-111111111111", []map[string]string{{"domain": "unibo", "role": "standard_customer"}})
	leaveReq := httptest.NewRequest(http.MethodDelete, "/domains/unibo/members/22222222-2222-2222-2222-222222222222", nil)
	leaveReq.Header.Set("x-gateway-claims", standardToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, leaveReq)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

// --- rejected input and store failures ---
//
// Every handler that decodes a body has a 400 branch and every one that touches
// the store has a 500 branch; both were unexercised. A malformed body arriving as
// a 500 (or a store outage arriving as a 400) tells the caller to do the opposite
// of the right thing, so the two are asserted apart rather than "not 2xx".

const admin = "11111111-1111-1111-1111-111111111111"

func adminOf(domain string) []map[string]string {
	return []map[string]string{{"domain": domain, "role": "business_admin"}}
}

func userRequest(t *testing.T, method, path, accountID string, memberships []map[string]string, body []byte) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("x-gateway-claims", signUser(t, accountID, memberships))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func do(r http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestInternalCreateDomain_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, signedInternalRequest(t, http.MethodPost, "/internal/domains", []byte("{not json")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestInternalCreateDomain_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.FailOn = map[string]error{"CreateDomain": errors.New("connection refused")}
	body, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "joinPolicy": "open-via-idp"})

	rec := do(r, signedInternalRequest(t, http.MethodPost, "/internal/domains", body))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500: %s", rec.Code, rec.Body.String())
	}
}

func TestInternalProvision_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, signedInternalRequest(t, http.MethodPost, "/internal/provision", []byte("{not json")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestInternalMemberships_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.FailOn = map[string]error{"MembershipsFor": errors.New("connection refused")}

	rec := do(r, signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId="+admin, nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateOwnDomain_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodPost, "/domains", admin, nil, []byte("{not json")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestCreateOwnDomain_RequiresNameAndDisplayName(t *testing.T) {
	r, _ := newTestServer(t)
	for _, body := range []string{`{"displayName":"UniBO"}`, `{"name":"unibo"}`, `{}`} {
		rec := do(r, userRequest(t, http.MethodPost, "/domains", admin, nil, []byte(body)))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body %s: got %d, want 400", body, rec.Code)
		}
	}
}

func TestCreateOwnDomain_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.FailOn = map[string]error{"CreateDomain": errors.New("connection refused")}
	body := []byte(`{"name":"unibo","displayName":"UniBO"}`)

	rec := do(r, userRequest(t, http.MethodPost, "/domains", admin, nil, body))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500: %s", rec.Code, rec.Body.String())
	}
}

func TestListPublicDomains_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.FailOn = map[string]error{"PublicDomains": errors.New("connection refused")}

	rec := do(r, userRequest(t, http.MethodGet, "/domains", admin, nil, nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500: %s", rec.Code, rec.Body.String())
	}
}

func TestMyMemberships_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.FailOn = map[string]error{"MembershipsFor": errors.New("connection refused")}

	rec := do(r, userRequest(t, http.MethodGet, "/me/memberships", admin, nil, nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500: %s", rec.Code, rec.Body.String())
	}
}

// The authz check runs before the body is read, so a non-admin sending rubbish
// must still be told "forbidden" — the 400 branch is only reachable once past it.
func TestInviteMember_RejectsMalformedBodyOnceAuthorised(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), []byte("{not json")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestInviteMember_RejectsMalformedAccountID(t *testing.T) {
	r, _ := newTestServer(t)
	body := []byte(`{"accountId":"not-a-uuid","role":"standard_customer"}`)
	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite", admin, adminOf("acme"), body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateSubdomain_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/subdomains", admin, adminOf("acme"), []byte("{not json")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateSubdomain_RequiresNameAndDisplayName(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/subdomains", admin, adminOf("acme"), []byte(`{"name":"eng"}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateInviteCode_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodPost, "/domains/acme/invite-codes", admin, adminOf("acme"), []byte("{not json")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

// The identity check ("am I removing myself?") compares against the URL segment,
// so a non-UUID must be rejected before it is ever compared to the caller's sub.
func TestLeaveDomain_RejectsMalformedAccountID(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodDelete, "/domains/acme/members/not-a-uuid", admin, adminOf("acme"), nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

func TestListSubdomains_UnknownDomainIs404(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodGet, "/domains/no-such-domain/subdomains", admin, nil, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404: %s", rec.Code, rec.Body.String())
	}
}

func TestJoinDomain_UnknownDomainIs404(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, userRequest(t, http.MethodPost, "/domains/no-such-domain/join", admin, nil, []byte(`{}`)))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404: %s", rec.Code, rec.Body.String())
	}
}

// The last admin leaving would strand the domain with nobody able to manage it.
// The service refuses; this asserts the route surfaces that as 409 rather than
// 500 — the caller can act on a conflict, but not on an internal error.
func TestLeaveDomain_LastAdminIs409(t *testing.T) {
	r, _ := newTestServer(t)
	create := []byte(`{"name":"acme","displayName":"Acme"}`)
	if rec := do(r, userRequest(t, http.MethodPost, "/domains", admin, nil, create)); rec.Code != http.StatusCreated {
		t.Fatalf("create domain: got %d: %s", rec.Code, rec.Body.String())
	}

	rec := do(r, userRequest(t, http.MethodDelete, "/domains/acme/members/"+admin, admin, adminOf("acme"), nil))

	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409: %s", rec.Code, rec.Body.String())
	}
}

// TenancyEnabled is the kill switch for the whole feature: with it off nothing is
// mounted at all, so a deployment that has not enabled tenancy cannot be reached
// through routes that would otherwise answer.
func TestMount_MountsNothingWhenTenancyIsDisabled(t *testing.T) {
	r := chi.NewRouter()
	api.Mount(r, service.New(storefake.New()), api.Config{
		InternalSecret: []byte(internalSecret),
		TenancyEnabled: false,
	})

	for _, path := range []string{"/domains", "/me/memberships", "/internal/memberships"} {
		rec := do(r, userRequest(t, http.MethodGet, path, admin, nil, nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s: got %d, want 404 with tenancy disabled", path, rec.Code)
		}
	}
}

func TestInternalMemberships_RejectsEmptyAccountID(t *testing.T) {
	r, _ := newTestServer(t)
	rec := do(r, signedInternalRequest(t, http.MethodGet, "/internal/memberships?accountId=", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
}

// The three admin-gated writes each surface a service error through writeErr;
// an unknown domain must reach the caller as 404, not as a 500.
func TestAdminWrites_UnknownDomainIs404(t *testing.T) {
	cases := []struct {
		name, method, path string
		body               []byte
	}{
		{"invite", http.MethodPost, "/domains/no-such-domain/invite", []byte(`{"accountId":"` + admin + `","role":"standard_customer"}`)},
		{"create subdomain", http.MethodPost, "/domains/no-such-domain/subdomains", []byte(`{"name":"eng","displayName":"Eng"}`)},
		{"create invite code", http.MethodPost, "/domains/no-such-domain/invite-codes", []byte(`{"role":"standard_customer"}`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, _ := newTestServer(t)
			rec := do(r, userRequest(t, tc.method, tc.path, admin, adminOf("no-such-domain"), tc.body))
			if rec.Code != http.StatusNotFound {
				t.Fatalf("got %d, want 404: %s", rec.Code, rec.Body.String())
			}
		})
	}
}
