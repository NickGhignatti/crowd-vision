// Package api is claims-gateway's HTTP surface: the login-time exchange
// endpoint, the JWKS every consumer verifies against, and a health check.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/go-chi/chi/v5"

	authmiddleware "github.com/NickGhignatti/crowd-vision/server/auth-middleware"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

// CookieName matches auth-middleware.CookieName — kept as a literal here to
// avoid a dependency cycle-shaped coupling for one constant; a shared
// constants package is not worth it for a single string (see CLAUDE.md).
const CookieName = "authentication_token"

type jwksProvider interface {
	JWKS() []byte
}

// Mount wires every route. jwks/issuer are used to verify the gateway's OWN
// minted tokens for /me — the browser can't decode its cookie itself (it's
// HttpOnly by design), so this is the "who am I" round-trip the client's
// session-rehydration needs. Construct jwks from the same Signer that mints
// tokens (see cmd/gateway/main.go) — never over HTTP to itself.
func Mount(gw *service.Gateway, jwks jwksProvider, verifyKeys keyfunc.Keyfunc, issuer string) chi.Router {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	r.Get("/.well-known/jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(jwks.JWKS())
	})
	r.Post("/exchange", exchangeHandler(gw))
	r.Post("/logout", logoutHandler)

	r.Group(func(r chi.Router) {
		r.Use(authmiddleware.RequireAuthentication(verifyKeys, issuer))
		r.Get("/me", meHandler)
	})
	return r
}

// logoutHandler clears the internal token cookie. This is the "clear the
// local session" half of logout, not "log out everywhere" — the existing
// token remains cryptographically valid until its short TTL expires; that's
// the accepted tradeoff (see CLAUDE.md's revocation gate) rather than
// standing up session tracking for immediate global revocation. Terminating
// the Keycloak SSO session too is a client-side concern (redirect to
// Keycloak's end-session endpoint), not this handler's job.
func logoutHandler(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
}

func meHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmiddleware.FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthenticated", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(claims)
}

func exchangeHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			IDToken string `json:"idToken"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IDToken == "" {
			http.Error(w, "idToken is required", http.StatusBadRequest)
			return
		}

		token, err := gw.Exchange(r.Context(), body.IDToken)
		if err != nil {
			writeExchangeError(w, err)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name: CookieName, Value: token, Path: "/",
			HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode,
		})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"token": token})
	}
}

// writeExchangeError distinguishes "you are not who you claim to be" (401)
// from "we can't currently verify tenancy, try again" (503) — both are
// failures, but only one is the caller's fault, and a client should retry
// the second, never the first.
func writeExchangeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidIDToken):
		http.Error(w, "invalid id token", http.StatusUnauthorized)
	case errors.Is(err, service.ErrTenancyUnavailable):
		http.Error(w, "tenancy unavailable, try again", http.StatusServiceUnavailable)
	default:
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}
