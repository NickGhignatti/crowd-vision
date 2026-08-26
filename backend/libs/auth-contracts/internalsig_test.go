package authcontracts

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

type signatureFixture struct {
	Secret string `json:"secret"`
	Cases  []struct {
		Name      string `json:"name"`
		Body      string `json:"body"`
		Signature string `json:"signature"`
	} `json:"cases"`
}

func fixture(t *testing.T) signatureFixture {
	t.Helper()
	raw, err := os.ReadFile("../../../schemas/fixtures/internal-signature.json")
	if err != nil {
		t.Fatalf("reading fixture: %v", err)
	}
	var parsed signatureFixture
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("fixture is not valid json: %v", err)
	}
	if len(parsed.Cases) == 0 {
		t.Fatal("fixture carries no case")
	}
	return parsed
}

// The golden vectors every language's implementation of this convention asserts:
// Rust in telemetry, Python in the acceptance suite's signer.
func TestSign_MatchesTheSharedGoldenVectors(t *testing.T) {
	f := fixture(t)
	for _, c := range f.Cases {
		if got := Sign([]byte(f.Secret), []byte(c.Body)); got != c.Signature {
			t.Fatalf("%s: got %q, want %q", c.Name, got, c.Signature)
		}
		if !Verify([]byte(f.Secret), []byte(c.Body), c.Signature) {
			t.Fatalf("%s: the fixture's own signature must verify", c.Name)
		}
	}
}

func TestVerify_RejectsATamperedBodyAndAWrongSecret(t *testing.T) {
	f := fixture(t)
	c := f.Cases[1]

	if Verify([]byte(f.Secret), []byte(c.Body+" "), c.Signature) {
		t.Fatal("a body changed by one byte must not verify")
	}
	if Verify([]byte("a-different-secret-of-sufficient-length"), []byte(c.Body), c.Signature) {
		t.Fatal("another service's secret must not verify")
	}
	if Verify([]byte(f.Secret), []byte(c.Body), "") {
		t.Fatal("an empty signature must not verify")
	}
}

func signedRequest(t *testing.T, secret, body, signature string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/internal/domains", strings.NewReader(body))
	if signature != "" {
		req.Header.Set(SignatureHeader, signature)
	}
	rec := httptest.NewRecorder()

	handler := RequireSignature([]byte(secret))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("handler could not read the body: %v", err)
		}
		if string(seen) != body {
			t.Fatalf("handler saw %q, want the original body %q", seen, body)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	handler.ServeHTTP(rec, req)
	return rec
}

func TestRequireSignature_PassesAValidCallAndLeavesTheBodyReadable(t *testing.T) {
	f := fixture(t)
	c := f.Cases[1]

	if code := signedRequest(t, f.Secret, c.Body, c.Signature).Code; code != http.StatusNoContent {
		t.Fatalf("got %d, want %d", code, http.StatusNoContent)
	}
}

func TestRequireSignature_ForbidsAMissingOrWrongSignature(t *testing.T) {
	f := fixture(t)
	c := f.Cases[1]

	if code := signedRequest(t, f.Secret, c.Body, "").Code; code != http.StatusForbidden {
		t.Fatalf("missing signature: got %d, want %d", code, http.StatusForbidden)
	}
	if code := signedRequest(t, f.Secret, c.Body, f.Cases[0].Signature).Code; code != http.StatusForbidden {
		t.Fatalf("signature of another body: got %d, want %d", code, http.StatusForbidden)
	}
}

// errorReader stands in for a connection that dies mid-body.
type errorReader struct{}

func (errorReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

// A body that cannot be read is the caller's problem (400), not a rejected
// identity (403). Collapsing it into the signature failure would tell an in-mesh
// service its shared secret is wrong when the transport simply broke.
func TestRequireSignature_UnreadableBodyIs400NotForbidden(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/thing", errorReader{})
	req.Header.Set(SignatureHeader, "does-not-matter-we-never-get-there")

	called := false
	rec := httptest.NewRecorder()
	RequireSignature([]byte("secret"))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	})).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
	if called {
		t.Fatal("next handler ran on a body that could not be read")
	}
}
