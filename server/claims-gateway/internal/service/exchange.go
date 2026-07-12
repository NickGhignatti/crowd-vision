// Package service is claims-gateway's core: verify an IdP-issued ID token,
// look up (or JIT-provision) tenancy, and mint the one internal token shape
// every product service trusts. It depends only on three small interfaces
// (Verifier, TenancyClient, Signer), so the whole exchange is unit-tested
// without a live Keycloak, tenancy-service, or signing key.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

var (
	// ErrInvalidIDToken means the caller isn't who they claim to be — never
	// retried, never soft-continued.
	ErrInvalidIDToken = errors.New("invalid id token")

	// ErrTenancyUnavailable covers any *system* failure talking to
	// tenancy-service (network, 5xx). The gateway fails closed on this: a
	// login you can't verify tenancy for is a denied login, not a degraded
	// one — see the plan's gate G-GATEWAY-FAIL.
	ErrTenancyUnavailable = errors.New("tenancy unavailable")

	// ErrInviteOnly is a *policy* refusal (the target domain doesn't allow
	// self-service joins), not a system failure — the login still succeeds,
	// just without that membership. TenancyClient.Provision must return
	// exactly this sentinel (or one wrapping it) for a 403/invite-only
	// response so Exchange can tell the two apart.
	ErrInviteOnly = errors.New("domain is invite-only")
)

// IDTokenClaims is what the gateway needs out of a verified IdP token —
// deliberately smaller than the full OIDC claim set.
type IDTokenClaims struct {
	Sub               string
	PreferredUsername string
	Name              string // Keycloak's "full name" claim; "" if the account has no first/last name set
	EmailVerified     bool
	Organization      string   // Keycloak Organizations claim; "" if the user belongs to none yet
	Roles             []string // realm roles, noisy (includes Keycloak's own defaults)
}

type Verifier interface {
	Verify(ctx context.Context, rawIDToken string) (IDTokenClaims, error)
}

type ProvisionRequest struct {
	AccountID  string
	DomainName string
	Role       string
	ExternalID string
}

type TenancyClient interface {
	MembershipsFor(ctx context.Context, accountID string) ([]authcontracts.Membership, error)
	Provision(ctx context.Context, req ProvisionRequest) error
}

type Signer interface {
	Sign(claims authcontracts.StandardClaims, ttl time.Duration) (string, error)
}

type Gateway struct {
	verifier Verifier
	tenancy  TenancyClient
	signer   Signer
	ttl      time.Duration

	// authenticator/registrar back the in-app password login/registration
	// path (see register.go's WithPasswordAuth) — nil unless wired, since
	// only claims-gateway's real main.go needs them.
	authenticator PasswordAuthenticator
	registrar     UserRegistrar

	// profileReader/profileUpdater/passwordChanger back the self-service
	// account settings path (see profile.go's WithProfileManagement) — nil
	// unless wired, same reasoning as above.
	profileReader   ProfileReader
	profileUpdater  ProfileUpdater
	passwordChanger PasswordChanger
}

func New(v Verifier, t TenancyClient, s Signer, ttl time.Duration) *Gateway {
	return &Gateway{verifier: v, tenancy: t, signer: s, ttl: ttl}
}

// Exchange is the whole login: verify -> lookup (JIT-provisioning on first
// login) -> mint. It is the only place these three steps are stitched
// together — every other package only implements one of them.
func (g *Gateway) Exchange(ctx context.Context, rawIDToken string) (string, error) {
	kc, err := g.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidIDToken, err)
	}

	memberships, err := g.tenancy.MembershipsFor(ctx, kc.Sub)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrTenancyUnavailable, err)
	}

	if len(memberships) == 0 && kc.Organization != "" {
		memberships, err = g.provisionOnFirstLogin(ctx, kc)
		if err != nil {
			return "", err
		}
	}

	return g.signer.Sign(authcontracts.StandardClaims{
		Sub:         kc.Sub,
		AccountName: accountName(kc),
		SID:         uuid.NewString(),
		Memberships: memberships,
	}, g.ttl)
}

// RefreshSession re-mints the session token for an already-authenticated
// caller so membership changes made mid-session (e.g. a domain just created,
// or one just joined) take effect without a full logout/login. Memberships are
// baked into the JWT at login and never re-read per request (see
// tenancy.Service.MembershipsFor), so a token minted before the change can't
// authorize against the new domain. Unlike Exchange this does NOT re-verify an
// IdP token — authmiddleware already validated the current cookie before this
// runs — it only re-reads tenancy and re-signs, preserving Sub/AccountName/SID.
func (g *Gateway) RefreshSession(ctx context.Context, current authcontracts.StandardClaims) (string, error) {
	memberships, err := g.tenancy.MembershipsFor(ctx, current.Sub)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrTenancyUnavailable, err)
	}
	current.Memberships = memberships
	return g.signer.Sign(current, g.ttl)
}

// accountName prefers the display name (Keycloak's "full name" claim) over
// the bare username/email — falling back cleanly for any account that
// doesn't have one set yet.
func accountName(kc IDTokenClaims) string {
	if kc.Name != "" {
		return kc.Name
	}
	return kc.PreferredUsername
}

// provisionOnFirstLogin is the lazy-provisioning decision (G-MEMBERSHIP):
// Keycloak is the source of truth, and a membership is a projection derived
// from it on demand — never written at registration, which would be a
// distributed write across two systems with no shared transaction.
func (g *Gateway) provisionOnFirstLogin(ctx context.Context, kc IDTokenClaims) ([]authcontracts.Membership, error) {
	role := HighestRole(kc.Roles)
	err := g.tenancy.Provision(ctx, ProvisionRequest{
		AccountID: kc.Sub, DomainName: kc.Organization, Role: role, ExternalID: kc.Sub,
	})
	switch {
	case err == nil:
		return []authcontracts.Membership{{Domain: kc.Organization, Role: role}}, nil
	case errors.Is(err, ErrInviteOnly):
		// Policy said no — the login still succeeds, just with no
		// membership yet (the user needs an explicit invite instead).
		return []authcontracts.Membership{}, nil
	default:
		return nil, fmt.Errorf("%w: %v", ErrTenancyUnavailable, err)
	}
}

// HighestRole picks the strongest role auth-contracts recognizes out of a
// Keycloak realm-role list, which is noisy by default (offline_access,
// default-roles-<realm>, uma_authorization are always present). Unrecognized
// names carry no weight, so they can never win over a real role — including
// against the zero-value initial best, which is why the floor is
// standard_customer, not empty.
func HighestRole(roles []string) string {
	best, bestWeight := "standard_customer", authcontracts.RoleWeights["standard_customer"]
	for _, r := range roles {
		if w, ok := authcontracts.RoleWeights[r]; ok && w > bestWeight {
			best, bestWeight = r, w
		}
	}
	return best
}
