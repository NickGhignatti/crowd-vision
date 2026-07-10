package service

import (
	"context"
	"errors"
	"fmt"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

// ProfileReader reads a Keycloak user's current email/display name/picture.
type ProfileReader interface {
	GetUser(ctx context.Context, userID string) (email, name, picture string, err error)
}

// ProfileUpdater patches a Keycloak user's email and/or display name.
type ProfileUpdater interface {
	UpdateUser(ctx context.Context, userID, email, name string) error
}

// PasswordChanger sets a Keycloak user's password directly — the caller
// (Gateway.ChangePassword) is responsible for verifying the current password
// first, since this has no way to do that itself.
type PasswordChanger interface {
	ResetPassword(ctx context.Context, userID, newPassword string) error
}

// WithProfileManagement wires the optional self-service account-settings
// dependencies onto an already-constructed Gateway — kept separate from New
// for the same reason WithPasswordAuth is: most tests and call sites don't
// need them.
func (g *Gateway) WithProfileManagement(r ProfileReader, u ProfileUpdater, p PasswordChanger) *Gateway {
	g.profileReader = r
	g.profileUpdater = u
	g.passwordChanger = p
	return g
}

// Profile returns the account's current email/display name/picture, for
// prefilling the account settings form.
func (g *Gateway) Profile(ctx context.Context, userID string) (email, name, picture string, err error) {
	return g.profileReader.GetUser(ctx, userID)
}

// UpdateProfile changes the account's email and/or display name. email/name
// are each applied only when non-empty, matching ProfileUpdater.UpdateUser's
// contract.
//
// It also re-signs current into a fresh session token carrying the new
// AccountName. Without this, the caller's existing session would keep
// showing the old name (e.g. in the NavBar) until they next log out and back
// in: AccountName is baked into the JWT at login time, and /me only re-serves
// that same cookie's claims — nothing re-reads Keycloak on a page refresh
// (see api.meHandler). name is only applied to current.AccountName when
// non-empty, mirroring UpdateUser's "empty means unchanged" contract — an
// email-only edit must not blank out the display name.
func (g *Gateway) UpdateProfile(ctx context.Context, current authcontracts.StandardClaims, email, name string) (string, error) {
	if err := g.profileUpdater.UpdateUser(ctx, current.Sub, email, name); err != nil {
		if errors.Is(err, ErrEmailTaken) || errors.Is(err, ErrUserNotFound) {
			return "", err
		}
		return "", fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}
	if name != "" {
		current.AccountName = name
	}
	return g.signer.Sign(current, g.ttl)
}

// ChangePassword is a sensitive-change re-auth flow: look up the account's
// current email, verify currentPassword against it via the same
// PasswordAuthenticator the in-app login path uses, and only then reset the
// password — a caller must prove they still hold the old password before
// setting a new one.
func (g *Gateway) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	email, _, _, err := g.profileReader.GetUser(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return err
		}
		return fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}

	if _, err := g.authenticator.PasswordGrant(ctx, email, currentPassword); err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			return err
		}
		return fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}

	if err := g.passwordChanger.ResetPassword(ctx, userID, newPassword); err != nil {
		return fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}
	return nil
}
