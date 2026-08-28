package api_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/NickGhignatti/crowd-vision/server/registry/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/registry/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/registry/internal/storefake"
)

const internalSecret = "test-internal-secret"

func newTestServer(t *testing.T) (http.Handler, *storefake.Fake) {
	t.Helper()
	fake := storefake.New()
	svc := service.New(fake)
	r := chi.NewRouter()
	api.Mount(r, svc, []byte(internalSecret))
	return r, fake
}

func sign(body []byte) string {
	mac := hmac.New(sha256.New, []byte(internalSecret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestSignup_CreatesOrgAndReturns201(t *testing.T) {
	r, _ := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "tier": "pooled"})

	req := httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("got %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var got map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["name"] != "unibo" || got["status"] != "provisioning" {
		t.Fatalf("got %+v", got)
	}
}

func TestSignup_RejectsInvalidTier(t *testing.T) {
	r, _ := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"name": "acme", "displayName": "Acme", "tier": "not-a-real-tier"})

	req := httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestInternalPending_RequiresSignature(t *testing.T) {
	r, _ := newTestServer(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/internal/organizations/pending", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

func TestInternalPending_ListsProvisioningOrgs(t *testing.T) {
	r, _ := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "tier": "pooled"})
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader(body)))

	req := httptest.NewRequest(http.MethodGet, "/internal/organizations/pending", nil)
	req.Header.Set("X-Signature", sign(nil))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var orgs []map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &orgs)
	if len(orgs) != 1 || orgs[0]["name"] != "unibo" {
		t.Fatalf("got %+v", orgs)
	}
}

func TestInternalMarkReady_TransitionsStatus(t *testing.T) {
	r, fake := newTestServer(t)
	body, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "tier": "pooled"})
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader(body)))
	var created map[string]string
	_ = json.Unmarshal(createRec.Body.Bytes(), &created)

	statusBody := []byte(`{"status":"ready"}`)
	req := httptest.NewRequest(http.MethodPost, "/internal/organizations/"+created["id"]+"/status", bytes.NewReader(statusBody))
	req.Header.Set("X-Signature", sign(statusBody))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}

	// GET /organizations/{id} was removed (unused); verify the transition against
	// the store directly instead of round-tripping through HTTP.
	got, err := fake.Get(context.Background(), created["id"])
	if err != nil {
		t.Fatalf("fake.Get: %v", err)
	}
	if got.Status != "ready" {
		t.Fatalf("got status %q, want ready", got.Status)
	}
}

// createOrg signs up one organization through the public route and returns its id.
func createOrg(t *testing.T, r http.Handler, name string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"name": name, "displayName": name, "tier": "pooled"})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("createOrg: got %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var created map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	return created["id"]
}

// postSigned sends an internally-signed request to one of the /internal routes.
func postSigned(t *testing.T, r http.Handler, path string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("X-Signature", sign(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

// A provisioner reporting failure must record exactly that. Writing "ready" on the
// way to "failed" publishes a state the organization was never in — and anything
// reading the row in between sees a tenant that is ready to serve traffic.
func TestInternalMarkFailed_WritesOnlyFailed(t *testing.T) {
	r, fake := newTestServer(t)
	id := createOrg(t, r, "unibo")
	fake.StatusWrites = nil

	rec := postSigned(t, r, "/internal/organizations/"+id+"/status", []byte(`{"status":"failed","detail":"keycloak realm refused"}`))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if len(fake.StatusWrites) != 1 || fake.StatusWrites[0] != "failed" {
		t.Fatalf("status writes = %v, want exactly [failed]", fake.StatusWrites)
	}
	got, err := fake.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("fake.Get: %v", err)
	}
	if got.Status != "failed" || got.StatusDetail != "keycloak realm refused" {
		t.Fatalf("got status %q detail %q, want failed / keycloak realm refused", got.Status, got.StatusDetail)
	}
}

func TestSignup_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader([]byte("{not json"))))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

