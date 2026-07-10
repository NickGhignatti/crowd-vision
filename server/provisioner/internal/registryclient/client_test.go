package registryclient_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/registryclient"
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

func TestPending_SignsRequestAndParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/organizations/pending" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		verifySignature(t, r, nil)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]string{
			{"id": "org-1", "name": "unibo", "displayName": "UniBO", "tier": "pooled"},
		})
	}))
	defer srv.Close()

	c := registryclient.New(srv.URL, []byte(secret))
	orgs, err := c.Pending(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(orgs) != 1 || orgs[0].Name != "unibo" || orgs[0].Tier != "pooled" {
		t.Fatalf("got %+v", orgs)
	}
}

func TestMarkReady_SendsStatusReady(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/organizations/org-1/status" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		verifySignature(t, r, body)
		var got map[string]string
		_ = json.Unmarshal(body, &got)
		if got["status"] != "ready" {
			t.Fatalf("got body %s", body)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := registryclient.New(srv.URL, []byte(secret))
	if err := c.MarkReady(context.Background(), "org-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarkFailed_SendsStatusFailedWithDetail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var got map[string]string
		_ = json.Unmarshal(body, &got)
		if got["status"] != "failed" || got["detail"] != "boom" {
			t.Fatalf("got body %s", body)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := registryclient.New(srv.URL, []byte(secret))
	if err := c.MarkFailed(context.Background(), "org-1", "boom"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPending_ServerErrorIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := registryclient.New(srv.URL, []byte(secret))
	if _, err := c.Pending(context.Background()); err == nil {
		t.Fatal("expected an error on 500")
	}
}
