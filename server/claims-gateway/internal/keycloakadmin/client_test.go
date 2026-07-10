// These tests run the real client against a minimal fake Keycloak server
// this file stands up (token + admin-users endpoints) — not a mocked
// interface — the same style oidcverifier and tenancyclient use for their
// own real implementations.
package keycloakadmin_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/keycloakadmin"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

const (
	realm        = "crowdvision"
	clientID     = "cv-gateway"
	clientSecret = "test-secret"
)

// fakeKeycloak serves the endpoints keycloakadmin.Client talks to. Any
// handler may be nil for tests that don't exercise that call. userHandler is
// registered as a subtree (trailing slash) to also match per-user routes
// like /users/{id} and /users/{id}/reset-password.
func fakeKeycloak(t *testing.T, tokenHandler, usersHandler, userHandler http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	if tokenHandler != nil {
		mux.HandleFunc("/realms/"+realm+"/protocol/openid-connect/token", tokenHandler)
	}
	if usersHandler != nil {
		mux.HandleFunc("/admin/realms/"+realm+"/users", usersHandler)
	}
	if userHandler != nil {
		mux.HandleFunc("/admin/realms/"+realm+"/users/", userHandler)
	}
	return httptest.NewServer(mux)
}

func TestPasswordGrant_ReturnsIDTokenOnSuccess(t *testing.T) {
	srv := fakeKeycloak(t, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parsing form: %v", err)
		}
		if r.FormValue("grant_type") != "password" || r.FormValue("username") != "mario@unibo.it" ||
			r.FormValue("client_id") != clientID || r.FormValue("client_secret") != clientSecret {
			t.Fatalf("got form %v", r.Form)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id_token": "the-id-token"})
	}, nil, nil)
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	tok, err := c.PasswordGrant(context.Background(), "mario@unibo.it", "correct-password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok != "the-id-token" {
		t.Fatalf("got %q, want the-id-token", tok)
	}
}

func TestPasswordGrant_RejectsBadCredentials(t *testing.T) {
	srv := fakeKeycloak(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_grant"})
	}, nil, nil)
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	_, err := c.PasswordGrant(context.Background(), "mario@unibo.it", "wrong-password")
	if !errors.Is(err, service.ErrInvalidCredentials) {
		t.Fatalf("got %v, want ErrInvalidCredentials", err)
	}
}

func TestPasswordGrant_KeycloakUnreachableIsNotMistakenForBadCredentials(t *testing.T) {
	c := keycloakadmin.New("http://127.0.0.1:1", realm, clientID, clientSecret)
	_, err := c.PasswordGrant(context.Background(), "mario@unibo.it", "x")
	if err == nil {
		t.Fatal("expected an error for an unreachable Keycloak")
	}
	if errors.Is(err, service.ErrInvalidCredentials) {
		t.Fatal("an unreachable Keycloak must not look like a bad-credentials rejection")
	}
}

func TestCreateUser_SucceedsAndSendsCredentials(t *testing.T) {
	var gotBody map[string]any
	srv := fakeKeycloak(t,
		func(w http.ResponseWriter, _ *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "admin-token"})
		},
		func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer admin-token" {
				t.Fatalf("got Authorization header %q, want Bearer admin-token", r.Header.Get("Authorization"))
			}
			if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
				t.Fatalf("decoding request body: %v", err)
			}
			w.WriteHeader(http.StatusCreated)
		},
		nil,
	)
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	if err := c.CreateUser(context.Background(), "new@unibo.it", "s3cret!", "Mario Rossi"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotBody["username"] != "new@unibo.it" || gotBody["email"] != "new@unibo.it" {
		t.Fatalf("got body %+v, want username/email set to the given email (registrationEmailAsUsername)", gotBody)
	}
	if gotBody["firstName"] != "Mario Rossi" {
		t.Fatalf("got firstName %v, want the display name (Keycloak's full-name mapper reads firstName+lastName)", gotBody["firstName"])
	}
	creds, ok := gotBody["credentials"].([]any)
	if !ok || len(creds) != 1 {
		t.Fatalf("got credentials %+v, want exactly one password credential", gotBody["credentials"])
	}
}

func TestCreateUser_OmitsFirstNameWhenNameIsEmpty(t *testing.T) {
	var gotBody map[string]any
	srv := fakeKeycloak(t,
		func(w http.ResponseWriter, _ *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "admin-token"})
		},
		func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewDecoder(r.Body).Decode(&gotBody)
			w.WriteHeader(http.StatusCreated)
		},
		nil,
	)
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	if err := c.CreateUser(context.Background(), "new@unibo.it", "s3cret!", ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, present := gotBody["firstName"]; present && gotBody["firstName"] != "" {
		t.Fatalf("got firstName %v, want it omitted/empty when no display name was given", gotBody["firstName"])
	}
}

func TestCreateUser_RejectsDuplicateEmail(t *testing.T) {
	srv := fakeKeycloak(t,
		func(w http.ResponseWriter, _ *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "admin-token"})
		},
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusConflict)
		},
		nil,
	)
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	err := c.CreateUser(context.Background(), "taken@unibo.it", "s3cret!", "")
	if !errors.Is(err, service.ErrEmailTaken) {
		t.Fatalf("got %v, want ErrEmailTaken", err)
	}
}

func TestCreateUser_KeycloakUnavailableIsNotMistakenForEmailTaken(t *testing.T) {
	c := keycloakadmin.New("http://127.0.0.1:1", realm, clientID, clientSecret)
	err := c.CreateUser(context.Background(), "new@unibo.it", "s3cret!", "")
	if err == nil {
		t.Fatal("expected an error for an unreachable Keycloak")
	}
	if errors.Is(err, service.ErrEmailTaken) {
		t.Fatal("an unreachable Keycloak must not look like a duplicate-email rejection")
	}
}