// A store failure must not leak as a 400: the caller's request was fine, so
// retrying it unchanged is the right response to a 500 and the wrong one to a 400.
func TestSignup_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.CreateErr = errors.New("connection refused")
	body, _ := json.Marshal(map[string]string{"name": "unibo", "displayName": "UniBO", "tier": "pooled"})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/organizations", bytes.NewReader(body)))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500", rec.Code)
	}
}

func TestInternalPending_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	fake.PendingErr = errors.New("connection refused")

	req := httptest.NewRequest(http.MethodGet, "/internal/organizations/pending", nil)
	req.Header.Set("X-Signature", sign(nil))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500", rec.Code)
	}
}

func TestInternalSetStatus_RejectsMalformedBody(t *testing.T) {
	r, _ := newTestServer(t)
	id := createOrg(t, r, "unibo")
	rec := postSigned(t, r, "/internal/organizations/"+id+"/status", []byte("{not json"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestInternalSetStatus_UnknownOrgIs404(t *testing.T) {
	r, _ := newTestServer(t)
	rec := postSigned(t, r, "/internal/organizations/org-does-not-exist/status", []byte(`{"status":"ready"}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404: %s", rec.Code, rec.Body.String())
	}
}

func TestInternalSetStatus_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	id := createOrg(t, r, "unibo")
	fake.SetStatusErr = errors.New("connection refused")

	rec := postSigned(t, r, "/internal/organizations/"+id+"/status", []byte(`{"status":"ready"}`))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500", rec.Code)
	}
}

func TestInternalSuspend_RequiresSignature(t *testing.T) {
	r, _ := newTestServer(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/internal/organizations/org-1/suspend", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

// Suspension is two writes — the licence and the status — and the route is the
// only thing that drives both, so it is asserted here rather than only in service.
func TestInternalSuspend_SetsBothLicenceAndStatus(t *testing.T) {
	r, fake := newTestServer(t)
	id := createOrg(t, r, "unibo")

	rec := postSigned(t, r, "/internal/organizations/"+id+"/suspend", nil)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204: %s", rec.Code, rec.Body.String())
	}
	got, err := fake.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("fake.Get: %v", err)
	}
	if got.LicenseStatus != "suspended" || got.Status != "suspended" {
		t.Fatalf("got licence %q status %q, want both suspended", got.LicenseStatus, got.Status)
	}
}

func TestInternalSuspend_UnknownOrgIs404(t *testing.T) {
	r, _ := newTestServer(t)
	rec := postSigned(t, r, "/internal/organizations/org-does-not-exist/suspend", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404: %s", rec.Code, rec.Body.String())
	}
}

func TestInternalSuspend_StoreFailureIs500(t *testing.T) {
	r, fake := newTestServer(t)
	id := createOrg(t, r, "unibo")
	fake.SetLicenseStatusErr = errors.New("connection refused")

	rec := postSigned(t, r, "/internal/organizations/"+id+"/suspend", nil)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500", rec.Code)
	}
}

// The route exists for the provisioner to report an outcome, and the only two
// outcomes are ready and failed (registryclient/client.go). Anything else was a
// caller mistake: silently treating it as "ready" would mark a tenant live off a
// typo, so it is rejected and nothing is written.
func TestInternalSetStatus_RejectsUnknownStatus(t *testing.T) {
	r, fake := newTestServer(t)
	id := createOrg(t, r, "unibo")
	fake.StatusWrites = nil

	rec := postSigned(t, r, "/internal/organizations/"+id+"/status", []byte(`{"status":"provisioning"}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
	if len(fake.StatusWrites) != 0 {
		t.Fatalf("status writes = %v, want none for a rejected status", fake.StatusWrites)
	}
}

func TestInternalSetStatus_RejectsMissingStatus(t *testing.T) {
	r, fake := newTestServer(t)
	id := createOrg(t, r, "unibo")
	fake.StatusWrites = nil

	rec := postSigned(t, r, "/internal/organizations/"+id+"/status", []byte(`{"detail":"no status field"}`))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rec.Code, rec.Body.String())
	}
	if len(fake.StatusWrites) != 0 {
		t.Fatalf("status writes = %v, want none", fake.StatusWrites)
	}
}
