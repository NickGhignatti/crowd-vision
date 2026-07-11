// Package api is the HTTP layer for tenancy-service — the Go analogue of the
// Node services' controller/ layer: parse the request, call the service,
// shape the response. No business rules live here.
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"

	authmiddleware "github.com/NickGhignatti/crowd-vision/server/auth-middleware"
	authpolicy "github.com/NickGhignatti/crowd-vision/server/auth-policy"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/store"
)

// domainResponse is the wire shape for a domain — kept separate from
// store.Domain (a persistence type with no JSON tags of its own) so the API
// layer owns its own contract independent of storage representation.
type domainResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	JoinPolicy  string `json:"joinPolicy"`
	ParentID    string `json:"parentId,omitempty"`
	IsPublic    bool   `json:"isPublic"`
	MemberCount int    `json:"memberCount,omitempty"`
}

func toDomainResponse(d store.Domain) domainResponse {
	return domainResponse{
		ID: d.ID, Name: d.Name, DisplayName: d.DisplayName, JoinPolicy: d.JoinPolicy,
		ParentID: d.ParentID, IsPublic: d.IsPublic, MemberCount: d.MemberCount,
	}
}

func writeDomain(w http.ResponseWriter, status int, d store.Domain) {
	writeJSON(w, status, toDomainResponse(d))
}

// account_id is a Postgres `uuid` column; a malformed value reaching the
// store surfaces as an opaque database error, not a clean 4xx (caught live:
// an internal caller sending a non-UUID accountId crashed the query with
// "invalid input syntax for type uuid"). Validate at every entry point that
// takes an accountId as a raw, externally-supplied string — this is a system
// boundary, not an internal call between trusted layers.
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isValidAccountID(id string) bool {
	return uuidPattern.MatchString(id)
}

type Config struct {
	InternalSecret []byte
	TenancyEnabled bool
}

// Mount wires every route. Internal routes (called by claims-gateway and the
// provisioner, never a browser) are HMAC-signed; end-user routes trust the
// gateway-minted JWT. Everything under this function is absent — not merely
// unauthorized — when tenancy is disabled, matching the disabled-cells-404
// posture: a private cluster has nothing tenancy-shaped to probe.
func Mount(r chi.Router, svc *service.Service, cfg Config) {
	h := &handler{svc: svc}

	if !cfg.TenancyEnabled {
		return
	}

	r.Group(func(r chi.Router) {
		r.Use(requireInternalSignature(cfg.InternalSecret))
		r.Get("/internal/memberships", h.internalMemberships)
		r.Post("/internal/provision", h.internalProvision)
		r.Post("/internal/domains", h.internalCreateDomain)
	})

	r.Group(func(r chi.Router) {
		r.Use(authmiddleware.RequireMeshClaims())
		r.Get("/domains", h.listPublicDomains)
		r.Post("/domains", h.createOwnDomain)
		r.Get("/me/memberships", h.myMemberships)
		r.Post("/domains/{domain}/join", h.joinDomain)
		r.Post("/domains/{domain}/invite", h.inviteMember)
		r.Delete("/domains/{domain}/members/{accountId}", h.leaveDomain)
		r.Get("/domains/{domain}/subdomains", h.listSubdomains)
		r.Post("/domains/{domain}/subdomains", h.createSubdomain)
		r.Post("/domains/{domain}/invite-codes", h.createInviteCode)
		r.Post("/invite-codes/{code}/redeem", h.redeemInviteCode)
	})
}

type handler struct {
	svc *service.Service
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrDomainNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, service.ErrInviteOnly):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, service.ErrDomainNameTaken):
		http.Error(w, err.Error(), http.StatusConflict)
	case errors.Is(err, service.ErrLastAdminCannotLeave):
		http.Error(w, err.Error(), http.StatusConflict)
	case errors.Is(err, service.ErrInviteCodeInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// --- internal (HMAC-signed) routes ---

func (h *handler) internalMemberships(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" {
		http.Error(w, "accountId is required", http.StatusBadRequest)
		return
	}
	if !isValidAccountID(accountID) {
		http.Error(w, "accountId must be a UUID", http.StatusBadRequest)
		return
	}
	ms, err := h.svc.MembershipsFor(r.Context(), accountID)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ms)
}

