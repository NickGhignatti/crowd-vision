package authpolicy

import (
	"github.com/cedar-policy/cedar-go"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

// accountEntity pre-expands raw memberships into the flat per-tier domain
// sets and max role weight policy.cedar reads — see that file's header
// comment for why this expansion happens here, not inside Cedar itself
// (Cedar's `.contains()` can't do role-weight comparison natively).
func accountEntity(memberships []authcontracts.Membership) cedar.Entity {
	var standardCustomer, businessStaff, businessAdmin, admin []cedar.Value
	maxWeight := 0

	businessStaffWeight := authcontracts.RoleWeights["business_staff"]
	businessAdminWeight := authcontracts.RoleWeights["business_admin"]
	adminWeight := authcontracts.RoleWeights["admin"]

	for _, m := range memberships {
		weight, ok := authcontracts.RoleWeights[m.Role]
		if !ok {
			continue
		}
		if weight > maxWeight {
			maxWeight = weight
		}
		domain := cedar.String(m.Domain)
		standardCustomer = append(standardCustomer, domain)
		if weight >= businessStaffWeight {
			businessStaff = append(businessStaff, domain)
		}
		if weight >= businessAdminWeight {
			businessAdmin = append(businessAdmin, domain)
		}
		if weight >= adminWeight {
			admin = append(admin, domain)
		}
	}

	return cedar.Entity{
		UID: cedar.NewEntityUID("Account", "caller"),
		Attributes: cedar.NewRecord(cedar.RecordMap{
			"domainsAsStandardCustomer": cedar.NewSet(standardCustomer...),
			"domainsAsBusinessStaff":    cedar.NewSet(businessStaff...),
			"domainsAsBusinessAdmin":    cedar.NewSet(businessAdmin...),
			"domainsAsAdmin":            cedar.NewSet(admin...),
			"maxRoleWeight":             cedar.Long(maxWeight),
		}),
	}
}

func resourceEntity(domain string) cedar.Entity {
	return cedar.Entity{
		UID: cedar.NewEntityUID("Resource", cedar.String(domain)),
		Attributes: cedar.NewRecord(cedar.RecordMap{
			"domain": cedar.String(domain),
		}),
	}
}

func authorize(memberships []authcontracts.Membership, action, domain string, context cedar.RecordMap) bool {
	principal := accountEntity(memberships)
	resource := resourceEntity(domain)
	entities := cedar.EntityMap{
		principal.UID: principal,
		resource.UID:  resource,
	}
	decision, _ := policySet.IsAuthorized(entities, cedar.Request{
		Principal: principal.UID,
		Action:    cedar.NewEntityUID("Action", cedar.String(action)),
		Resource:  resource.UID,
		Context:   cedar.NewRecord(context),
	})
	return decision == cedar.Allow
}

// CanRead is plain domain membership, any role.
func CanRead(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "Read", domain, nil)
}

// CanReadWithAdminBypass is domain membership OR a global admin role anywhere.
func CanReadWithAdminBypass(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "ReadWithAdminBypass", domain, nil)
}

// CanEdit requires business_staff role or higher in domain.
func CanEdit(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "Edit", domain, nil)
}

// CanManageDomain requires business_admin role or higher in domain — the
// tenancy-service gate for invite/createSubdomain/createInviteCode, and
// removing a member other than yourself (self-removal is checked by the
// caller before this, as an identity comparison, not a policy decision).
func CanManageDomain(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "ManageDomain", domain, nil)
}

// CanOverrideModelWeight is a GLOBAL (non-domain-scoped) role-weight gate —
// no Go service currently needs this (it backs agent-service's
// MODEL_OVERRIDE_MIN_ROLE, Python-only today), but it's exposed so the
// golden conformance suite (fixtures/conformance.json) can verify this
// action decides identically in every language, not just the ones with a
// real caller yet.
func CanOverrideModelWeight(memberships []authcontracts.Membership, requiredWeight int64) bool {
	return authorize(memberships, "ModelOverride", "", cedar.RecordMap{
		"requiredWeight": cedar.Long(requiredWeight),
	})
}
