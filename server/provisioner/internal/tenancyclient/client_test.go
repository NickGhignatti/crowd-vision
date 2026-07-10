package tenancyclient_test

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

	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/tenancyclient"
)

const secret = "test-secret"

func TestCreateDomain_SignsBodyAndSucceedsOn201(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/domains" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		want := hex.EncodeToString(mac.Sum(nil))
		if got := r.Header.Get("X-Signature"); got != want {
			t.Fatalf("bad signature: got %q, want %q", got, want)
		}
		var payload map[string]string
		_ = json.Unmarshal(body, &payload)
		if payload["name"] != "unibo" || payload["joinPolicy"] != "open-via-idp" {
			t.Fatalf("got body %s", body)
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	if err := c.CreateDomain(context.Background(), "unibo", "UniBO", "open-via-idp"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateDomain_AlreadyExistsIsNotAnError(t *testing.T) {
	// A retried reconcile (e.g. the provisioner crashed after creating the
	// domain but before marking the org ready) must not fail forever.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "domain already exists", http.StatusConflict)
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	if err := c.CreateDomain(context.Background(), "unibo", "UniBO", "open-via-idp"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCreateDomain_ServerErrorIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := tenancyclient.New(srv.URL, []byte(secret))
	if err := c.CreateDomain(context.Background(), "unibo", "UniBO", "open-via-idp"); err == nil {
		t.Fatal("expected an error on 500")
	}
}
