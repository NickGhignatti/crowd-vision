package authcontracts

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
)

const SignatureHeader = "X-Signature"

// Sign is the internal service-to-service convention: lowercase hex of
// HMAC-SHA256 over the exact request body, empty body included.
func Sign(secret, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func Verify(secret, body []byte, signature string) bool {
	return hmac.Equal([]byte(signature), []byte(Sign(secret, body)))
}

// RequireSignature gates routes that only another in-mesh service may call.
// The body is read once and put back, so handlers still see it.
func RequireSignature(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			signature := r.Header.Get(SignatureHeader)
			if signature == "" {
				http.Error(w, "missing signature", http.StatusForbidden)
				return
			}

			body, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "cannot read body", http.StatusBadRequest)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))

			if !Verify(secret, body, signature) {
				http.Error(w, "invalid signature", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
