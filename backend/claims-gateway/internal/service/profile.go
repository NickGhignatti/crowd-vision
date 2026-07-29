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

// PasswordChanger sets a Keycloak user's password directly — the caller is responsible
// for verifying the current password first, since this has no way to do that itself.
type PasswordChanger interface {
	ResetPassword(ctx context.Context, userID, newPassword string) error
}

// WithProfileManagement wires the optional self-service account-settings
// dependencies onto an already-constructed Gateway.
func (g *Gateway) WithProfileManagement(r ProfileReader, u ProfileUpdater, p PasswordChanger) *Gateway {
	g.profileReader = r
	g.profileUpdater = u
	g.passwordChanger = p
	return g
}

func (g *Gateway) Profile(ctx context.Context, userID string) (email, name, picture string, err error) {
	return g.profileReader.GetUser(ctx, userID)
}

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

	// Re-sign with updated claims
	return g.signer.Sign(current, g.ttl)
}

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
