// Package oidcverifier implements service.Verifier against a real OIDC provider
// (Keycloak or a customer's own IdP) — the only package that speaks OIDC.
package oidcverifier

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"

	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

type Verifier struct {
	inner *oidc.IDTokenVerifier
}

// New validates tokens' `iss` against issuerURL (it differs from discoveryURL across
// internal/browser hosts) and fetches JWKS manually so jwks_uri can be rewritten onto discoveryURL's host.
func New(ctx context.Context, discoveryURL, issuerURL, clientID string) (*Verifier, error) {
	jwksURL, err := discoverJWKSURL(ctx, discoveryURL)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery against %q: %w", discoveryURL, err)
	}
	keySet := oidc.NewRemoteKeySet(ctx, jwksURL)
	verifier := oidc.NewVerifier(issuerURL, keySet, &oidc.Config{ClientID: clientID})
	return &Verifier{inner: verifier}, nil
}

func discoverJWKSURL(ctx context.Context, discoveryURL string) (string, error) {
	docURL := strings.TrimSuffix(discoveryURL, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, docURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching %q: %w", docURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetching %q: status %d", docURL, resp.StatusCode)
	}

	var doc struct {
		JWKSURI string `json:"jwks_uri"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return "", fmt.Errorf("decoding discovery document: %w", err)
	}
	if doc.JWKSURI == "" {
		return "", fmt.Errorf("discovery document has no jwks_uri")
	}

	// Rewrite jwks_uri onto discoveryURL's scheme+host — the discovery doc may
	// advertise an external hostname this process can't route to.
	discU, err := url.Parse(discoveryURL)
	if err != nil {
		return "", err
	}
	jwksU, err := url.Parse(doc.JWKSURI)
	if err != nil {
		return "", fmt.Errorf("parsing jwks_uri %q: %w", doc.JWKSURI, err)
	}
	jwksU.Scheme, jwksU.Host = discU.Scheme, discU.Host
	return jwksU.String(), nil
}

func (v *Verifier) Verify(ctx context.Context, rawIDToken string) (service.IDTokenClaims, error) {
	tok, err := v.inner.Verify(ctx, rawIDToken)
	if err != nil {
		return service.IDTokenClaims{}, err
	}

	var raw struct {
		PreferredUsername string `json:"preferred_username"`
		// Name is Keycloak's "full name" mapper output (firstName+lastName),
		// set by Google brokering and by registration (see keycloakadmin).
		Name          string   `json:"name"`
		EmailVerified bool     `json:"email_verified"`
		Organization  []string `json:"organization"`
		Roles         []string `json:"roles"`
	}
	if err := tok.Claims(&raw); err != nil {
		return service.IDTokenClaims{}, fmt.Errorf("decoding id token claims: %w", err)
	}

	return service.IDTokenClaims{
		Sub:               tok.Subject,
		PreferredUsername: raw.PreferredUsername,
		Name:              raw.Name,
		EmailVerified:     raw.EmailVerified,
		Organization:      firstOrganizationName(raw.Organization),
		Roles:             raw.Roles,
	}, nil
}

// firstOrganizationName narrows Keycloak's `organization` claim (a JSON array of
// org names, not a map) to one; the gateway JIT-provisions the first it sees.
func firstOrganizationName(orgs []string) string {
	if len(orgs) == 0 {
		return ""
	}
	return orgs[0]
}

var _ service.Verifier = (*Verifier)(nil)
