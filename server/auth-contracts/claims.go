// Package authcontracts is the frozen shape of the token every service trusts.
package authcontracts

// Membership is one (domain, role) pair. ExternalId carries the source IdP's identifier
// for the membership, kept for audit and for unlinking a federated identity.
type Membership struct {
	Domain     string `json:"domain"`
	Role       string `json:"role"`
	ExternalID string `json:"externalId,omitempty"`
}

// StandardClaims is the one token shape every service verifies, regardless of
// tier or which IdP authenticated the user.
type StandardClaims struct {
	Sub         string       `json:"sub"`
	AccountName string       `json:"accountName"`
	SID         string       `json:"sid"`
	Memberships []Membership `json:"memberships"`
}

// Returns the caller's role within domain, if they belong to it.
func (c StandardClaims) RoleIn(domain string) (string, bool) {
	for _, m := range c.Memberships {
		if m.Domain == domain {
			return m.Role, true
		}
	}
	return "", false
}

// Authorization decision scoped to one tenant.
func (c StandardClaims) CanIn(domain, required string) bool {
	role, ok := c.RoleIn(domain)
	return ok && Can(role, required)
}

// Tenants lists every domain the caller belongs to, in membership order —
// used to scope bulk/`$in`-style queries and to populate a client's
// active-tenant switcher.
func (c StandardClaims) Tenants() []string {
	tenants := make([]string, len(c.Memberships))
	for i, m := range c.Memberships {
		tenants[i] = m.Domain
	}
	return tenants
}