func (h *handler) internalCreateDomain(w http.ResponseWriter, r *http.Request) {
	var in service.CreateDomainInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	d, err := h.svc.CreateDomain(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeDomain(w, http.StatusCreated, d)
}

func (h *handler) internalProvision(w http.ResponseWriter, r *http.Request) {
	var in service.JoinInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if !isValidAccountID(in.AccountID) {
		http.Error(w, "accountId must be a UUID", http.StatusBadRequest)
		return
	}
	if err := h.svc.Join(r.Context(), in); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- end-user (gateway JWT) routes ---

func (h *handler) createOwnDomain(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())

	var body struct {
		Name, DisplayName, JoinPolicy string
		IsPublic                      bool `json:"isPublic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.DisplayName == "" {
		http.Error(w, "name and displayName are required", http.StatusBadRequest)
		return
	}

	d, err := h.svc.CreateOwnDomain(r.Context(), service.CreateOwnDomainInput{
		AccountID: claims.Sub, Name: body.Name, DisplayName: body.DisplayName,
		JoinPolicy: body.JoinPolicy, IsPublic: body.IsPublic,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	writeDomain(w, http.StatusCreated, d)
}

// listPublicDomains is the "browse domains" directory — replaces
// auth-service's getAllAllowedDomains + a separate member-counts round-trip
// with one authenticated call.
func (h *handler) listPublicDomains(w http.ResponseWriter, r *http.Request) {
	domains, err := h.svc.PublicDomains(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]domainResponse, len(domains))
	for i, d := range domains {
		out[i] = toDomainResponse(d)
	}
	writeJSON(w, http.StatusOK, out)
}

// myMemberships is the fresh, authenticated equivalent of auth-service's
// GET /domains/:accountName — the caller can only ever ask for their own
// memberships (identity comes from the JWT, never a URL/body accountName).
func (h *handler) myMemberships(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	ms, err := h.svc.MembershipsFor(r.Context(), claims.Sub)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ms)
}

func (h *handler) joinDomain(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	var body struct{ Role, ExternalID string }
	_ = json.NewDecoder(r.Body).Decode(&body)

	err := h.svc.Join(r.Context(), service.JoinInput{
		AccountID: claims.Sub, DomainName: chi.URLParam(r, "domain"),
		Role: body.Role, ExternalID: body.ExternalID,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) inviteMember(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	domain := chi.URLParam(r, "domain")

	if !authpolicy.CanManageDomain(claims.Memberships, domain) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct{ AccountID, Role string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if !isValidAccountID(body.AccountID) {
		http.Error(w, "accountId must be a UUID", http.StatusBadRequest)
		return
	}

	err := h.svc.Invite(r.Context(), service.InviteInput{
		AccountID: body.AccountID, DomainName: domain, Role: body.Role,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) leaveDomain(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	domain := chi.URLParam(r, "domain")
	target := chi.URLParam(r, "accountId")

	if !isValidAccountID(target) {
		http.Error(w, "accountId must be a UUID", http.StatusBadRequest)
		return
	}

	// Anyone may remove themselves — checked before Cedar since it's an
	// identity comparison, not a policy decision; removing someone else
	// needs domain admin.
	if target != claims.Sub && !authpolicy.CanManageDomain(claims.Memberships, domain) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if err := h.svc.Leave(r.Context(), target, domain); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) createSubdomain(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	parent := chi.URLParam(r, "domain")

	if !authpolicy.CanManageDomain(claims.Memberships, parent) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct {
		Name, DisplayName, JoinPolicy string
		IsPublic                      bool `json:"isPublic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.DisplayName == "" {
		http.Error(w, "name and displayName are required", http.StatusBadRequest)
		return
	}

	d, err := h.svc.CreateSubdomain(r.Context(), service.CreateSubdomainInput{
		ParentDomainName: parent, Name: body.Name, DisplayName: body.DisplayName,
		JoinPolicy: body.JoinPolicy, IsPublic: body.IsPublic,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	writeDomain(w, http.StatusCreated, d)
}

// listSubdomains requires only authentication, not domain admin — matches
// auth-service's original getSubdomainsFromDomain, which let any
// authenticated user browse a domain's subdomain list.
func (h *handler) listSubdomains(w http.ResponseWriter, r *http.Request) {
	subs, err := h.svc.ListSubdomains(r.Context(), chi.URLParam(r, "domain"))
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]domainResponse, len(subs))
	for i, d := range subs {
		out[i] = toDomainResponse(d)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *handler) createInviteCode(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	domain := chi.URLParam(r, "domain")

	if !authpolicy.CanManageDomain(claims.Memberships, domain) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct{ Role string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}

	ic, err := h.svc.CreateInviteCode(r.Context(), service.CreateInviteCodeInput{
		DomainName: domain, Role: body.Role, CreatedBy: claims.Sub,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{
		"code": ic.Code, "role": ic.Role, "expiresAt": ic.ExpiresAt.Format(time.RFC3339),
	})
}

func (h *handler) redeemInviteCode(w http.ResponseWriter, r *http.Request) {
	claims, _ := authmiddleware.FromContext(r.Context())
	code := chi.URLParam(r, "code")

	if err := h.svc.RedeemInviteCode(r.Context(), code, claims.Sub); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