func TestCreateUser_AdminTokenFetchFailureIsUnavailable(t *testing.T) {
	srv := fakeKeycloak(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}, nil, nil)
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	err := c.CreateUser(context.Background(), "new@unibo.it", "s3cret!", "")
	if err == nil || errors.Is(err, service.ErrEmailTaken) {
		t.Fatalf("got %v, want a plain unavailable error", err)
	}
}

const testUserID = "kc-user-1"

func adminTokenHandler(w http.ResponseWriter, _ *http.Request) {
	_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "admin-token"})
}

func TestGetUser_ReturnsEmailNameAndPicture(t *testing.T) {
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/realms/"+realm+"/users/"+testUserID {
			t.Fatalf("got path %q", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"email": "mario@unibo.it", "firstName": "Mario Rossi",
			"attributes": map[string][]string{"picture": {"https://lh3.googleusercontent.com/a/abc"}},
		})
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	email, name, picture, err := c.GetUser(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if email != "mario@unibo.it" || name != "Mario Rossi" || picture != "https://lh3.googleusercontent.com/a/abc" {
		t.Fatalf("got (%q, %q, %q)", email, name, picture)
	}
}

func TestGetUser_MissingPictureAttributeIsEmptyString(t *testing.T) {
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"email": "mario@unibo.it", "firstName": "Mario Rossi",
		})
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	_, _, picture, err := c.GetUser(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if picture != "" {
		t.Fatalf("got picture %q, want empty for a password-signup account with no picture attribute", picture)
	}
}

func TestGetUser_NotFoundIs404(t *testing.T) {
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	_, _, _, err := c.GetUser(context.Background(), testUserID)
	if !errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want ErrUserNotFound", err)
	}
}

func TestGetUser_KeycloakUnavailableIsNotMistakenForNotFound(t *testing.T) {
	c := keycloakadmin.New("http://127.0.0.1:1", realm, clientID, clientSecret)
	_, _, _, err := c.GetUser(context.Background(), testUserID)
	if err == nil || errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want a plain unavailable error", err)
	}
}

func TestUpdateUser_SendsUsernameAndEmailTogether(t *testing.T) {
	var gotBody map[string]any
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Fatalf("got method %q, want PUT", r.Method)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusNoContent)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	if err := c.UpdateUser(context.Background(), testUserID, "new@unibo.it", ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotBody["username"] != "new@unibo.it" || gotBody["email"] != "new@unibo.it" {
		t.Fatalf("got body %+v, want username and email both set to the new address", gotBody)
	}
	if _, present := gotBody["firstName"]; present {
		t.Fatalf("got body %+v, must not touch firstName when only email changes", gotBody)
	}
}

func TestUpdateUser_SendsFirstNameWhenNameProvided(t *testing.T) {
	var gotBody map[string]any
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusNoContent)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	if err := c.UpdateUser(context.Background(), testUserID, "", "Mario Rossi"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotBody["firstName"] != "Mario Rossi" {
		t.Fatalf("got body %+v", gotBody)
	}
	if _, present := gotBody["email"]; present {
		t.Fatalf("got body %+v, must not touch email when only name changes", gotBody)
	}
}

func TestUpdateUser_RejectsDuplicateEmail(t *testing.T) {
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	err := c.UpdateUser(context.Background(), testUserID, "taken@unibo.it", "")
	if !errors.Is(err, service.ErrEmailTaken) {
		t.Fatalf("got %v, want ErrEmailTaken", err)
	}
}

func TestUpdateUser_NotFoundIs404(t *testing.T) {
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	err := c.UpdateUser(context.Background(), testUserID, "new@unibo.it", "")
	if !errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want ErrUserNotFound", err)
	}
}

func TestUpdateUser_KeycloakUnavailableIsNotMistakenForEmailTakenOrNotFound(t *testing.T) {
	c := keycloakadmin.New("http://127.0.0.1:1", realm, clientID, clientSecret)
	err := c.UpdateUser(context.Background(), testUserID, "new@unibo.it", "")
	if err == nil || errors.Is(err, service.ErrEmailTaken) || errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want a plain unavailable error", err)
	}
}

func TestResetPassword_SendsNewPasswordCredential(t *testing.T) {
	var gotBody map[string]any
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/realms/"+realm+"/users/"+testUserID+"/reset-password" {
			t.Fatalf("got path %q", r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusNoContent)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	if err := c.ResetPassword(context.Background(), testUserID, "new-s3cret!"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotBody["type"] != "password" || gotBody["value"] != "new-s3cret!" || gotBody["temporary"] != false {
		t.Fatalf("got body %+v", gotBody)
	}
}

func TestResetPassword_NotFoundIs404(t *testing.T) {
	srv := fakeKeycloak(t, adminTokenHandler, nil, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	defer srv.Close()

	c := keycloakadmin.New(srv.URL, realm, clientID, clientSecret)
	err := c.ResetPassword(context.Background(), testUserID, "new-s3cret!")
	if !errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want ErrUserNotFound", err)
	}
}

func TestResetPassword_KeycloakUnavailableIsNotMistakenForNotFound(t *testing.T) {
	c := keycloakadmin.New("http://127.0.0.1:1", realm, clientID, clientSecret)
	err := c.ResetPassword(context.Background(), testUserID, "new-s3cret!")
	if err == nil || errors.Is(err, service.ErrUserNotFound) {
		t.Fatalf("got %v, want a plain unavailable error", err)
	}
}
