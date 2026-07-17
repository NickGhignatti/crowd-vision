// CrowdVision's shared authorization policy — the single source of truth
// for every tenant/role decision, evaluated locally in each service (Decision
// A). See schema.cedarschema for the entity shapes these rules read.
//
// Set membership uses `.contains()`, not `in` — Cedar's `in` operator is
// entity-hierarchy membership (is this entity a descendant of that one), not
// a general "is this value in this set" test.

// Read: plain domain membership, any role. Matches twin-service's
// isMemberOf — deliberately NO admin bypass here; a platform admin is not
// automatically a member of every domain.
permit(principal, action == Action::"Read", resource)
when { principal.domainsAsStandardCustomer.contains(resource.domain) };

// ReadWithAdminBypass: domain membership, OR a global admin role anywhere.
// Matches agent-service's can_access_domain (the twin RAG tool — admins can
// read any building regardless of domain membership). 100 is "admin"'s
// weight in roles.json; kept as a literal since this is the one rule that
// needs a fixed ceiling rather than a domain-scoped tier.
permit(principal, action == Action::"ReadWithAdminBypass", resource)
when {
  principal.domainsAsStandardCustomer.contains(resource.domain) ||
  principal.maxRoleWeight >= 100
};

// Edit: business_staff role or higher in the resource's domain. Matches
// twin-service's geometry-mutating routes (move/resize/add/delete rooms).
permit(principal, action == Action::"Edit", resource)
when { principal.domainsAsBusinessStaff.contains(resource.domain) };

// ManageDomain: business_admin role or higher in the resource's domain.
// Matches tenancy-service's invite/createSubdomain/createInviteCode, and
// removing a member other than yourself (self-removal is always allowed and
// is checked before Cedar is even called — it's an identity comparison, not
// a policy decision).
permit(principal, action == Action::"ManageDomain", resource)
when { principal.domainsAsBusinessAdmin.contains(resource.domain) };

// ModelOverride: a global (non-domain-scoped) role-weight gate. The
// required tier is operator-configurable (MODEL_OVERRIDE_MIN_ROLE), so it's
// compared against context rather than a hardcoded weight.
permit(principal, action == Action::"ModelOverride", resource)
when { principal.maxRoleWeight >= context.requiredWeight };

// IngestDocuments: admin role only, globally (non-domain-scoped). Matches
// agent-service's POST /ingest. 100 is "admin"'s weight in roles.json, kept
// as a literal for the same reason as ReadWithAdminBypass above.
permit(principal, action == Action::"IngestDocuments", resource)
when { principal.maxRoleWeight >= 100 };
