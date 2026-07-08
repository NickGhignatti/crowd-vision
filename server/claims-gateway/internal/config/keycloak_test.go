package config

import "testing"

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("OIDC_ISSUER", "http://issuer.example/realms/test")
	t.Setenv("OIDC_DISCOVERY_URL", "http://keycloak:8080/realms/test")
	t.Setenv("OIDC_CLIENT_ID", "cv-web")
	t.Setenv("TENANCY_URL", "http://tenancy.example")
	t.Setenv("INTERNAL_SIGNING_SECRET", "secret")
	t.Setenv("KEYCLOAK_REALM", "test")
	t.Setenv("REGISTRATION_CLIENT_ID", "cv-gateway")
	t.Setenv("REGISTRATION_CLIENT_SECRET", "secret")
}

func TestLoad_RequiresKeycloakRealm(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("KEYCLOAK_REALM", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when KEYCLOAK_REALM is missing")
	}
}

func TestLoad_RequiresRegistrationClientSecret(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("REGISTRATION_CLIENT_SECRET", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when REGISTRATION_CLIENT_SECRET is missing")
	}
}

func TestLoad_DerivesKeycloakBaseURLFromDiscoveryURL(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.KeycloakBaseURL != "http://keycloak:8080" {
		t.Fatalf("got %q, want http://keycloak:8080 (the /realms/<realm> suffix stripped)", cfg.KeycloakBaseURL)
	}
	if cfg.KeycloakRealm != "test" {
		t.Fatalf("got realm %q", cfg.KeycloakRealm)
	}
}
