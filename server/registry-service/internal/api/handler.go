package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/registry-service/internal/store"
)

func Mount(r chi.Router, svc *service.Service, internalSecret []byte) {
	h := &handler{svc: svc}

	r.Post("/organizations", h.signup)
	r.Get("/organizations/{id}", h.getOrganization)

	r.Group(func(r chi.Router) {
		r.Use(requireInternalSignature(internalSecret))
		r.Get("/internal/organizations/pending", h.pending)
		r.Post("/internal/organizations/{id}/status", h.setStatus)
		r.Post("/internal/organizations/{id}/suspend", h.suspend)
	})
}

type handler struct {
	svc *service.Service
}

func writeOrg(w http.ResponseWriter, status int, org store.Organization) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"id": org.ID, "name": org.Name, "displayName": org.DisplayName,
		"tier": org.Tier, "status": org.Status, "licenseStatus": org.LicenseStatus,
	})
}

func (h *handler) signup(w http.ResponseWriter, r *http.Request) {
	var in service.SignupInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	org, err := h.svc.Signup(r.Context(), in)
	if errors.Is(err, service.ErrInvalidTier) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "signup failed", http.StatusInternalServerError)
		return
	}
	writeOrg(w, http.StatusCreated, org)
}

func (h *handler) getOrganization(w http.ResponseWriter, r *http.Request) {
	org, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, service.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeOrg(w, http.StatusOK, org)
}

func (h *handler) pending(w http.ResponseWriter, r *http.Request) {
	orgs, err := h.svc.Pending(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	out := make([]map[string]string, len(orgs))
	for i, org := range orgs {
		out[i] = map[string]string{
			"id": org.ID, "name": org.Name, "displayName": org.DisplayName,
			"tier": org.Tier, "identityMode": org.IdentityMode, "issuer": org.Issuer,
		}
	}
	_ = json.NewEncoder(w).Encode(out)
}

func (h *handler) setStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status string `json:"status"`
		Detail string `json:"detail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	err := h.svc.MarkReady(r.Context(), chi.URLParam(r, "id"))
	if body.Status == "failed" {
		err = h.svc.MarkFailed(r.Context(), chi.URLParam(r, "id"), body.Detail)
	}
	if errors.Is(err, service.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) suspend(w http.ResponseWriter, r *http.Request) {
	err := h.svc.Suspend(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, service.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
