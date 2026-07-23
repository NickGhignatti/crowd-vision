package service

import (
	"context"
	"errors"
	"fmt"
)

var (
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrEmailTaken          = errors.New("email already registered")
	ErrUserNotFound        = errors.New("user not found")
	ErrKeycloakUnavailable = errors.New("keycloak unavailable")
)

// Performs a Resource Owner Password Credentials grant against Keycloak.
type PasswordAuthenticator interface {
	PasswordGrant(ctx context.Context, username, password string) (idToken string, err error)
}

// Creates a new Keycloak user via the Admin REST API.
type UserRegistrar interface {
	CreateUser(ctx context.Context, email, password, name string) error
}

// Wires the optional in-app login/registration dependencies onto an already-constructed Gateway.
func (g *Gateway) WithPasswordAuth(a PasswordAuthenticator, r UserRegistrar) *Gateway {
	g.authenticator = a
	g.registrar = r
	return g
}

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

func (g *Gateway) Register(ctx context.Context, email, password, name string) (string, error) {
	if err := g.registrar.CreateUser(ctx, email, password, name); err != nil {
		if errors.Is(err, ErrEmailTaken) {
			return "", err
		}
		return "", fmt.Errorf("%w: %v", ErrKeycloakUnavailable, err)
	}
	return g.Login(ctx, email, password)
}
