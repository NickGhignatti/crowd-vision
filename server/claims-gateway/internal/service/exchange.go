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
	ErrInvalidIDToken     = errors.New("invalid id token")
	ErrTenancyUnavailable = errors.New("tenancy unavailable")
	ErrInviteOnly         = errors.New("domain is invite-only")
)

// IDTokenClaims is what the gateway needs out of a verified IdP token.
type IDTokenClaims struct {
	Sub               string
	PreferredUsername string
	Name              string // Keycloak's "full name" claim; "" if the account has no first/last name set
	EmailVerified     bool
	Organization      string // Keycloak Organizations claim; "" if the user belongs to none yet
	Roles             []string
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

	// authenticator/registrar back the in-app password login/registration path.
	authenticator PasswordAuthenticator
	registrar     UserRegistrar

	// profileReader/profileUpdater/passwordChanger back the self-service account settings path.
	profileReader   ProfileReader
	profileUpdater  ProfileUpdater
	passwordChanger PasswordChanger
}

func New(v Verifier, t TenancyClient, s Signer, ttl time.Duration) *Gateway {
	return &Gateway{verifier: v, tenancy: t, signer: s, ttl: ttl}
}

// Exchange is the whole login: verify -> lookup (JIT-provisioning on first login) -> mint.
// It is the only place these three steps are stitched together.
func (g *Gateway) Exchange(ctx context.Context, rawIDToken string) (string, error) {
	kc, err := g.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidIDToken, err)
	}

	memberships, err := g.tenancy.MembershipsFor(ctx, kc.Sub)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrTenancyUnavailable, err)
	}

	// The tenancy service has no record but keycloak does.
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

func (g *Gateway) RefreshSession(ctx context.Context, current authcontracts.StandardClaims) (string, error) {
	memberships, err := g.tenancy.MembershipsFor(ctx, current.Sub)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrTenancyUnavailable, err)
	}
	current.Memberships = memberships
	return g.signer.Sign(current, g.ttl)
}

func accountName(kc IDTokenClaims) string {
	if kc.Name != "" {
		return kc.Name
	}
	return kc.PreferredUsername
}

// If no memberships exist yet and the token carries an Organization claim.
func (g *Gateway) provisionOnFirstLogin(ctx context.Context, kc IDTokenClaims) ([]authcontracts.Membership, error) {
	role := HighestRole(kc.Roles)
	err := g.tenancy.Provision(ctx, ProvisionRequest{
		AccountID: kc.Sub, DomainName: kc.Organization, Role: role, ExternalID: kc.Sub,
	})
	switch {
	case err == nil:
		return []authcontracts.Membership{{Domain: kc.Organization, Role: role}}, nil
	case errors.Is(err, ErrInviteOnly):
		return []authcontracts.Membership{}, nil
	default:
		return nil, fmt.Errorf("%w: %v", ErrTenancyUnavailable, err)
	}
}

func HighestRole(roles []string) string {
	best, bestWeight := "standard_customer", authcontracts.RoleWeights["standard_customer"]
	for _, r := range roles {
		if w, ok := authcontracts.RoleWeights[r]; ok && w > bestWeight {
			best, bestWeight = r, w
		}
	}
	return best
}
