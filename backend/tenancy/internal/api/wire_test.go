package api

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/store"
)

type wireFixture struct {
	Domains []struct {
		Name string          `json:"name"`
		Body json.RawMessage `json:"body"`
	} `json:"domains"`
	Memberships  []json.RawMessage `json:"memberships"`
	CreateDomain json.RawMessage   `json:"createDomain"`
	Join         json.RawMessage   `json:"join"`
	InviteCode   json.RawMessage   `json:"inviteCode"`
}

func loadWire(t *testing.T) wireFixture {
	t.Helper()
	raw, err := os.ReadFile("../../../../schemas/fixtures/tenancy-domains.json")
	if err != nil {
		t.Fatalf("reading fixture: %v", err)
	}
	var w wireFixture
	if err := json.Unmarshal(raw, &w); err != nil {
		t.Fatalf("parsing fixture: %v", err)
	}
	return w
}

func assertRoundTrip[T any](t *testing.T, name string, raw json.RawMessage) {
	t.Helper()
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	out, _ := json.Marshal(v)
	var want, got any
	_ = json.Unmarshal(raw, &want)
	_ = json.Unmarshal(out, &got)
	if !reflect.DeepEqual(want, got) {
		t.Errorf("%s: got %s, want %s", name, out, raw)
	}
}

func TestDomainResponsesRoundTripTheFixture(t *testing.T) {
	for _, c := range loadWire(t).Domains {
		assertRoundTrip[domainResponse](t, c.Name, c.Body)
	}
}

func TestAZeroMemberDomainOmitsMemberCount(t *testing.T) {
	w := loadWire(t)
	got, _ := json.Marshal(toDomainResponse(store.Domain{
		ID: "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9", Name: "ops", DisplayName: "Operations",
		JoinPolicy: "invite-only", IsPublic: true,
	}))
	var want, have any
	_ = json.Unmarshal(w.Domains[2].Body, &want)
	_ = json.Unmarshal(got, &have)
	if !reflect.DeepEqual(want, have) {
		t.Fatalf("got %s, want %s", got, w.Domains[2].Body)
	}
}

func TestMembershipsRoundTripTheFixture(t *testing.T) {
	for _, m := range loadWire(t).Memberships {
		assertRoundTrip[authcontracts.Membership](t, string(m), m)
	}
}

func TestInviteCodeResponseRoundTripsTheFixture(t *testing.T) {
	assertRoundTrip[inviteCodeResponse](t, "inviteCode", loadWire(t).InviteCode)
}

func TestRequestBodiesDecodeTheFixture(t *testing.T) {
	w := loadWire(t)
	var create createDomainRequest
	if err := json.Unmarshal(w.CreateDomain, &create); err != nil || create.Name != "lab.eng" ||
		create.DisplayName != "lab.eng" || create.IsPublic {
		t.Fatalf("create body decoded as %+v (%v)", create, err)
	}
	var join joinRequest
	if err := json.Unmarshal(w.Join, &join); err != nil || join.Role != "standard_customer" {
		t.Fatalf("join body decoded as %+v (%v)", join, err)
	}
}
