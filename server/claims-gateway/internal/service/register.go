package service

import (
	"context"
	"errors"
	"fmt"
)

var (
	// ErrInvalidCredentials means the presented username/password pair does
	// not authenticate — never retried, and distinct from a Keycloak outage.
	ErrInvalidCredentials = errors.New("invalid credentials")

	// ErrEmailTaken is a policy refusal (Keycloak already has a user with
	// this email/username), not a system failure.
	ErrEmailTaken = errors.New("email already registered")

	// ErrUserNotFound means Keycloak has no user for the given ID — should
	// not happen in practice (the ID comes from a verified JWT's sub claim),
	// but distinguished from a generic failure since it is not retryable.
	ErrUserNotFound = errors.New("user not found")

	// ErrKeycloakUnavailable covers any *system* failure talking to
	// Keycloak's token or admin endpoints during password login/registration
	// — as opposed to a rejected login or a taken email, both of which are
	// the caller's fault, not Keycloak's.
	ErrKeycloakUnavailable = errors.New("keycloak unavailable")
)

// PasswordAuthenticator performs a Resource Owner Password Credentials grant
// against Keycloak. This only ever runs server-side (see
// internal/keycloakadmin): the browser never holds Keycloak's confidential
// client secret, so it never talks to Keycloak directly for this flow.
type PasswordAuthenticator interface {
	PasswordGrant(ctx context.Context, username, password string) (idToken string, err error)
}

// UserRegistrar creates a new Keycloak user via the Admin REST API — the only
// way to create a user outside Keycloak's own hosted registration form. name
// is a display name (stored as the Keycloak user's firstName) — optional,
// since it's cosmetic, not part of the account's identity.
type UserRegistrar interface {
	CreateUser(ctx context.Context, email, password, name string) error
}

// WithPasswordAuth wires the optional in-app login/registration dependencies
// onto an already-constructed Gateway. Kept separate from New so the many
// existing Exchange-only tests and call sites don't have to grow two
// unrelated parameters they don't use.
func (g *Gateway) WithPasswordAuth(a PasswordAuthenticator, r UserRegistrar) *Gateway {
	g.authenticator = a
	g.registrar = r
	return g
}

// Login is the in-app equivalent of the redirect+PKCE flow: trade a
// username/password for an ID token via Keycloak's direct grant, then run it
// through the exact same verify -> lookup/JIT-provision -> sign pipeline
// Exchange already implements for the redirect flow.
func (g *Gateway) Login(ctx context.Context, username, password string) (string, error) {
	idToken, err := g.authenticator.PasswordGrant(ctx, username, password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			return "", err
		}
		return "", fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}
	return g.Exchange(ctx, idToken)
}

// Register creates the Keycloak user, then immediately logs it in — one
// client-visible call both creates the account and establishes its session,
// rather than making the client issue a second request.
func (g *Gateway) Register(ctx context.Context, email, password, name string) (string, error) {
	if err := g.registrar.CreateUser(ctx, email, password, name); err != nil {
		if errors.Is(err, ErrEmailTaken) {
			return "", err
		}
		return "", fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}
	return g.Login(ctx, email, password)
}
