// Package api is claims-gateway's HTTP surface: the login-time exchange
// endpoint, the JWKS every consumer verifies against, and a health check.
package api

import (
	"encoding/base64"
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
	r.Post("/login", loginHandler(gw))
	r.Post("/register", registerHandler(gw))
	r.Post("/logout", logoutHandler)

	r.Group(func(r chi.Router) {
		r.Use(authmiddleware.RequireAuthentication(verifyKeys, issuer))
		r.Get("/me", meHandler)
		r.Get("/profile", profileHandler(gw))
		r.Patch("/profile", updateProfileHandler(gw))
		r.Post("/profile/password", changePasswordHandler(gw))
		r.Post("/refresh", refreshHandler(gw))
		// docker-compose's byte-identical equivalent of Istio's
		// RequestAuthentication + outputPayloadToHeader (see
		// k8s/istio-request-authentication.yml): Caddy's forward_auth calls
		// this, and on 200 copies the X-Gateway-Claims response header onto
		// the forwarded request as x-gateway-claims — the same header every
		// mesh-migrated service already trusts. Body is empty; forward_auth
		// only looks at status + headers.
		r.Get("/verify", verifyHandler)
	})
	return r
}

func verifyHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmiddleware.FromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	body, err := json.Marshal(claims)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("X-Gateway-Claims", base64.StdEncoding.EncodeToString(body))
	w.WriteHeader(http.StatusOK)
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
			writeAuthError(w, err)
			return
		}
		writeSessionCookieAndToken(w, token)
	}
}

// loginHandler is the in-app equivalent of exchangeHandler for the password
// login path: the browser sends credentials straight to us (never to
// Keycloak — see internal/keycloakadmin), and gw.Login does the direct
// grant + the same verify/lookup/sign pipeline exchangeHandler uses.
func loginHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Username == "" || body.Password == "" {
			http.Error(w, "username and password are required", http.StatusBadRequest)
			return
		}

		token, err := gw.Login(r.Context(), body.Username, body.Password)
		if err != nil {
			writeAuthError(w, err)
			return
		}
		writeSessionCookieAndToken(w, token)
	}
}

// registerHandler creates the Keycloak user and logs it in within the same
// request — one client-visible call for the whole "create account" flow.
func registerHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
			Name     string `json:"name"` // optional — a display name, not part of the account's identity
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
			http.Error(w, "email and password are required", http.StatusBadRequest)
			return
		}

		token, err := gw.Register(r.Context(), body.Email, body.Password, body.Name)
		if err != nil {
			writeAuthError(w, err)
			return
		}
		writeSessionCookieAndToken(w, token)
	}
}

// profileHandler returns the caller's own current email/display name, read
// live from Keycloak — this is deliberately not part of the JWT (see
// claims-gateway/CLAUDE.md on keeping StandardClaims frozen), so account
// settings fetches it on demand instead.
func profileHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := authmiddleware.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}

		email, name, picture, err := gw.Profile(r.Context(), claims.Sub)
		if err != nil {
			writeAuthError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"email": email, "name": name, "picture": picture})
	}
}

// updateProfileHandler changes the caller's own email and/or display name.
// Both fields are optional — omitting one leaves it untouched (see
// keycloakadmin.Client.UpdateUser). On success it also refreshes the session
// cookie (see service.Gateway.UpdateProfile) so a changed name shows up
// immediately instead of waiting for the caller's next full login.
func updateProfileHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := authmiddleware.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}

		var body struct {
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		token, err := gw.UpdateProfile(r.Context(), claims, body.Email, body.Name)
		if err != nil {
			writeAuthError(w, err)
			return
		}
		setSessionCookie(w, token)
		w.WriteHeader(http.StatusNoContent)
	}
}

// changePasswordHandler is a sensitive-change re-auth flow: the caller must
// present their current password (verified server-side against Keycloak via
// the same primitive /login uses) before the new one is set — see
// service.Gateway.ChangePassword.
func changePasswordHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := authmiddleware.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}

		var body struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CurrentPassword == "" || body.NewPassword == "" {
			http.Error(w, "currentPassword and newPassword are required", http.StatusBadRequest)
			return
		}

		if err := gw.ChangePassword(r.Context(), claims.Sub, body.CurrentPassword, body.NewPassword); err != nil {
			writeAuthError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// refreshHandler re-mints the caller's session cookie with their current
// tenancy memberships. The client calls this after any membership change
// (create/join a domain, redeem an invite code) so the next request through
// the mesh authorizes against the new domain instead of 403ing on a stale
// login-time token. Same re-mint-the-cookie pattern as updateProfileHandler.
func refreshHandler(gw *service.Gateway) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := authmiddleware.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		token, err := gw.RefreshSession(r.Context(), claims)
		if err != nil {
			writeAuthError(w, err)
			return
		}
		setSessionCookie(w, token)
		w.WriteHeader(http.StatusNoContent)
	}
}

func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: token, Path: "/",
		HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode,
	})
}

func writeSessionCookieAndToken(w http.ResponseWriter, token string) {
	setSessionCookie(w, token)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"token": token})
}

// writeAuthError maps every failure mode across /exchange, /login, and
// /register onto the right status: caller-at-fault rejections (bad ID
// token/credentials, taken email) are never retried by a client, while
// unavailable-dependency failures (tenancy-service, Keycloak) are — that
// distinction is why this isn't a flat 400/500 split.
func writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidIDToken):
		http.Error(w, "invalid id token", http.StatusUnauthorized)
	case errors.Is(err, service.ErrInvalidCredentials):
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
	case errors.Is(err, service.ErrEmailTaken):
		http.Error(w, "email already registered", http.StatusConflict)
	case errors.Is(err, service.ErrUserNotFound):
		http.Error(w, "account not found", http.StatusNotFound)
	case errors.Is(err, service.ErrTenancyUnavailable), errors.Is(err, service.ErrKeycloakUnavailable):
		http.Error(w, "service unavailable, try again", http.StatusServiceUnavailable)
	default:
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}
