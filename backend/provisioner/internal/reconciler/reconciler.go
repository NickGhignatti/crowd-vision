package reconciler

import (
	"context"
	"fmt"
)

type Organization struct {
	ID           string
	Name         string
	DisplayName  string
	Tier         string
	IdentityMode string // "platform" | "byo-idp"
}

type RegistryClient interface {
	Pending(ctx context.Context) ([]Organization, error)
	MarkReady(ctx context.Context, id string) error
	MarkFailed(ctx context.Context, id, detail string) error
}

type TenancyClient interface {
	CreateDomain(ctx context.Context, name, displayName, joinPolicy string) error
}

type Reconciler struct {
	registry RegistryClient
	tenancy  TenancyClient
}

func New(registry RegistryClient, tenancy TenancyClient) *Reconciler {
	return &Reconciler{registry: registry, tenancy: tenancy}
}

func (r *Reconciler) ReconcileOnce(ctx context.Context) error {
	orgs, err := r.registry.Pending(ctx)
	if err != nil {
		return fmt.Errorf("listing pending organizations: %w", err)
	}

	for _, org := range orgs {
		r.reconcileOne(ctx, org)
	}
	return nil
}

func (r *Reconciler) reconcileOne(ctx context.Context, org Organization) {
	if org.Tier != "pooled" {
		_ = r.registry.MarkFailed(ctx, org.ID,
			fmt.Sprintf("provisioner does not yet support tier %q (only pooled)", org.Tier))
		return
	}

	// Only an org whose identity is federated to its own IdP (BYO-IdP) gets a
	// self-service-join domain.
	joinPolicy := "invite-only"
	if org.IdentityMode == "byo-idp" {
		joinPolicy = "open-via-idp"
	}

	if err := r.tenancy.CreateDomain(ctx, org.Name, org.DisplayName, joinPolicy); err != nil {
		_ = r.registry.MarkFailed(ctx, org.ID, "tenancy provisioning failed: "+err.Error())
		return
	}

	_ = r.registry.MarkReady(ctx, org.ID)
}
