package registryclient_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

// A closed port, so Do fails at the transport rather than returning a response.
// The reconciler treats an unreachable registry differently from a bad reply, and
// the wrapping is what carries that distinction to the log.
const unreachable = "http://127.0.0.1:1"

func TestPending_UnreachableRegistryIsWrapped(t *testing.T) {
	c := registryclient.New(unreachable, []byte(secret))

	_, err := c.Pending(context.Background())

	if err == nil {
		t.Fatal("got nil, want a transport error")
	}
	if !strings.Contains(err.Error(), "registry unreachable") {
		t.Fatalf("got %q, want it wrapped as \"registry unreachable\"", err)
	}
}

func TestMarkReady_UnreachableRegistryIsWrapped(t *testing.T) {
	c := registryclient.New(unreachable, []byte(secret))

	err := c.MarkReady(context.Background(), "org-1")

	if err == nil {
		t.Fatal("got nil, want a transport error")
	}
	if !strings.Contains(err.Error(), "registry unreachable") {
		t.Fatalf("got %q, want it wrapped as \"registry unreachable\"", err)
	}
}

// A 200 carrying something that is not the expected array must be an error, not
// an empty pending list — silently reconciling nothing looks identical to
// "there is no work", and the loop would never report a problem.
func TestPending_UndecodableBodyIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"not":"an array"}`))
	}))
	defer srv.Close()

	_, err := registryclient.New(srv.URL, []byte(secret)).Pending(context.Background())

	if err == nil {
		t.Fatal("got nil, want a decode error")
	}
	if !strings.Contains(err.Error(), "decoding pending organizations") {
		t.Fatalf("got %q, want the decode error to say what it was decoding", err)
	}
}

// Anything but 204 means the status was not recorded. Returning nil here would
// tell the reconciler the organization is marked ready when it is not, and the
// tick that would have retried it never happens.
func TestSetStatus_NonNoContentIsAnError(t *testing.T) {
	for _, code := range []int{http.StatusOK, http.StatusNotFound, http.StatusInternalServerError} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(code)
		}))

		err := registryclient.New(srv.URL, []byte(secret)).MarkReady(context.Background(), "org-1")
		srv.Close()

		if err == nil {
			t.Fatalf("status %d: got nil, want an error", code)
		}
		if !strings.Contains(err.Error(), fmt.Sprintf("registry returned %d", code)) {
			t.Fatalf("status %d: got %q, want it to name the status", code, err)
		}
	}
}

// A base URL that cannot be parsed into a request fails before any I/O. Worth
// pinning because the failure is silent otherwise: the reconciler would log a
// generic error and retry the same unusable configuration every tick.
func TestClient_UnparseableBaseURLFailsBeforeAnyRequest(t *testing.T) {
	c := registryclient.New("http://\x7f-control-char", []byte(secret))

	if _, err := c.Pending(context.Background()); err == nil {
		t.Fatal("Pending: got nil, want a request-construction error")
	}
	if err := c.MarkFailed(context.Background(), "org-1", "detail"); err == nil {
		t.Fatal("MarkFailed: got nil, want a request-construction error")
	}
}
