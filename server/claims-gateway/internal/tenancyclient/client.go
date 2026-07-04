// Package tenancyclient implements service.TenancyClient over HTTP against
// tenancy-service's /internal/* routes — the one deliberate cross-service
// hop in the whole design, made once per login, never per request.
package tenancyclient

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
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

func (c *Client) MembershipsFor(ctx context.Context, accountID string) ([]authcontracts.Membership, error) {
	u := c.baseURL + "/internal/memberships?" + url.Values{"accountId": {accountID}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Signature", c.sign(nil))

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tenancy-service unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tenancy-service returned %d", resp.StatusCode)
	}
	var out []authcontracts.Membership
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decoding memberships: %w", err)
	}
	return out, nil
}

func (c *Client) Provision(ctx context.Context, in service.ProvisionRequest) error {
	body, err := json.Marshal(map[string]string{
		"accountId": in.AccountID, "domainName": in.DomainName, "role": in.Role, "externalId": in.ExternalID,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/provision", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", c.sign(body))

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("tenancy-service unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusNoContent:
		return nil
	case http.StatusForbidden:
		return service.ErrInviteOnly
	default:
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("tenancy-service returned %d: %s", resp.StatusCode, msg)
	}
}

var _ service.TenancyClient = (*Client)(nil)
