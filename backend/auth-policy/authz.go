package authpolicy

import (
	"github.com/cedar-policy/cedar-go"

	authcontracts "github.com/NickGhignatti/crowd-vision/server/auth-contracts"
)

// Pre-expands raw memberships into the flat per-tier domain
// sets and max role weight policy.cedar reads.
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

func CanRead(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "Read", domain, nil)
}

func CanReadWithAdminBypass(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "ReadWithAdminBypass", domain, nil)
}

func CanEdit(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "Edit", domain, nil)
}

func CanManageDomain(memberships []authcontracts.Membership, domain string) bool {
	return authorize(memberships, "ManageDomain", domain, nil)
}

// CanOverrideModelWeight is a GLOBAL role-weight gate; no Go service needs it yet, but it's
// exposed so the golden conformance suite verifies it decides identically in every language.
func CanOverrideModelWeight(memberships []authcontracts.Membership, requiredWeight int64) bool {
	return authorize(memberships, "ModelOverride", "", cedar.RecordMap{
		"requiredWeight": cedar.Long(requiredWeight),
	})
}

// CanIngestDocuments is a GLOBAL, admin-only gate for agent-service's POST /ingest, exposed
// for the same conformance-suite reason as CanOverrideModelWeight above.
func CanIngestDocuments(memberships []authcontracts.Membership) bool {
	return authorize(memberships, "IngestDocuments", "", nil)
}
