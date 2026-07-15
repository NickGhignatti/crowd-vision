package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/store"
)

var (
	ErrDomainNotFound       = errors.New("domain not found")
	ErrInviteOnly           = errors.New("domain is invite-only")
	ErrDomainNameTaken      = errors.New("domain name is already taken")
	ErrInviteCodeInvalid    = store.ErrInviteCodeInvalid
	ErrLastAdminCannotLeave = errors.New("cannot remove the last admin of the domain")
)

const defaultInviteCodeTTL = 7 * 24 * time.Hour

type Service struct {
	store store.Store
}

func New(s store.Store) *Service {
	return &Service{store: s}
}

type CreateDomainInput struct {
	Name        string
	DisplayName string
	JoinPolicy  string // "" defaults to "invite-only"
}

func (s *Service) CreateDomain(ctx context.Context, in CreateDomainInput) (store.Domain, error) {
	if existing, err := s.store.DomainByName(ctx, in.Name); err == nil {
		return existing, nil
	} else if !errors.Is(err, store.ErrNotFound) {
		return store.Domain{}, err
	}

	policy := in.JoinPolicy
	if policy == "" {
		policy = "invite-only"
	}
	return s.store.CreateDomain(ctx, store.Domain{
		Name: in.Name, DisplayName: in.DisplayName, JoinPolicy: policy,
	})
}

type CreateOwnDomainInput struct {
	AccountID   string
	Name        string
	DisplayName string
	JoinPolicy  string // "" defaults to "invite-only" (or "open-via-idp" if IsPublic)
	IsPublic    bool   // whether the domain appears in the public "browse domains" listing
}

func (s *Service) CreateOwnDomain(ctx context.Context, in CreateOwnDomainInput) (store.Domain, error) {
	if _, err := s.store.DomainByName(ctx, in.Name); err == nil {
		return store.Domain{}, ErrDomainNameTaken
	} else if !errors.Is(err, store.ErrNotFound) {
		return store.Domain{}, err
	}

	policy := in.JoinPolicy
	if policy == "" {
		if in.IsPublic {
			policy = "open-via-idp"
		} else {
			policy = "invite-only"
		}
	}
	d, err := s.store.CreateDomain(ctx, store.Domain{
		Name: in.Name, DisplayName: in.DisplayName, JoinPolicy: policy, IsPublic: in.IsPublic,
	})
	if errors.Is(err, store.ErrAlreadyExists) {
		return store.Domain{}, ErrDomainNameTaken
	}
	if err != nil {
		return store.Domain{}, err
	}

	err = s.store.UpsertMembership(ctx, store.Membership{
		AccountID: in.AccountID, DomainID: d.ID, DomainName: d.Name,
		Role: "business_admin", JoinedVia: "local",
	})
	return d, err
}

type CreateSubdomainInput struct {
	ParentDomainName string
	Name             string
	DisplayName      string
	JoinPolicy       string
	IsPublic         bool
}

func (s *Service) CreateSubdomain(ctx context.Context, in CreateSubdomainInput) (store.Domain, error) {
	parent, err := s.store.DomainByName(ctx, in.ParentDomainName)
	if errors.Is(err, store.ErrNotFound) {
		return store.Domain{}, ErrDomainNotFound
	}
	if err != nil {
		return store.Domain{}, err
	}

	if _, err := s.store.DomainByName(ctx, in.Name); err == nil {
		return store.Domain{}, ErrDomainNameTaken
	} else if !errors.Is(err, store.ErrNotFound) {
		return store.Domain{}, err
	}

	policy := in.JoinPolicy
	if policy == "" {
		if in.IsPublic {
			policy = "open-via-idp"
		} else {
			policy = "invite-only"
		}
	}
	d, err := s.store.CreateDomain(ctx, store.Domain{
		Name: in.Name, DisplayName: in.DisplayName, JoinPolicy: policy, ParentID: parent.ID, IsPublic: in.IsPublic,
	})
	if errors.Is(err, store.ErrAlreadyExists) {
		return store.Domain{}, ErrDomainNameTaken
	}
	return d, err
}

