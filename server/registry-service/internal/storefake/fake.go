// Package storefake is an in-memory store.Store for unit-testing
// internal/service and internal/api without a database.
package storefake

import (
	"context"
	"fmt"

	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/store"
)

type Fake struct {
	orgs   map[string]store.Organization
	nextID int
}

func New() *Fake {
	return &Fake{orgs: map[string]store.Organization{}}
}

func (f *Fake) Create(_ context.Context, org store.Organization) (store.Organization, error) {
	for _, existing := range f.orgs {
		if existing.Name == org.Name {
			return store.Organization{}, fmt.Errorf("organization %q already exists", org.Name)
		}
	}
	f.nextID++
	org.ID = fmt.Sprintf("org-%d", f.nextID)
	f.orgs[org.ID] = org
	return org, nil
}

func (f *Fake) Get(_ context.Context, id string) (store.Organization, error) {
	org, ok := f.orgs[id]
	if !ok {
		return store.Organization{}, store.ErrNotFound
	}
	return org, nil
}

func (f *Fake) Pending(_ context.Context) ([]store.Organization, error) {
	var out []store.Organization
	for _, org := range f.orgs {
		if org.Status == "provisioning" {
			out = append(out, org)
		}
	}
	return out, nil
}

func (f *Fake) SetStatus(_ context.Context, id, status, detail string) error {
	org, ok := f.orgs[id]
	if !ok {
		return store.ErrNotFound
	}
	org.Status, org.StatusDetail = status, detail
	f.orgs[id] = org
	return nil
}

func (f *Fake) SetLicenseStatus(_ context.Context, id, licenseStatus string) error {
	org, ok := f.orgs[id]
	if !ok {
		return store.ErrNotFound
	}
	org.LicenseStatus = licenseStatus
	f.orgs[id] = org
	return nil
}

var _ store.Store = (*Fake)(nil)
