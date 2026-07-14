// Package signer mints the internal StandardClaims JWT and publishes the
// JWKS every consumer (auth-middleware, Node services) verifies it with.
package signer

import (
	"crypto/rsa"
	"encoding/json"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

type Signer struct {
	key    *rsa.PrivateKey
	kid    string
	issuer string
}

func New(key *rsa.PrivateKey, kid, issuer string) *Signer {
	return &Signer{key: key, kid: kid, issuer: issuer}
}

func (s *Signer) Sign(claims authcontracts.StandardClaims, ttl time.Duration) (string, error) {
	if claims.SID == "" {
		claims.SID = uuid.NewString()
	}
	memberships := claims.Memberships
	if memberships == nil {
		memberships = []authcontracts.Membership{}
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":         claims.Sub,
		"accountName": claims.AccountName,
		"sid":         claims.SID,
		"memberships": memberships,
		"iss":         s.issuer,
		"iat":         time.Now().Unix(),
		"exp":         time.Now().Add(ttl).Unix(),
	})
	tok.Header["kid"] = s.kid // Signer's key ID
	return tok.SignedString(s.key)
}

// JWKS returns the public verifying key as a JSON Web Key Set.
func (s *Signer) JWKS() []byte {
	jwk, err := jwkset.NewJWKFromKey(&s.key.PublicKey, jwkset.JWKOptions{
		Metadata: jwkset.JWKMetadataOptions{KID: s.kid, ALG: jwkset.ALG("RS256")},
	})
	if err != nil {
		// The key is always a valid RSA public key we generated ourselves;
		// this can only fail if that invariant is broken, which is a
		// programmer error, not a runtime condition to recover from.
		panic("signer: building JWKS from our own key: " + err.Error())
	}
	raw, err := json.Marshal(jwkset.JWKSMarshal{Keys: []jwkset.JWKMarshal{jwk.Marshal()}})
	if err != nil {
		panic("signer: marshaling JWKS: " + err.Error())
	}
	return raw
}
