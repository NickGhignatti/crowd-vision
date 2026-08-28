// In-memory store.Store for unit-testing
package storefake

import (
	"context"
	"fmt"

	"github.com/NickGhignatti/crowd-vision/server/registry/internal/store"
)

type Fake struct {
	orgs   map[string]store.Organization
	nextID int

	// Error hooks: set one to force the corresponding method to fail, so a test
	// can reach the handlers' 500 branches without a real broken database.
	CreateErr           error
	GetErr              error
	PendingErr          error
	SetStatusErr        error
	SetLicenseStatusErr error

	// Every status written, in order. Recorded because some behaviour is only
	// visible in the sequence, not the final row — a provisioner reporting
	// failure must write "failed" once, not "ready" and then "failed".
	StatusWrites []string
}

func New() *Fake {
	return &Fake{orgs: map[string]store.Organization{}}
}

func (f *Fake) Create(_ context.Context, org store.Organization) (store.Organization, error) {
	if f.CreateErr != nil {
		return store.Organization{}, f.CreateErr
	}
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
	if f.GetErr != nil {
		return store.Organization{}, f.GetErr
	}
	org, ok := f.orgs[id]
	if !ok {
		return store.Organization{}, store.ErrNotFound
	}
	return org, nil
}

func (f *Fake) Pending(_ context.Context) ([]store.Organization, error) {
	if f.PendingErr != nil {
		return nil, f.PendingErr
	}
	var out []store.Organization
	for _, org := range f.orgs {
		if org.Status == "provisioning" {
			out = append(out, org)
		}
	}
	return out, nil
}

func (f *Fake) SetStatus(_ context.Context, id, status, detail string) error {
	if f.SetStatusErr != nil {
		return f.SetStatusErr
	}
	f.StatusWrites = append(f.StatusWrites, status)
	org, ok := f.orgs[id]
	if !ok {
		return store.ErrNotFound
	}
	org.Status, org.StatusDetail = status, detail
	f.orgs[id] = org
	return nil
}

func (f *Fake) SetLicenseStatus(_ context.Context, id, licenseStatus string) error {
	if f.SetLicenseStatusErr != nil {
		return f.SetLicenseStatusErr
	}
	org, ok := f.orgs[id]
	if !ok {
		return store.ErrNotFound
	}
	org.LicenseStatus = licenseStatus
	f.orgs[id] = org
	return nil
}

var _ store.Store = (*Fake)(nil)
