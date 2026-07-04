// Package reconciler is the provisioner's core: a plain reconcile loop, not
// a CRD operator (see the plan's gate G-CRD — promote only past ~10 cells or
// when drift bugs justify the added complexity).
//
// Scope, deliberately: this reconciler only provisions the pooled tier
// (creating a tenancy-service domain for a new organization). Dedicated and
// on-prem tiers need Helm cell stamping and Keycloak org/IdP automation,
// which are real, substantial pieces of work not built here — see
// CLAUDE.md. An org on an unsupported tier is marked failed with a clear
// reason, never silently dropped or wrongly marked ready.
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
	// joinPolicy is tenancy-service's domain join_policy ("open-via-idp" |
	// "invite-only") — see reconcileOne for how it's derived from the org's
	// IdentityMode.
	CreateDomain(ctx context.Context, name, displayName, joinPolicy string) error
}

type Reconciler struct {
	registry RegistryClient
	tenancy  TenancyClient
}

func New(registry RegistryClient, tenancy TenancyClient) *Reconciler {
	return &Reconciler{registry: registry, tenancy: tenancy}
}

// ReconcileOnce processes every pending organization exactly once. It
// returns an error only for a systemic failure (registry-service
// unreachable) — a single organization failing to provision is recorded via
// MarkFailed and does not stop the rest of the batch.
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
	// self-service-join domain — a platform-IdP org's members arrive via the
	// standard invite flow, not by proving they hold a foreign IdP login.
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
