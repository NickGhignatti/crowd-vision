package store

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound          = errors.New("not found")
	ErrAlreadyExists     = errors.New("already exists")
	ErrInviteCodeInvalid = errors.New("invite code is invalid, already redeemed, or expired")
)

type Domain struct {
	ID          string
	Name        string
	DisplayName string
	JoinPolicy  string // "open-via-idp" | "invite-only"
	ParentID    string
	IsPublic    bool // shows in the public "browse domains" listing
	MemberCount int
}

type InviteCode struct {
	ID         string
	DomainID   string
	DomainName string // populated by lookups that join domains; empty on create
	Code       string
	Role       string
	CreatedBy  string
	ExpiresAt  time.Time
	RedeemedBy string // "" until redeemed
}

type Membership struct {
	AccountID  string
	DomainID   string
	DomainName string
	Role       string
	ExternalID string
	JoinedVia  string // "self-idp" | "invite" | "local"
}

type Store interface {
	DomainByName(ctx context.Context, name string) (Domain, error)
	CreateDomain(ctx context.Context, d Domain) (Domain, error)
	SubdomainsOf(ctx context.Context, parentID string) ([]Domain, error)
	PublicDomains(ctx context.Context) ([]Domain, error)
	CreateInviteCode(ctx context.Context, ic InviteCode) (InviteCode, error)
	RedeemInviteCode(ctx context.Context, code, accountID string) (InviteCode, error)
	UpsertMembership(ctx context.Context, m Membership) error
	DeleteMembership(ctx context.Context, accountID, domainID string) error
	DeleteMembershipsForAccount(ctx context.Context, accountID string) error
	MembershipsFor(ctx context.Context, accountID string) ([]Membership, error)
	MembersOf(ctx context.Context, domainID string) ([]Membership, error)
}
