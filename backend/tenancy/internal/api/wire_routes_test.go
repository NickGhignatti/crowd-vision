package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestCreateOwnDomain_AnswersTheFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../schemas/fixtures/tenancy-domains.json")
	if err != nil {
		t.Fatalf("reading fixture: %v", err)
	}
	var wire struct {
		CreateDomain   json.RawMessage `json:"createDomain"`
		RejectedCreate []struct {
			Name   string          `json:"name"`
			Reason string          `json:"reason"`
			Body   json.RawMessage `json:"body"`
		} `json:"rejectedCreate"`
	}
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatalf("parsing fixture: %v", err)
	}

	post := func(body []byte) *httptest.ResponseRecorder {
		r, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodPost, "/domains", bytes.NewReader(body))
		req.Header.Set("x-gateway-claims", signUser(t, "11111111-1111-1111-1111-111111111111", nil))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}

	if rec := post(wire.CreateDomain); rec.Code != http.StatusCreated {
		t.Fatalf("fixture create body: got %d, want 201: %s", rec.Code, rec.Body.String())
	}
	for _, c := range wire.RejectedCreate {
		rec := post(c.Body)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), c.Reason) {
			t.Errorf("%s: got %d %q, want 400 %q", c.Name, rec.Code, rec.Body.String(), c.Reason)
		}
	}
}
