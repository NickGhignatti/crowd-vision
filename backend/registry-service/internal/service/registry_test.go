package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/storefake"
)

func newSvc() (*service.Service, *storefake.Fake) {
	fake := storefake.New()
	return service.New(fake), fake
}

func TestSignup_CreatesAnOrgInProvisioningState(t *testing.T) {
	svc, _ := newSvc()
	org, err := svc.Signup(context.Background(), service.SignupInput{
		Name: "unibo", DisplayName: "UniBO", Tier: "pooled",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.Status != "provisioning" {
		t.Fatalf("got status %q, want provisioning", org.Status)
	}
	if org.LicenseStatus != "active" {
		t.Fatalf("got license status %q, want active", org.LicenseStatus)
	}
}

func TestSignup_DefaultsIdentityModeToPlatform(t *testing.T) {
	svc, _ := newSvc()
	org, err := svc.Signup(context.Background(), service.SignupInput{Name: "acme", DisplayName: "Acme", Tier: "pooled"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if org.IdentityMode != "platform" {
		t.Fatalf("got identity mode %q, want platform", org.IdentityMode)
	}
}

func TestSignup_RejectsUnknownTier(t *testing.T) {
	svc, _ := newSvc()
	_, err := svc.Signup(context.Background(), service.SignupInput{Name: "acme", DisplayName: "Acme", Tier: "enterprise-deluxe"})
	if !errors.Is(err, service.ErrInvalidTier) {
		t.Fatalf("got %v, want ErrInvalidTier", err)
	}
}

func TestSignup_RejectsDuplicateName(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	_, _ = svc.Signup(ctx, service.SignupInput{Name: "acme", DisplayName: "Acme", Tier: "pooled"})
	_, err := svc.Signup(ctx, service.SignupInput{Name: "acme", DisplayName: "Acme Again", Tier: "pooled"})
	if err == nil {
		t.Fatal("expected an error for a duplicate organization name")
	}
}

func TestGet_ReturnsNotFoundForUnknownOrg(t *testing.T) {
	svc, _ := newSvc()
	_, err := svc.Get(context.Background(), "ghost")
	if !errors.Is(err, service.ErrNotFound) {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}

func TestPending_ListsOnlyProvisioningOrgs(t *testing.T) {
	svc, fake := newSvc()
	ctx := context.Background()
	ready, _ := svc.Signup(ctx, service.SignupInput{Name: "ready-org", DisplayName: "Ready", Tier: "pooled"})
	_, _ = svc.Signup(ctx, service.SignupInput{Name: "pending-org", DisplayName: "Pending", Tier: "pooled"})
	_ = fake.SetStatus(ctx, ready.ID, "ready", "")

	pending, err := svc.Pending(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pending) != 1 || pending[0].Name != "pending-org" {
		t.Fatalf("got %+v, want only pending-org", pending)
	}
}

func TestMarkReady_TransitionsStatus(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	org, _ := svc.Signup(ctx, service.SignupInput{Name: "acme", DisplayName: "Acme", Tier: "pooled"})

	if err := svc.MarkReady(ctx, org.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, _ := svc.Get(ctx, org.ID)
	if got.Status != "ready" {
		t.Fatalf("got status %q, want ready", got.Status)
	}
}

func TestMarkFailed_RecordsTheDetail(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	org, _ := svc.Signup(ctx, service.SignupInput{Name: "acme", DisplayName: "Acme", Tier: "pooled"})

	if err := svc.MarkFailed(ctx, org.ID, "helm install timed out"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, _ := svc.Get(ctx, org.ID)
	if got.Status != "failed" || got.StatusDetail != "helm install timed out" {
		t.Fatalf("got %+v", got)
	}
}

func TestSuspend_SetsBothLicenseAndOrgStatus(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	org, _ := svc.Signup(ctx, service.SignupInput{Name: "acme", DisplayName: "Acme", Tier: "pooled"})
	_ = svc.MarkReady(ctx, org.ID)

	if err := svc.Suspend(ctx, org.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, _ := svc.Get(ctx, org.ID)
	if got.Status != "suspended" || got.LicenseStatus != "suspended" {
		t.Fatalf("got %+v, want both status fields suspended", got)
	}
}
