package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

type Config struct {
	Addr                     string
	OIDCDiscoveryURL         string // how THIS process reaches the IdP (e.g. internal Docker hostname)
	OIDCIssuer               string // the canonical `iss` browsers' tokens carry (may differ from the above)
	OIDCClientID             string
	TenancyURL               string
	InternalSecret           []byte
	Issuer                   string // this gateway's own iss claim, e.g. "cv-gateway"
	TokenTTL                 time.Duration
	SigningKey               *rsa.PrivateKey
	SigningKeyID             string
	KeycloakBaseURL          string // OIDCDiscoveryURL with the "/realms/<realm>" suffix stripped
	KeycloakRealm            string
	RegistrationClientID     string // the confidential client used for both grants, e.g. "cv-gateway"
	RegistrationClientSecret string
}

func Load() (Config, error) {
	issuer := os.Getenv("OIDC_ISSUER")
	if issuer == "" {
		return Config{}, fmt.Errorf("OIDC_ISSUER is required")
	}
	discoveryURL := os.Getenv("OIDC_DISCOVERY_URL")
	if discoveryURL == "" {
		discoveryURL = issuer // single-hostname deployments: same URL for both
	}
	clientID := os.Getenv("OIDC_CLIENT_ID")
	if clientID == "" {
		return Config{}, fmt.Errorf("OIDC_CLIENT_ID is required")
	}
	tenancyURL := os.Getenv("TENANCY_URL")
	if tenancyURL == "" {
		return Config{}, fmt.Errorf("TENANCY_URL is required")
	}
	secret := os.Getenv("INTERNAL_SIGNING_SECRET")
	if secret == "" {
		return Config{}, fmt.Errorf("INTERNAL_SIGNING_SECRET is required")
	}
	keycloakRealm := os.Getenv("KEYCLOAK_REALM")
	if keycloakRealm == "" {
		return Config{}, fmt.Errorf("KEYCLOAK_REALM is required")
	}
	registrationClientID := os.Getenv("REGISTRATION_CLIENT_ID")
	if registrationClientID == "" {
		return Config{}, fmt.Errorf("REGISTRATION_CLIENT_ID is required")
	}
	registrationClientSecret := os.Getenv("REGISTRATION_CLIENT_SECRET")
	if registrationClientSecret == "" {
		return Config{}, fmt.Errorf("REGISTRATION_CLIENT_SECRET is required")
	}

	key, kid, err := loadOrGenerateKey()
	if err != nil {
		return Config{}, err
	}

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":3000"
	}
	gwIssuer := os.Getenv("GATEWAY_ISSUER")
	if gwIssuer == "" {
		gwIssuer = "cv-gateway"
	}

	keycloakBaseURL := strings.TrimSuffix(discoveryURL, "/realms/"+keycloakRealm)

	return Config{
		Addr: addr, OIDCDiscoveryURL: discoveryURL, OIDCIssuer: issuer, OIDCClientID: clientID,
		TenancyURL: tenancyURL, InternalSecret: []byte(secret),
		Issuer: gwIssuer, TokenTTL: 15 * time.Minute,
		SigningKey: key, SigningKeyID: kid,
		KeycloakBaseURL: keycloakBaseURL, KeycloakRealm: keycloakRealm,
		RegistrationClientID: registrationClientID, RegistrationClientSecret: registrationClientSecret,
	}, nil
}

// loadOrGenerateKey reads GATEWAY_PRIVATE_KEY (PEM, PKCS#8) if set — this is
// what the provisioner mints per-cell in production. Falling back to an
// ephemeral in-memory key keeps local dev friction-free; it must never be
// used past a single process lifetime, which an ephemeral key can't be by
// construction.
func loadOrGenerateKey() (*rsa.PrivateKey, string, error) {
	pemStr := os.Getenv("GATEWAY_PRIVATE_KEY")
	if pemStr == "" {
		if path := os.Getenv("GATEWAY_PRIVATE_KEY_FILE"); path != "" {
			b, err := os.ReadFile(path)
			if err != nil {
				return nil, "", fmt.Errorf("reading GATEWAY_PRIVATE_KEY_FILE: %w", err)
			}
			pemStr = string(b)
		}
	}
	if pemStr != "" {
		block, _ := pem.Decode([]byte(pemStr))
		if block == nil {
			return nil, "", fmt.Errorf("GATEWAY_PRIVATE_KEY is not valid PEM")
		}
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, "", fmt.Errorf("parsing GATEWAY_PRIVATE_KEY: %w", err)
		}
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, "", fmt.Errorf("GATEWAY_PRIVATE_KEY is not an RSA key")
		}
		kid := os.Getenv("GATEWAY_KEY_ID")
		if kid == "" {
			kid = "cv-gateway-1"
		}
		return rsaKey, kid, nil
	}

	log.Println("WARNING: GATEWAY_PRIVATE_KEY not set — generating an ephemeral key. " +
		"Every restart invalidates existing sessions and JWKS caches. Fine for local dev, never for a real cell.")
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, "", err
	}
	return key, "ephemeral-dev-key", nil
}
