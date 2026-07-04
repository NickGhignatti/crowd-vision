// Package service holds registry-service's business rules: organization
// signup and the status-lifecycle transitions the provisioner drives.
package service

import (
	"context"
	"errors"

	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/store"
)

var (
	ErrNotFound    = store.ErrNotFound
	ErrInvalidTier = errors.New("invalid tier")
)

var validTiers = map[string]bool{"pooled": true, "dedicated": true, "on-prem": true}

type Service struct {
	store store.Store
}

func New(s store.Store) *Service {
	return &Service{store: s}
}

type SignupInput struct {
	Name         string
	DisplayName  string
	Tier         string
	IdentityMode string // "" defaults to "platform"
	Issuer       string
}

// Signup creates an organization in "provisioning" state; the provisioner's
// reconcile loop picks it up asynchronously (see Pending). Registry-service
// never provisions anything itself — it is only the system of record.
func (s *Service) Signup(ctx context.Context, in SignupInput) (store.Organization, error) {
	if !validTiers[in.Tier] {
		return store.Organization{}, ErrInvalidTier
	}
	identityMode := in.IdentityMode
	if identityMode == "" {
		identityMode = "platform"
	}
	return s.store.Create(ctx, store.Organization{
		Name: in.Name, DisplayName: in.DisplayName, Tier: in.Tier,
		IdentityMode: identityMode, Issuer: in.Issuer,
		LicenseStatus: "active", Status: "provisioning",
	})
}

func (s *Service) Get(ctx context.Context, id string) (store.Organization, error) {
	return s.store.Get(ctx, id)
}

// Pending is the one query the provisioner's reconcile loop needs.
func (s *Service) Pending(ctx context.Context) ([]store.Organization, error) {
	return s.store.Pending(ctx)
}

func (s *Service) MarkReady(ctx context.Context, id string) error {
	return s.store.SetStatus(ctx, id, "ready", "")
}

func (s *Service) MarkFailed(ctx context.Context, id, detail string) error {
	return s.store.SetStatus(ctx, id, "failed", detail)
}

// Suspend is the offboarding path (G-OFFBOARD): both the org's own status and
// its license flip together, since a suspended org has no valid license by
// definition — keeping them as two independent fields would let them drift.
func (s *Service) Suspend(ctx context.Context, id string) error {
	if err := s.store.SetLicenseStatus(ctx, id, "suspended"); err != nil {
		return err
	}
	return s.store.SetStatus(ctx, id, "suspended", "")
}
