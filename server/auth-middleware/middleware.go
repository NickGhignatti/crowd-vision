// Package authmiddleware verifies the internal RS256 JWT minted by claims-gateway.
package authmiddleware

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

const CookieName = "authentication_token"

type contextKey struct{}

// Retrieves the claims RequireAuthentication verified and attached to the request context.
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

// RequireAuthentication verifies the gateway JWT against its JWKS and pins the
// algorithm and issuer, rejecting alg-none/HS256 forgeries before trusting any claim.
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
				jwt.WithValidMethods([]string{"RS256"}), // token with a different alg
				jwt.WithIssuer(issuer),                  // token with a different signer
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

const GatewayClaimsHeader = "x-gateway-claims"

// RequireMeshClaims trusts the mesh-verified claims header instead of verifying a
// JWT itself. Claims-gateway's own routes (e.g. /me) still use RequireAuthentication.
func RequireMeshClaims() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get(GatewayClaimsHeader)
			if header == "" {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}

			raw, err := base64.StdEncoding.DecodeString(header)
			if err != nil {
				http.Error(w, "invalid token", http.StatusUnauthorized)
				return
			}

			var claims authcontracts.StandardClaims
			if err := json.Unmarshal(raw, &claims); err != nil || claims.Sub == "" {
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
