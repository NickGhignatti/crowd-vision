package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/store"
)

var (
	ErrDomainNotFound       = errors.New("domain not found")
	ErrInviteOnly           = errors.New("domain is invite-only")
	ErrDomainNameTaken      = errors.New("domain name is already taken")
	ErrInviteCodeInvalid    = store.ErrInviteCodeInvalid
	ErrLastAdminCannotLeave = errors.New("cannot remove the last admin of the domain")
	ErrMemberOutranksActor  = errors.New("member holds a higher role than you")
	ErrUnknownRole          = errors.New("unknown role")
	ErrRoleNotGrantable     = errors.New("role is above what this route may grant")
)

const defaultInviteCodeTTL = 7 * 24 * time.Hour

// Managers hold at least business_admin, so no grant exceeds the granter's role.
// admin only arrives through the identity provider (Join).
const (
	inviteCeiling   = "business_admin"
	selfJoinCeiling = "standard_customer"
)

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
	d, err := s.store.CreateDomain(ctx, store.Domain{
		Name: in.Name, DisplayName: in.DisplayName, JoinPolicy: policy,
	})
	// The existence check above and this insert are separate statements, so a
	// concurrent creator can win in between and the unique constraint fires here
	// instead. Same outcome, later: report it as the name being taken, like
	// CreateOwnDomain and CreateSubdomain do. Leaving it as the raw store error
	// makes writeErr answer 500, and provisioner treats anything but 201/409 as a
	// failed reconcile (tenancyclient/client.go) — so a race would mark an
	// organization failed over a domain that exists.
	if errors.Is(err, store.ErrAlreadyExists) {
		return store.Domain{}, ErrDomainNameTaken
	}
	return d, err
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
	if err := checkGrantable(in.Role, inviteCeiling); err != nil {
		return store.InviteCode{}, err
	}
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
		return err
	}
	if err := checkGrantable(ic.Role, inviteCeiling); err != nil {
		return err
	}
	return s.store.UpsertMembership(ctx, store.Membership{
		AccountID: accountID, DomainID: ic.DomainID, DomainName: ic.DomainName,
		Role: ic.Role, JoinedVia: "invite",
	})
}

func checkGrantable(role, ceiling string) error {
	weight, ok := authcontracts.RoleWeights[role]
	if !ok {
		return ErrUnknownRole
	}
	if weight > authcontracts.RoleWeights[ceiling] {
		return ErrRoleNotGrantable
	}
	return nil
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

// SelfJoin is the end-user join: the role is capped at standard_customer, and an
// empty one means that. Join trusts the role it is given.
func (s *Service) SelfJoin(ctx context.Context, in JoinInput) error {
	if in.Role == "" {
		in.Role = selfJoinCeiling
	}
	if err := checkGrantable(in.Role, selfJoinCeiling); err != nil {
		return err
	}
	return s.Join(ctx, in)
}

type InviteInput struct {
	AccountID  string
	DomainName string
	Role       string
	ActorRole  string // the caller's own role in the domain
}

func (s *Service) Invite(ctx context.Context, in InviteInput) error {
	if err := checkGrantable(in.Role, inviteCeiling); err != nil {
		return err
	}
	d, err := s.store.DomainByName(ctx, in.DomainName)
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
	if outranks(roleOf(members, in.AccountID), in.ActorRole) {
		return ErrMemberOutranksActor
	}
	if !authcontracts.Can(in.Role, "business_admin") && isLastManager(members, in.AccountID) {
		return ErrLastAdminCannotLeave
	}
	return s.store.UpsertMembership(ctx, store.Membership{
		AccountID: in.AccountID, DomainID: d.ID, DomainName: d.Name,
		Role: in.Role, JoinedVia: "invite",
	})
}

func (s *Service) Leave(ctx context.Context, accountID, domainName string) error {
	d, members, err := s.domainMembers(ctx, domainName)
	if err != nil {
		return err
	}
	return s.drop(ctx, d, members, accountID)
}

// Remove takes someone else out of a domain. It is not Leave with a flag: the
// actor's role is a required argument, so an empty one cannot skip the rank check.
func (s *Service) Remove(ctx context.Context, actorRole, accountID, domainName string) error {
	d, members, err := s.domainMembers(ctx, domainName)
	if err != nil {
		return err
	}
	if outranks(roleOf(members, accountID), actorRole) {
		return ErrMemberOutranksActor
	}
	return s.drop(ctx, d, members, accountID)
}

func (s *Service) domainMembers(ctx context.Context, domainName string) (store.Domain, []store.Membership, error) {
	d, err := s.store.DomainByName(ctx, domainName)
	if errors.Is(err, store.ErrNotFound) {
		return store.Domain{}, nil, ErrDomainNotFound
	}
	if err != nil {
		return store.Domain{}, nil, err
	}
	members, err := s.store.MembersOf(ctx, d.ID)
	return d, members, err
}

func (s *Service) drop(ctx context.Context, d store.Domain, members []store.Membership, accountID string) error {
	if isLastManager(members, accountID) {
		return ErrLastAdminCannotLeave
	}
	return s.store.DeleteMembership(ctx, accountID, d.ID)
}

func roleOf(members []store.Membership, accountID string) string {
	for _, m := range members {
		if m.AccountID == accountID {
			return m.Role
		}
	}
	return ""
}

func outranks(role, than string) bool {
	return authcontracts.RoleWeights[role] > authcontracts.RoleWeights[than]
}

func isLastManager(members []store.Membership, accountID string) bool {
	managers, isManager := 0, false
	for _, m := range members {
		if authcontracts.Can(m.Role, "business_admin") {
			managers++
			isManager = isManager || m.AccountID == accountID
		}
	}
	return isManager && managers <= 1
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
