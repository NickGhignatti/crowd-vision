package storefake

import (
	"context"
	"fmt"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/store"
)

type Fake struct {
	domains     map[string]store.Domain     // by name
	memberships map[string]store.Membership // by accountID+domainID
	inviteCodes map[string]store.InviteCode // by code
	nextID      int

	// FailOn forces one method to return an error, keyed by method name, so a
	// test can drive a handler's 500 branch without a genuinely broken database.
	// A map rather than a field per method: the interface has eleven of them.
	FailOn map[string]error
}

func (f *Fake) fail(method string) error { return f.FailOn[method] }

func New() *Fake {
	return &Fake{
		domains:     map[string]store.Domain{},
		memberships: map[string]store.Membership{},
		inviteCodes: map[string]store.InviteCode{},
	}
}

func key(accountID, domainID string) string { return accountID + "|" + domainID }

func (f *Fake) DomainByName(_ context.Context, name string) (store.Domain, error) {
	// Also addressable per name ("DomainByName:eng"): CreateSubdomain looks the
	// parent up and then the new name, and only the second lookup failing is what
	// distinguishes its store-error branch from its not-found branch.
	if err := f.fail("DomainByName:" + name); err != nil {
		return store.Domain{}, err
	}
	if err := f.fail("DomainByName"); err != nil {
		return store.Domain{}, err
	}
	d, ok := f.domains[name]
	if !ok {
		return store.Domain{}, store.ErrNotFound
	}
	return d, nil
}

func (f *Fake) CreateDomain(_ context.Context, d store.Domain) (store.Domain, error) {
	if err := f.fail("CreateDomain"); err != nil {
		return store.Domain{}, err
	}
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
	if err := f.fail("SubdomainsOf"); err != nil {
		return nil, err
	}
	var out []store.Domain
	for _, d := range f.domains {
		if d.ParentID == parentID {
			out = append(out, d)
		}
	}
	return out, nil
}

func (f *Fake) PublicDomains(_ context.Context) ([]store.Domain, error) {
	if err := f.fail("PublicDomains"); err != nil {
		return nil, err
	}
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
	if err := f.fail("CreateInviteCode"); err != nil {
		return store.InviteCode{}, err
	}
	if ic.ID == "" {
		f.nextID++
		ic.ID = fmt.Sprintf("invite-%d", f.nextID)
	}
	f.inviteCodes[ic.Code] = ic
	return ic, nil
}

func (f *Fake) RedeemInviteCode(_ context.Context, code, accountID string) (store.InviteCode, error) {
	if err := f.fail("RedeemInviteCode"); err != nil {
		return store.InviteCode{}, err
	}
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

func (f *Fake) ExpireInviteCodeForTests(code string) {
	ic := f.inviteCodes[code]
	ic.ExpiresAt = time.Now().Add(-time.Hour)
	f.inviteCodes[code] = ic
}

func (f *Fake) UpsertMembership(_ context.Context, m store.Membership) error {
	if err := f.fail("UpsertMembership"); err != nil {
		return err
	}
	f.memberships[key(m.AccountID, m.DomainID)] = m
	return nil
}

func (f *Fake) DeleteMembership(_ context.Context, accountID, domainID string) error {
	if err := f.fail("DeleteMembership"); err != nil {
		return err
	}
	delete(f.memberships, key(accountID, domainID))
	return nil
}

func (f *Fake) DeleteMembershipsForAccount(_ context.Context, accountID string) error {
	if err := f.fail("DeleteMembershipsForAccount"); err != nil {
		return err
	}
	for k, m := range f.memberships {
		if m.AccountID == accountID {
			delete(f.memberships, k)
		}
	}
	return nil
}

func (f *Fake) MembershipsFor(_ context.Context, accountID string) ([]store.Membership, error) {
	if err := f.fail("MembershipsFor"); err != nil {
		return nil, err
	}
	var out []store.Membership
	for _, m := range f.memberships {
		if m.AccountID == accountID {
			out = append(out, m)
		}
	}
	return out, nil
}

func (f *Fake) MembersOf(_ context.Context, domainID string) ([]store.Membership, error) {
	if err := f.fail("MembersOf"); err != nil {
		return nil, err
	}
	var out []store.Membership
	for _, m := range f.memberships {
		if m.DomainID == domainID {
			out = append(out, m)
		}
	}
	return out, nil
}

var _ store.Store = (*Fake)(nil)
