package reconciler_test

import (
	"context"
	"errors"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/reconciler"
)

type org = reconciler.Organization

type fakeRegistry struct {
	pending      []org
	pendingErr   error
	ready        []string
	failed       map[string]string
	markReadyErr error
	markFailedErr error
}

func (f *fakeRegistry) Pending(context.Context) ([]org, error) { return f.pending, f.pendingErr }
func (f *fakeRegistry) MarkReady(_ context.Context, id string) error {
	if f.markReadyErr != nil {
		return f.markReadyErr
	}
	f.ready = append(f.ready, id)
	return nil
}
func (f *fakeRegistry) MarkFailed(_ context.Context, id, detail string) error {
	if f.markFailedErr != nil {
		return f.markFailedErr
	}
	if f.failed == nil {
		f.failed = map[string]string{}
	}
	f.failed[id] = detail
	return nil
}

type fakeTenancy struct {
	created      []string
	joinPolicies map[string]string
	failFor      map[string]error
}

func (f *fakeTenancy) CreateDomain(_ context.Context, name, _, joinPolicy string) error {
	f.created = append(f.created, name)
	if f.joinPolicies == nil {
		f.joinPolicies = map[string]string{}
	}
	f.joinPolicies[name] = joinPolicy
	if err, ok := f.failFor[name]; ok {
		return err
	}
	return nil
}

func TestReconcileOnce_ProvisionsPooledOrgAndMarksReady(t *testing.T) {
	registry := &fakeRegistry{pending: []org{{ID: "org-1", Name: "unibo", DisplayName: "UniBO", Tier: "pooled"}}}
	tenancy := &fakeTenancy{}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tenancy.created) != 1 || tenancy.created[0] != "unibo" {
		t.Fatalf("got %v, want tenancy domain created for unibo", tenancy.created)
	}
	if len(registry.ready) != 1 || registry.ready[0] != "org-1" {
		t.Fatalf("got %v, want org-1 marked ready", registry.ready)
	}
}

func TestReconcileOnce_ByoIdpOrgGetsOpenViaIdPJoinPolicy(t *testing.T) {
	registry := &fakeRegistry{pending: []org{{ID: "org-1", Name: "unibo", DisplayName: "UniBO", Tier: "pooled", IdentityMode: "byo-idp"}}}
	tenancy := &fakeTenancy{}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tenancy.joinPolicies["unibo"] != "open-via-idp" {
		t.Fatalf("got join policy %q, want open-via-idp for a byo-idp org", tenancy.joinPolicies["unibo"])
	}
}

func TestReconcileOnce_PlatformOrgGetsInviteOnlyJoinPolicy(t *testing.T) {
	registry := &fakeRegistry{pending: []org{{ID: "org-1", Name: "acme", DisplayName: "Acme", Tier: "pooled", IdentityMode: "platform"}}}
	tenancy := &fakeTenancy{}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tenancy.joinPolicies["acme"] != "invite-only" {
		t.Fatalf("got join policy %q, want invite-only for a platform-idp org", tenancy.joinPolicies["acme"])
	}
}

func TestReconcileOnce_MarksFailedWhenTenancyCreateErrors(t *testing.T) {
	registry := &fakeRegistry{pending: []org{{ID: "org-1", Name: "unibo", DisplayName: "UniBO", Tier: "pooled"}}}
	tenancy := &fakeTenancy{failFor: map[string]error{"unibo": errors.New("connection refused")}}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(registry.ready) != 0 {
		t.Fatalf("got %v ready, want none", registry.ready)
	}
	if registry.failed["org-1"] == "" {
		t.Fatal("expected org-1 to be marked failed with a detail")
	}
}

// Dedicated/on-prem provisioning (Helm cell stamping, Keycloak org/IdP
// automation) is explicitly out of scope for this reconciler — see
// CLAUDE.md. A dedicated-tier org must not be silently dropped or marked
// ready; it's marked failed with a clear reason so it's visible, not lost.
func TestReconcileOnce_MarksUnsupportedTierAsFailed(t *testing.T) {
	registry := &fakeRegistry{pending: []org{{ID: "org-1", Name: "acme", DisplayName: "Acme", Tier: "dedicated"}}}
	tenancy := &fakeTenancy{}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tenancy.created) != 0 {
		t.Fatal("must not attempt tenancy provisioning for an unsupported tier")
	}
	if registry.failed["org-1"] == "" {
		t.Fatal("expected the dedicated-tier org to be marked failed, not silently skipped")
	}
}

func TestReconcileOnce_ContinuesAfterOneOrgFails(t *testing.T) {
	registry := &fakeRegistry{pending: []org{
		{ID: "org-1", Name: "broken", DisplayName: "Broken", Tier: "pooled"},
		{ID: "org-2", Name: "fine", DisplayName: "Fine", Tier: "pooled"},
	}}
	tenancy := &fakeTenancy{failFor: map[string]error{"broken": errors.New("boom")}}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(registry.ready) != 1 || registry.ready[0] != "org-2" {
		t.Fatalf("got %v, want only org-2 ready", registry.ready)
	}
	if registry.failed["org-1"] == "" {
		t.Fatal("expected org-1 to be marked failed")
	}
}

func TestReconcileOnce_NoPendingOrgsIsANoOp(t *testing.T) {
	registry := &fakeRegistry{pending: nil}
	tenancy := &fakeTenancy{}
	rec := reconciler.New(registry, tenancy)

	if err := rec.ReconcileOnce(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tenancy.created) != 0 || len(registry.ready) != 0 {
		t.Fatal("expected no side effects when there is nothing pending")
	}
}

func TestReconcileOnce_PropagatesRegistryUnavailable(t *testing.T) {
	registry := &fakeRegistry{pendingErr: errors.New("connection refused")}
	rec := reconciler.New(registry, &fakeTenancy{})

	if err := rec.ReconcileOnce(context.Background()); err == nil {
		t.Fatal("expected an error when registry-service is unreachable")
	}
}
