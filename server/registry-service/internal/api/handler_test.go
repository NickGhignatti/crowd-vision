package api_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/api"
	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/storefake"
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

	// GET /organizations/{id} was removed (no caller ever used it — see
	// Kubeet/claude/issues/issues.md); verify the transition against the
	// store directly instead of round-tripping through HTTP.
	got, err := fake.Get(context.Background(), created["id"])
	if err != nil {
		t.Fatalf("fake.Get: %v", err)
	}
	if got.Status != "ready" {
		t.Fatalf("got status %q, want ready", got.Status)
	}
}
