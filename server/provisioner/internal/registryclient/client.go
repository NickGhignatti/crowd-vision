package registryclient

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/provisioner/internal/reconciler"
)

type Client struct {
	baseURL string
	secret  []byte
	http    *http.Client
}

func New(baseURL string, secret []byte) *Client {
	return &Client{baseURL: baseURL, secret: secret, http: &http.Client{Timeout: 5 * time.Second}}
}

func (c *Client) sign(body []byte) string {
	mac := hmac.New(sha256.New, c.secret)
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) Pending(ctx context.Context) ([]reconciler.Organization, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/internal/organizations/pending", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Signature", c.sign(nil))

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("registry-service unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry-service returned %d", resp.StatusCode)
	}

	var raw []map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decoding pending organizations: %w", err)
	}
	out := make([]reconciler.Organization, len(raw))
	for i, r := range raw {
		out[i] = reconciler.Organization{
			ID: r["id"], Name: r["name"], DisplayName: r["displayName"],
			Tier: r["tier"], IdentityMode: r["identityMode"],
		}
	}
	return out, nil
}

func (c *Client) setStatus(ctx context.Context, id string, body map[string]string) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/internal/organizations/"+id+"/status", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", c.sign(raw))

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("registry-service unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("registry-service returned %d", resp.StatusCode)
	}
	return nil
}

func (c *Client) MarkReady(ctx context.Context, id string) error {
	return c.setStatus(ctx, id, map[string]string{"status": "ready"})
}

func (c *Client) MarkFailed(ctx context.Context, id, detail string) error {
	return c.setStatus(ctx, id, map[string]string{"status": "failed", "detail": detail})
}

var _ reconciler.RegistryClient = (*Client)(nil)
