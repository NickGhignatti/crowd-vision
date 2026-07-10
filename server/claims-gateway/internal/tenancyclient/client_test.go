package tenancyclient_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/tenancyclient"
)

const secret = "test-secret"

func verifySignature(t *testing.T, r *http.Request, body []byte) {
	t.Helper()
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	if got := r.Header.Get("X-Signature"); got != want {
		t.Fatalf("bad signature: got %q, want %q", got, want)
	}
}

func TestMembershipsFor_SignsRequestAndParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/memberships" || r.URL.Query().Get("accountId") != "acc-1" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL)
		}
		verifySignature(t, r, nil)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]string{{"domain": "unibo", "role": "standard_customer"}})
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	ms, err := c.MembershipsFor(context.Background(), "acc-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ms) != 1 || ms[0].Domain != "unibo" {
		t.Fatalf("got %+v", ms)
	}
}

func TestProvision_SignsBodyAndSucceedsOn204(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		verifySignature(t, r, body)
		var got map[string]string
		_ = json.Unmarshal(body, &got)
		if got["domainName"] != "unibo" {
			t.Fatalf("got body %s", body)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	err := c.Provision(context.Background(), service.ProvisionRequest{
		AccountID: "acc-1", DomainName: "unibo", Role: "standard_customer",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestProvision_403ReturnsErrInviteOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "domain is invite-only", http.StatusForbidden)
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	err := c.Provision(context.Background(), service.ProvisionRequest{AccountID: "acc-1", DomainName: "acme"})
	if !errors.Is(err, service.ErrInviteOnly) {
		t.Fatalf("got %v, want ErrInviteOnly", err)
	}
}

func TestProvision_ServerErrorIsAGenericFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	err := c.Provision(context.Background(), service.ProvisionRequest{AccountID: "acc-1", DomainName: "acme"})
	if err == nil {
		t.Fatal("expected an error on 500")
	}
	if err == service.ErrInviteOnly {
		t.Fatal("a 500 must not be mistaken for a policy refusal")
	}
}

func TestMembershipsFor_NetworkFailureIsAnError(t *testing.T) {
	c := tenancyclient.New("http://127.0.0.1:1", []byte(secret)) // nothing listening
	_, err := c.MembershipsFor(context.Background(), "acc-1")
	if err == nil {
		t.Fatal("expected an error when tenancy-service is unreachable")
	}
}
