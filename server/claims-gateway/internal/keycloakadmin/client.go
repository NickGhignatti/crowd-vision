package keycloakadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/NickGhignatti/crowd-vision/server/claims-gateway/internal/service"
)

type Client struct {
	tokenURL     string
	usersURL     string
	clientID     string
	clientSecret string
	http         *http.Client
}

func New(baseURL, realm, clientID, clientSecret string) *Client {
	base := strings.TrimSuffix(baseURL, "/")
	return &Client{
		tokenURL:     base + "/realms/" + realm + "/protocol/openid-connect/token",
		usersURL:     base + "/admin/realms/" + realm + "/users",
		clientID:     clientID,
		clientSecret: clientSecret,
		http:         &http.Client{Timeout: 5 * time.Second},
	}
}

// Exchanges a username/password for an ID token via Keycloak's Resource Owner Password Credentials grant.
func (c *Client) PasswordGrant(ctx context.Context, username, password string) (string, error) {
	resp, err := c.postForm(ctx, url.Values{
		"grant_type":    {"password"},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
		"username":      {username},
		"password":      {password},
		"scope":         {"openid"},
	})
	if err != nil {
		return "", fmt.Errorf("keycloak token endpoint unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var tok struct {
			IDToken string `json:"id_token"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
			return "", fmt.Errorf("decoding token response: %w", err)
		}
		return tok.IDToken, nil
	case http.StatusBadRequest, http.StatusUnauthorized:
		return "", service.ErrInvalidCredentials
	default:
		return "", fmt.Errorf("keycloak token endpoint returned %d", resp.StatusCode)
	}
}

func (c *Client) CreateUser(ctx context.Context, email, password, name string) error {
	adminToken, err := c.adminToken(ctx)
	if err != nil {
		return err
	}

	userFields := map[string]any{
		"username":      email,
		"email":         email,
		"enabled":       true,
		"emailVerified": false,
		"credentials": []map[string]any{
			{"type": "password", "value": password, "temporary": false},
		},
	}
	if name != "" {
		userFields["firstName"] = name
	}

	body, err := json.Marshal(userFields)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.usersURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak admin API unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusCreated:
		return nil
	case http.StatusConflict:
		return service.ErrEmailTaken
	default:
		return fmt.Errorf("keycloak admin API returned %d", resp.StatusCode)
	}
}

func (c *Client) GetUser(ctx context.Context, userID string) (email, name, picture string, err error) {
	adminToken, err := c.adminToken(ctx)
	if err != nil {
		return "", "", "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.usersURL+"/"+userID, nil)
	if err != nil {
		return "", "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", "", "", fmt.Errorf("keycloak admin API unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var user struct {
			Email      string `json:"email"`
			FirstName  string `json:"firstName"`
			Attributes struct {
				Picture []string `json:"picture"`
			} `json:"attributes"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
			return "", "", "", fmt.Errorf("decoding user response: %w", err)
		}
		var pic string
		if len(user.Attributes.Picture) > 0 {
			pic = user.Attributes.Picture[0]
		}
		return user.Email, user.FirstName, pic, nil
	case http.StatusNotFound:
		return "", "", "", service.ErrUserNotFound
	default:
		return "", "", "", fmt.Errorf("keycloak admin API returned %d", resp.StatusCode)
	}
}

func (c *Client) UpdateUser(ctx context.Context, userID, email, name string) error {
	adminToken, err := c.adminToken(ctx)
	if err != nil {
		return err
	}

	fields := map[string]any{}
	if email != "" {
		fields["username"] = email
		fields["email"] = email
	}
	if name != "" {
		fields["firstName"] = name
	}

	body, err := json.Marshal(fields)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.usersURL+"/"+userID, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak admin API unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusNoContent, http.StatusOK:
		return nil
	case http.StatusConflict:
		return service.ErrEmailTaken
	case http.StatusNotFound:
		return service.ErrUserNotFound
	default:
		return fmt.Errorf("keycloak admin API returned %d", resp.StatusCode)
	}
}

func (c *Client) ResetPassword(ctx context.Context, userID, newPassword string) error {
	adminToken, err := c.adminToken(ctx)
	if err != nil {
		return err
	}

	body, err := json.Marshal(map[string]any{
		"type": "password", "value": newPassword, "temporary": false,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.usersURL+"/"+userID+"/reset-password", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak admin API unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusNoContent, http.StatusOK:
		return nil
	case http.StatusNotFound:
		return service.ErrUserNotFound
	default:
		return fmt.Errorf("keycloak admin API returned %d", resp.StatusCode)
	}
}

func (c *Client) adminToken(ctx context.Context) (string, error) {
	resp, err := c.postForm(ctx, url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
	})
	if err != nil {
		return "", fmt.Errorf("keycloak token endpoint unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("keycloak client-credentials grant returned %d", resp.StatusCode)
	}
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("decoding admin token response: %w", err)
	}
	return tok.AccessToken, nil
}

func (c *Client) postForm(ctx context.Context, form url.Values) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return c.http.Do(req)
}

// compile-time interface assertions in order to ensure the Client implements
// the required interfaces.
var (
	_ service.PasswordAuthenticator = (*Client)(nil)
	_ service.UserRegistrar         = (*Client)(nil)
)
