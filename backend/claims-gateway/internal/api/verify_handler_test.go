package api_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	authmiddleware "github.com/NickGhignatti/crowd-vision/server/auth-middleware"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/api"
)

// GET /verify is what Caddy's forward_auth calls on every gated request, and what
// Istio's RequestAuthentication mirrors in production. On 200 the edge copies
// X-Gateway-Claims onto the upstream request, and every downstream service decodes
// that header and trusts it without re-checking a signature — so the exact bytes
// this handler emits are the whole platform's notion of who the caller is.

func TestVerifyHandler_EmitsTheClaimsHeaderTheEdgeCopies(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	req := authedRequest(t, http.MethodGet, "/verify", "", key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rec.Code, rec.Body.String())
	}

	header := rec.Header().Get("X-Gateway-Claims")
	if header == "" {
		t.Fatal("no X-Gateway-Claims header — the edge would forward an unidentified request")
	}
	raw, err := base64.StdEncoding.DecodeString(header)
	if err != nil {
		t.Fatalf("header is not base64: %v", err)
	}
	var claims authcontracts.StandardClaims
	if err := json.Unmarshal(raw, &claims); err != nil {
		t.Fatalf("header is not the claims contract: %v", err)
	}
	if claims.Sub != "acc-1" {
		t.Fatalf("got sub %q, want the authenticated subject", claims.Sub)
	}
}

// The contract is symmetric with auth-middleware's RequireMeshClaims, which decodes
// exactly this header on the other side. Asserting the round trip here is what stops
// the two drifting apart: a change to either encoding breaks this test.
func TestVerifyHandler_HeaderRoundTripsThroughRequireMeshClaims(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authedRequest(t, http.MethodGet, "/verify", "", key))
	if rec.Code != http.StatusOK {
		t.Fatalf("verify: got %d, want 200", rec.Code)
	}

	// Replay the edge: put the emitted header on a fresh request to a downstream
	// service and let the mesh middleware decode it.
	var seen authcontracts.StandardClaims
	downstream := meshMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = claimsFromMesh(r)
		w.WriteHeader(http.StatusOK)
	}))

	inner := httptest.NewRequest(http.MethodGet, "/anything", nil)
	inner.Header.Set("x-gateway-claims", rec.Header().Get("X-Gateway-Claims"))
	innerRec := httptest.NewRecorder()
	downstream.ServeHTTP(innerRec, inner)

	if innerRec.Code != http.StatusOK {
		t.Fatalf("downstream rejected the header the gateway emitted: %d", innerRec.Code)
	}
	if seen.Sub != "acc-1" || seen.AccountName != "mario" {
		t.Fatalf("got %+v, want the identity to survive the round trip", seen)
	}
}

func TestVerifyHandler_RejectsAnUnauthenticatedCall(t *testing.T) {
	gw, key := gatewayWithProfileManagement(&fakeProfileReader{}, &fakeProfileUpdater{}, &fakePasswordChanger{})
	r := api.Mount(gw, fakeSigner{}, realKeyfunc(t, &key.PublicKey), issuer)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/verify", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	if rec.Header().Get("X-Gateway-Claims") != "" {
		t.Fatal("a rejected call must not emit a claims header")
	}
}

func meshMiddleware() func(http.Handler) http.Handler { return authmiddleware.RequireMeshClaims() }

func claimsFromMesh(r *http.Request) authcontracts.StandardClaims {
	c, _ := authmiddleware.FromContext(r.Context())
	return c
}
