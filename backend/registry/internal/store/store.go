package store

import (
	"context"
	"errors"
)

var ErrNotFound = errors.New("not found")

type Organization struct {
	ID            string
	Name          string
	DisplayName   string
	Tier          string // "pooled" | "dedicated" | "on-prem"
	Host          string
	IdentityMode  string // "platform" | "byo-idp"
	Issuer        string
	LicenseStatus string // "active" | "suspended" | "expired"
	Status        string // "provisioning" | "ready" | "failed" | "suspended"
	StatusDetail  string
}

type Store interface {
	Create(ctx context.Context, org Organization) (Organization, error)
	Get(ctx context.Context, id string) (Organization, error)
	Pending(ctx context.Context) ([]Organization, error)
	SetStatus(ctx context.Context, id, status, detail string) error
	SetLicenseStatus(ctx context.Context, id, licenseStatus string) error
}
