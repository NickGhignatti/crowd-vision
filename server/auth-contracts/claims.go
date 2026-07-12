// Package authcontracts is the frozen shape of the token every CrowdVision
// service trusts, and the role table used to make local authorization
// decisions from it.
package authcontracts

// Membership is one (domain, role) pair — a user can hold several, one per
// organization they belong to. ExternalId carries the source IdP's identifier
// for the membership, kept for audit and for unlinking a federated identity.
type Membership struct {
	Domain     string `json:"domain"`
	Role       string `json:"role"`
	ExternalID string `json:"externalId,omitempty"`
}

// StandardClaims is the one token shape every service verifies, regardless of
// tier or which IdP authenticated the user. Freezing this shape is what lets
// downstream services never branch on edition.
type StandardClaims struct {
	Sub         string       `json:"sub"`
	AccountName string       `json:"accountName"`
	SID         string       `json:"sid"`
	Memberships []Membership `json:"memberships"`
}

// RoleIn returns the caller's role within domain, if they belong to it.
func (c StandardClaims) RoleIn(domain string) (string, bool) {
	for _, m := range c.Memberships {
		if m.Domain == domain {
			return m.Role, true
		}
	}
	return "", false
}

// CanIn is the authorization decision scoped to one tenant: does the caller's
// role in domain meet or exceed required? A user with no membership in domain
// is always denied, regardless of roles they hold elsewhere.
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
