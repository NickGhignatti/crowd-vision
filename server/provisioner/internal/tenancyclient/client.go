package tenancyclient

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

func (c *Client) CreateDomain(ctx context.Context, name, displayName, joinPolicy string) error {
	body, err := json.Marshal(map[string]string{
		"name": name, "displayName": displayName, "joinPolicy": joinPolicy,
	})
	if err != nil {
		return err
	}

	mac := hmac.New(sha256.New, c.secret)
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/domains", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", sig)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("tenancy-service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusConflict {
		return nil
	}
	return fmt.Errorf("tenancy-service returned %d", resp.StatusCode)
}

var _ reconciler.TenancyClient = (*Client)(nil)
