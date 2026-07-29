package api_test

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/storefake"
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
