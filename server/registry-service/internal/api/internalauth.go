package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
)

// requireInternalSignature protects the provisioner-only routes with an HMAC
// over the raw body — the same X-Signature convention tenancy-service uses,
// kept consistent across every control-plane/internal caller relationship.
func requireInternalSignature(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sig := r.Header.Get("X-Signature")
			if sig == "" {
				http.Error(w, "missing signature", http.StatusForbidden)
				return
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "cannot read body", http.StatusBadRequest)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))

			mac := hmac.New(sha256.New, secret)
			mac.Write(body)
			expected := hex.EncodeToString(mac.Sum(nil))

			if !hmac.Equal([]byte(sig), []byte(expected)) {
				http.Error(w, "invalid signature", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
