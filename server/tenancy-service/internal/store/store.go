// Package store defines the persistence boundary for tenancy-service and its
// Postgres implementation — the equivalent of the Node services' `models/`
// layer, kept behind an interface so `internal/service` can be unit-tested
// without a database.
package store

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("not found")
	// ErrAlreadyExists is returned by CreateDomain on a name collision — the
	// Postgres implementation maps a unique-constraint violation onto this,
	// so a genuine concurrent-create race is distinguishable from any other
	// database error (see service.CreateOwnDomain, which must never silently
	// grant membership in someone else's existing domain).
	ErrAlreadyExists = errors.New("already exists")
	// ErrInviteCodeInvalid covers "doesn't exist", "already redeemed", and
	// "expired" as one signal — a caller trying to redeem reacts to all
	// three identically (deny), and collapsing them avoids leaking which
	// case applied to whoever is holding the code.
	ErrInviteCodeInvalid = errors.New("invite code is invalid, already redeemed, or expired")
)

type Domain struct {
	ID          string
	Name        string
	DisplayName string
	JoinPolicy  string // "open-via-idp" | "invite-only"
	ParentID    string // "" for a top-level domain
	IsPublic    bool   // shows in the public "browse domains" listing
	MemberCount int    // only populated by PublicDomains; 0 (unset) elsewhere
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

// Store is every persistence operation tenancy-service needs. The Postgres
// implementation lives in postgres.go; tests use an in-memory fake
// implementing the same interface (see internal/service's test file).
type Store interface {
	DomainByName(ctx context.Context, name string) (Domain, error)
	CreateDomain(ctx context.Context, d Domain) (Domain, error)
	SubdomainsOf(ctx context.Context, parentID string) ([]Domain, error)

	// PublicDomains lists every is_public domain with its live member count —
	// the "browse domains" directory. One query, not a separate counts
	// round-trip: the client derives per-domain counts from this response.
	PublicDomains(ctx context.Context) ([]Domain, error)

	CreateInviteCode(ctx context.Context, ic InviteCode) (InviteCode, error)

	// RedeemInviteCode is atomic: it only succeeds once, for the first
	// caller, on an unexpired code — a concurrent second redemption attempt
	// gets ErrInviteCodeInvalid, not a partial/racy success.
	RedeemInviteCode(ctx context.Context, code, accountID string) (InviteCode, error)

	// UpsertMembership is idempotent: joining (or being invited into) a
	// domain twice updates the row rather than erroring, so a retried
	// request or a login race is harmless.
	UpsertMembership(ctx context.Context, m Membership) error
	DeleteMembership(ctx context.Context, accountID, domainID string) error
	DeleteMembershipsForAccount(ctx context.Context, accountID string) error

	// MembershipsFor returns every membership for accountID, joined with its
	// domain's name — an empty slice (not an error) for a brand-new user is
	// the expected, valid state that JIT provisioning reacts to.
	MembershipsFor(ctx context.Context, accountID string) ([]Membership, error)

	// MembersOf returns every membership in a domain — used to enforce the
	// "a domain must keep at least one admin" rule when someone leaves or is
	// removed.
	MembersOf(ctx context.Context, domainID string) ([]Membership, error)
}
