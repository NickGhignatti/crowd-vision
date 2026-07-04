// Package storefake is an in-memory store.Store, used to unit-test
// internal/service and internal/api without a database — the Go analogue of
// mongodb-memory-server for the Node services, minus the real engine.
package storefake

import (
	"context"
	"fmt"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/store"
)

type Fake struct {
	domains     map[string]store.Domain     // by name
	memberships map[string]store.Membership // by accountID+domainID
	inviteCodes map[string]store.InviteCode // by code
	nextID      int
}

func New() *Fake {
	return &Fake{
		domains:     map[string]store.Domain{},
		memberships: map[string]store.Membership{},
		inviteCodes: map[string]store.InviteCode{},
	}
}

func key(accountID, domainID string) string { return accountID + "|" + domainID }

func (f *Fake) DomainByName(_ context.Context, name string) (store.Domain, error) {
	d, ok := f.domains[name]
	if !ok {
		return store.Domain{}, store.ErrNotFound
	}
	return d, nil
}

func (f *Fake) CreateDomain(_ context.Context, d store.Domain) (store.Domain, error) {
	if _, exists := f.domains[d.Name]; exists {
		return store.Domain{}, store.ErrAlreadyExists
	}
	if d.ID == "" {
		f.nextID++
		d.ID = fmt.Sprintf("domain-%d", f.nextID)
	}
	f.domains[d.Name] = d
	return d, nil
}

func (f *Fake) SubdomainsOf(_ context.Context, parentID string) ([]store.Domain, error) {
	var out []store.Domain
	for _, d := range f.domains {
		if d.ParentID == parentID {
			out = append(out, d)
		}
	}
	return out, nil
}

func (f *Fake) PublicDomains(_ context.Context) ([]store.Domain, error) {
	counts := map[string]int{}
	for _, m := range f.memberships {
		counts[m.DomainID]++
	}

	var out []store.Domain
	for _, d := range f.domains {
		if !d.IsPublic {
			continue
		}
		d.MemberCount = counts[d.ID]
		out = append(out, d)
	}
	return out, nil
}

func (f *Fake) CreateInviteCode(_ context.Context, ic store.InviteCode) (store.InviteCode, error) {
	if ic.ID == "" {
		f.nextID++
		ic.ID = fmt.Sprintf("invite-%d", f.nextID)
	}
	f.inviteCodes[ic.Code] = ic
	return ic, nil
}

func (f *Fake) RedeemInviteCode(_ context.Context, code, accountID string) (store.InviteCode, error) {
	ic, ok := f.inviteCodes[code]
	if !ok || ic.RedeemedBy != "" || time.Now().After(ic.ExpiresAt) {
		return store.InviteCode{}, store.ErrInviteCodeInvalid
	}
	ic.RedeemedBy = accountID
	f.inviteCodes[code] = ic

	for _, d := range f.domains {
		if d.ID == ic.DomainID {
			ic.DomainName = d.Name
			break
		}
	}
	return ic, nil
}

// ExpireInviteCodeForTests backdates a code's expiry — the fake has no real
// clock to manipulate, so tests that need an expired code go through this
// instead of sleeping.
func (f *Fake) ExpireInviteCodeForTests(code string) {
	ic := f.inviteCodes[code]
	ic.ExpiresAt = time.Now().Add(-time.Hour)
	f.inviteCodes[code] = ic
}

func (f *Fake) UpsertMembership(_ context.Context, m store.Membership) error {
	f.memberships[key(m.AccountID, m.DomainID)] = m
	return nil
}

func (f *Fake) DeleteMembership(_ context.Context, accountID, domainID string) error {
	delete(f.memberships, key(accountID, domainID))
	return nil
}

func (f *Fake) DeleteMembershipsForAccount(_ context.Context, accountID string) error {
	for k, m := range f.memberships {
		if m.AccountID == accountID {
			delete(f.memberships, k)
		}
	}
	return nil
}

func (f *Fake) MembershipsFor(_ context.Context, accountID string) ([]store.Membership, error) {
	var out []store.Membership
	for _, m := range f.memberships {
		if m.AccountID == accountID {
			out = append(out, m)
		}
	}
	return out, nil
}

var _ store.Store = (*Fake)(nil)
