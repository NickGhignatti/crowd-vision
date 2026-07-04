// Package oidcverifier implements service.Verifier against a real OIDC
// provider (Keycloak, or an on-prem customer's own IdP — same code path for
// both, per the design). It is the only package that speaks OIDC; the rest
// of the gateway only knows about the small IDTokenClaims shape.
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

// New performs OIDC discovery against discoveryURL (fetching
// .well-known/openid-configuration) once, at startup, but validates tokens'
// `iss` claim against issuerURL. These deliberately differ in a container
// deployment: the gateway reaches Keycloak over the internal Docker network
// (discoveryURL, e.g. http://keycloak:8080/realms/crowdvision) while
// browsers — and therefore the tokens Keycloak mints — use the
// externally-visible hostname (issuerURL, e.g.
// https://id.crowdvision.app/realms/crowdvision). Pass the same value for
// both in a single-hostname deployment. clientID is the audience every
// accepted ID token must carry.
//
// This does NOT use oidc.NewProvider, deliberately: when an IdP has a fixed
// public hostname configured (Keycloak's KC_HOSTNAME), EVERY URL in its
// discovery document — including jwks_uri — uses that external hostname,
// which this process may have no route to from inside a container network.
// Discovery is fetched manually here so jwks_uri can be rewritten onto
// discoveryURL's own host before being used.
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

	// Rewrite jwks_uri onto discoveryURL's own scheme+host — the discovery
	// document may advertise an externally-visible hostname this process
	// can't route to (see the package doc comment).
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
		PreferredUsername string   `json:"preferred_username"`
		EmailVerified     bool     `json:"email_verified"`
		Organization      []string `json:"organization"`
		Roles             []string `json:"roles"`
	}
	if err := tok.Claims(&raw); err != nil {
		return service.IDTokenClaims{}, fmt.Errorf("decoding id token claims: %w", err)
	}

	return service.IDTokenClaims{
		Sub:               tok.Subject,
		PreferredUsername: raw.PreferredUsername,
		EmailVerified:     raw.EmailVerified,
		Organization:      firstOrganizationName(raw.Organization),
		Roles:             raw.Roles,
	}, nil
}

// firstOrganizationName narrows Keycloak's `organization` claim — a JSON
// array of organization names/aliases (empirically confirmed against a live
// Keycloak 26 instance; it is NOT a map, despite looking like one might be
// more natural) — down to a single active organization. Multi-org tokens
// exist — see the plan's multi-org design — but which one is "active" for a
// given login is a client-driven choice made after this exchange, not
// during it; today the gateway JIT-provisions at most the first one it sees.
func firstOrganizationName(orgs []string) string {
	if len(orgs) == 0 {
		return ""
	}
	return orgs[0]
}

var _ service.Verifier = (*Verifier)(nil)
