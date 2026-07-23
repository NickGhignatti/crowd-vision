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

const CookieName = "authentication_token"

type jwksProvider interface {
	JWKS() []byte
}

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
		// Mirrors Istio's RequestAuthentication+outputPayloadToHeader: Caddy's forward_auth
		// calls this and on 200 copies X-Gateway-Claims onto the request as x-gateway-claims.
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

// Creates the Keycloak user and logs it in within the same request.
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
// tenancy memberships. The client calls this after any membership change.
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
