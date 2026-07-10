// Package authmiddleware verifies the internal RS256 token minted by
// claims-gateway. RS256 (not HS256) is deliberate: the gateway signs with a
// private key nothing else holds, so a compromised service can read and
// verify tokens but never mint them.
package authmiddleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

// CookieName matches the Node fleet's existing convention
// (server/*/src/config/config.ts: JWT_COOKIE_NAME, default
// "authentication_token") so claims-gateway is a drop-in replacement for
// auth-service's cookie — no client change needed for the strangler cutover.
// Service-to-service calls forward the caller's identity as a Bearer header
// instead — the same dual-source pattern the Node services already use.
const CookieName = "authentication_token"

type contextKey struct{}

// FromContext retrieves the claims RequireAuthentication verified and
// attached to the request context.
func FromContext(ctx context.Context) (authcontracts.StandardClaims, bool) {
	c, ok := ctx.Value(contextKey{}).(authcontracts.StandardClaims)
	return c, ok
}

func extractToken(r *http.Request) string {
	if header := r.Header.Get("Authorization"); strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}
	if cookie, err := r.Cookie(CookieName); err == nil {
		return cookie.Value
	}
	return ""
}

// RequireAuthentication verifies the gateway-minted token against its JWKS
// (jwks is expected to auto-refresh; construct it once at service startup,
// not per request) and pins both the signing algorithm and the issuer, so a
// token from a different gateway — or a same-shape token an attacker
// crafted with alg "none" or HS256 — is rejected before any claim is
// trusted.
func RequireAuthentication(jwks keyfunc.Keyfunc, issuer string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := extractToken(r)
			if raw == "" {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}

			var claims authcontracts.StandardClaims
			token, err := jwt.ParseWithClaims(raw, jwt.MapClaims{}, jwks.Keyfunc,
				jwt.WithValidMethods([]string{"RS256"}),
				jwt.WithIssuer(issuer),
			)
			if err != nil || !token.Valid {
				http.Error(w, "invalid token", http.StatusUnauthorized)
				return
			}

			mapClaims := token.Claims.(jwt.MapClaims)
			if err := decodeClaims(mapClaims, &claims); err != nil {
				http.Error(w, "invalid token claims", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), contextKey{}, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func decodeClaims(m jwt.MapClaims, out *authcontracts.StandardClaims) error {
	sub, _ := m["sub"].(string)
	name, _ := m["accountName"].(string)
	sid, _ := m["sid"].(string)
	out.Sub, out.AccountName, out.SID = sub, name, sid

	raw, ok := m["memberships"].([]any)
	if !ok {
		return nil // a token with no memberships yet is valid (new account)
	}
	out.Memberships = make([]authcontracts.Membership, 0, len(raw))
	for _, item := range raw {
		fields, ok := item.(map[string]any)
		if !ok {
			continue
		}
		domain, _ := fields["domain"].(string)
		role, _ := fields["role"].(string)
		externalID, _ := fields["externalId"].(string)
		out.Memberships = append(out.Memberships, authcontracts.Membership{
			Domain: domain, Role: role, ExternalID: externalID,
		})
	}
	return nil
}
