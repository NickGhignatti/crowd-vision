package authcontracts

type Membership struct {
	Domain     string `json:"domain"`
	Role       string `json:"role"`
	ExternalID string `json:"externalId,omitempty"`
}

type StandardClaims struct {
	Sub         string       `json:"sub"`
	AccountName string       `json:"accountName"`
	SID         string       `json:"sid"`
	Memberships []Membership `json:"memberships"`
}

func (c StandardClaims) RoleIn(domain string) (string, bool) {
	for _, m := range c.Memberships {
		if m.Domain == domain {
			return m.Role, true
		}
	}
	return "", false
}

func (c StandardClaims) CanIn(domain, required string) bool {
	role, ok := c.RoleIn(domain)
	return ok && Can(role, required)
}

func (c StandardClaims) Tenants() []string {
	tenants := make([]string, len(c.Memberships))
	for i, m := range c.Memberships {
		tenants[i] = m.Domain
	}
	return tenants
}