// ListSubdomains returns only direct children — matching the original
// model's shallow `subdomains` array; deeper nesting was never supported.
func (s *Service) ListSubdomains(ctx context.Context, parentDomainName string) ([]store.Domain, error) {
	parent, err := s.store.DomainByName(ctx, parentDomainName)
	if errors.Is(err, store.ErrNotFound) {
		return nil, ErrDomainNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.store.SubdomainsOf(ctx, parent.ID)
}

func (s *Service) PublicDomains(ctx context.Context) ([]store.Domain, error) {
	return s.store.PublicDomains(ctx)
}

type CreateInviteCodeInput struct {
	DomainName string
	Role       string
	CreatedBy  string
	TTL        time.Duration // <=0 defaults to 7 days
}

func (s *Service) CreateInviteCode(ctx context.Context, in CreateInviteCodeInput) (store.InviteCode, error) {
	d, err := s.store.DomainByName(ctx, in.DomainName)
	if errors.Is(err, store.ErrNotFound) {
		return store.InviteCode{}, ErrDomainNotFound
	}
	if err != nil {
		return store.InviteCode{}, err
	}

	ttl := in.TTL
	if ttl <= 0 {
		ttl = defaultInviteCodeTTL
	}
	code, err := generateInviteCode()
	if err != nil {
		return store.InviteCode{}, err
	}

	return s.store.CreateInviteCode(ctx, store.InviteCode{
		DomainID: d.ID, Code: code, Role: in.Role, CreatedBy: in.CreatedBy,
		ExpiresAt: time.Now().Add(ttl),
	})
}

func (s *Service) RedeemInviteCode(ctx context.Context, code, accountID string) error {
	ic, err := s.store.RedeemInviteCode(ctx, code, accountID)
	if err != nil {
		return err // store.ErrInviteCodeInvalid passes through unwrapped
	}
	return s.store.UpsertMembership(ctx, store.Membership{
		AccountID: accountID, DomainID: ic.DomainID, DomainName: ic.DomainName,
		Role: ic.Role, JoinedVia: "invite",
	})
}

func generateInviteCode() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

type JoinInput struct {
	AccountID  string
	DomainName string
	Role       string
	ExternalID string
}

func (s *Service) Join(ctx context.Context, in JoinInput) error {
	d, err := s.store.DomainByName(ctx, in.DomainName)
	if errors.Is(err, store.ErrNotFound) {
		return ErrDomainNotFound
	}
	if err != nil {
		return err
	}
	if d.JoinPolicy != "open-via-idp" {
		return ErrInviteOnly
	}
	return s.store.UpsertMembership(ctx, store.Membership{
		AccountID: in.AccountID, DomainID: d.ID, DomainName: d.Name,
		Role: in.Role, ExternalID: in.ExternalID, JoinedVia: "self-idp",
	})
}

type InviteInput struct {
	AccountID  string
	DomainName string
	Role       string
}

func (s *Service) Invite(ctx context.Context, in InviteInput) error {
	d, err := s.store.DomainByName(ctx, in.DomainName)
	if errors.Is(err, store.ErrNotFound) {
		return ErrDomainNotFound
	}
	if err != nil {
		return err
	}
	return s.store.UpsertMembership(ctx, store.Membership{
		AccountID: in.AccountID, DomainID: d.ID, DomainName: d.Name,
		Role: in.Role, JoinedVia: "invite",
	})
}

func (s *Service) Leave(ctx context.Context, accountID, domainName string) error {
	d, err := s.store.DomainByName(ctx, domainName)
	if errors.Is(err, store.ErrNotFound) {
		return ErrDomainNotFound
	}
	if err != nil {
		return err
	}

	members, err := s.store.MembersOf(ctx, d.ID)
	if err != nil {
		return err
	}
	admins, targetIsAdmin := 0, false
	for _, m := range members {
		if authcontracts.Can(m.Role, "business_admin") {
			admins++
			if m.AccountID == accountID {
				targetIsAdmin = true
			}
		}
	}
	if targetIsAdmin && admins <= 1 {
		return ErrLastAdminCannotLeave
	}

	return s.store.DeleteMembership(ctx, accountID, d.ID)
}

func (s *Service) MembershipsFor(ctx context.Context, accountID string) ([]authcontracts.Membership, error) {
	rows, err := s.store.MembershipsFor(ctx, accountID)
	if err != nil {
		return nil, err
	}
	out := make([]authcontracts.Membership, len(rows))
	for i, r := range rows {
		out[i] = authcontracts.Membership{Domain: r.DomainName, Role: r.Role, ExternalID: r.ExternalID}
	}
	return out, nil
}

func (s *Service) ReapAccount(ctx context.Context, accountID string) error {
	return s.store.DeleteMembershipsForAccount(ctx, accountID)
}
