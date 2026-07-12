use cedar_policy::{
    Authorizer, Context, Decision, Entities, Entity, EntityId, EntityTypeName, EntityUid,
    PolicySet, Request, RestrictedExpression, Schema,
};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::LazyLock;

use crate::infra::claims::GatewayClaims;

// server/auth-policy and server/auth-contracts are siblings of
// server/twin-service, embedded at compile time via include_str! (unlike the
// TS/Go/Python ports, which read these files from disk at runtime relative
// to the process's CWD -- Rust's include_str! bakes the bytes straight into
// the binary, so the production image never needs the auth-policy directory
// at runtime, only during `cargo build`).
static ROLE_WEIGHTS: LazyLock<HashMap<String, i64>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../auth-contracts/roles.json"))
        .expect("roles.json parses")
});

static SCHEMA: LazyLock<Schema> = LazyLock::new(|| {
    let (schema, _warnings) =
        Schema::from_cedarschema_str(include_str!("../../../auth-policy/schema.cedarschema"))
            .expect("cedar schema parses");
    schema
});

static POLICIES: LazyLock<PolicySet> = LazyLock::new(|| {
    PolicySet::from_str(include_str!("../../../auth-policy/policy.cedar"))
        .expect("cedar policy parses")
});

fn euid(type_name: &str, id: &str) -> EntityUid {
    EntityUid::from_type_name_and_id(
        EntityTypeName::from_str(type_name).expect("static entity type name is valid"),
        EntityId::new(id),
    )
}

fn set_expr(values: HashSet<String>) -> RestrictedExpression {
    RestrictedExpression::new_set(values.into_iter().map(RestrictedExpression::new_string))
}

// Pre-expands raw memberships into the flat per-tier domain sets and max
// role weight policy.cedar reads -- see that file's header comment for why
// this expansion happens here, not inside Cedar itself (Cedar's
// `.contains()` can't do role-weight comparison natively).
fn account_entity(uid: EntityUid, claims: &GatewayClaims) -> Entity {
    let mut standard_customer = HashSet::new();
    let mut business_staff = HashSet::new();
    let mut business_admin = HashSet::new();
    let mut admin = HashSet::new();
    let mut max_weight: i64 = 0;

    let staff_weight = *ROLE_WEIGHTS.get("business_staff").unwrap_or(&i64::MAX);
    let business_admin_weight = *ROLE_WEIGHTS.get("business_admin").unwrap_or(&i64::MAX);
    let admin_weight = *ROLE_WEIGHTS.get("admin").unwrap_or(&i64::MAX);

    for m in &claims.payload.memberships {
        let Some(role) = &m.role else { continue };
        let Some(&weight) = ROLE_WEIGHTS.get(role) else {
            continue;
        };
        if weight > max_weight {
            max_weight = weight;
        }
        standard_customer.insert(m.domain.clone());
        if weight >= staff_weight {
            business_staff.insert(m.domain.clone());
        }
        if weight >= business_admin_weight {
            business_admin.insert(m.domain.clone());
        }
        if weight >= admin_weight {
            admin.insert(m.domain.clone());
        }
    }

    let mut attrs = HashMap::new();
    attrs.insert(
        "domainsAsStandardCustomer".to_string(),
        set_expr(standard_customer),
    );
    attrs.insert(
        "domainsAsBusinessStaff".to_string(),
        set_expr(business_staff),
    );
    attrs.insert(
        "domainsAsBusinessAdmin".to_string(),
        set_expr(business_admin),
    );
    attrs.insert("domainsAsAdmin".to_string(), set_expr(admin));
    attrs.insert(
        "maxRoleWeight".to_string(),
        RestrictedExpression::new_long(max_weight),
    );

    Entity::new(uid, attrs, HashSet::new()).expect("account entity attrs match schema")
}

fn resource_entity(uid: EntityUid, domain: &str) -> Entity {
    let mut attrs = HashMap::new();
    attrs.insert(
        "domain".to_string(),
        RestrictedExpression::new_string(domain.to_string()),
    );
    Entity::new(uid, attrs, HashSet::new()).expect("resource entity attrs match schema")
}

fn authorize(
    claims: &GatewayClaims,
    action: &str,
    domain: &str,
    required_weight: Option<i64>,
) -> bool {
    let principal_uid = euid("Account", "caller");
    let resource_uid = euid("Resource", domain);
    let principal = account_entity(principal_uid.clone(), claims);
    let resource = resource_entity(resource_uid.clone(), domain);

    let context = match required_weight {
        Some(w) => Context::from_pairs([(
            "requiredWeight".to_string(),
            RestrictedExpression::new_long(w),
        )]),
        None => Ok(Context::empty()),
    };
    let context = match context {
        Ok(c) => c,
        Err(e) => {
            log::error!("cedar context build failed: {e}");
            return false;
        }
    };

    let entities = match Entities::from_entities([principal, resource], Some(&SCHEMA)) {
        Ok(e) => e,
        Err(e) => {
            log::error!("cedar entities build failed: {e}");
            return false;
        }
    };
    let request = match Request::new(
        principal_uid,
        euid("Action", action),
        resource_uid,
        context,
        Some(&SCHEMA),
    ) {
        Ok(r) => r,
        Err(e) => {
            log::error!("cedar request build failed: {e}");
            return false;
        }
    };

    let response = Authorizer::new().is_authorized(&request, &POLICIES, &entities);
    response.decision() == Decision::Allow
}

// Plain domain membership, any role -- replaces tenantScope.ts's isMemberOf.
// Deliberately NO admin bypass; a platform admin is not automatically a
// member of every domain.
pub fn is_member_of(claims: &GatewayClaims, domain: &str) -> bool {
    authorize(claims, "Read", domain, None)
}

// business_staff role or higher in one of a building's own domains --
// replaces tenantScope.ts's canEditDomains (geometry-mutating routes:
// move/resize/add/delete rooms). Cedar only decides one (principal, domain)
// pair at a time, so this tries every one of the building's domains and
// permits if any qualifies.
pub fn can_edit_domains(claims: &GatewayClaims, building_domains: &[String]) -> bool {
    building_domains
        .iter()
        .any(|domain| authorize(claims, "Edit", domain, None))
}

// Bulk queries (counts) silently drop domains the caller isn't a member of
// rather than rejecting the whole request -- replaces tenantScope.ts's
// scopeToMemberships, mirroring Mongo's own $in filter.
pub fn scope_to_memberships(requested: &[String], claims: &GatewayClaims) -> Vec<String> {
    requested
        .iter()
        .filter(|domain| authorize(claims, "Read", domain, None))
        .cloned()
        .collect()
}

// Exercises the full 5-action policy bundle (including ReadWithAdminBypass,
// ManageDomain, ModelOverride) even though twin-service's own routes only
// ever need Read/Edit -- exists so the golden conformance suite
// (server/auth-policy/fixtures/conformance.json) can verify this binding
// produces identical decisions to the Go/TS/Python ones for every action,
// matching the precedent set by agent-service's can_override_model.
pub fn authorize_any(
    claims: &GatewayClaims,
    action: &str,
    domain: &str,
    required_weight: Option<i64>,
) -> bool {
    authorize(claims, action, domain, required_weight)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::claims::{ClaimsPayload, Membership};

    fn claims_with(memberships: Vec<(&str, &str)>) -> GatewayClaims {
        GatewayClaims {
            payload: ClaimsPayload {
                sub: "u1".to_string(),
                memberships: memberships
                    .into_iter()
                    .map(|(domain, role)| Membership {
                        domain: domain.to_string(),
                        role: Some(role.to_string()),
                    })
                    .collect(),
            },
            raw: "raw".to_string(),
        }
    }

    #[test]
    fn is_member_of_allows_any_role_in_the_domain() {
        let claims = claims_with(vec![("eng", "standard_customer")]);
        assert!(is_member_of(&claims, "eng"));
        assert!(!is_member_of(&claims, "other"));
    }

    #[test]
    fn can_edit_domains_requires_business_staff_or_higher() {
        let staff = claims_with(vec![("eng", "business_staff")]);
        assert!(can_edit_domains(&staff, &["eng".to_string()]));

        let customer = claims_with(vec![("eng", "standard_customer")]);
        assert!(!can_edit_domains(&customer, &["eng".to_string()]));
    }

    #[test]
    fn can_edit_domains_checks_any_of_the_buildings_domains() {
        let claims = claims_with(vec![("eng", "business_admin")]);
        assert!(can_edit_domains(
            &claims,
            &["other".to_string(), "eng".to_string()]
        ));
    }

    #[test]
    fn scope_to_memberships_drops_domains_the_caller_cannot_read() {
        let claims = claims_with(vec![("eng", "standard_customer")]);
        let scoped = scope_to_memberships(&["eng".to_string(), "other".to_string()], &claims);
        assert_eq!(scoped, vec!["eng".to_string()]);
    }

    #[test]
    fn unrecognized_role_is_ignored_not_treated_as_a_wildcard_grant() {
        let claims = claims_with(vec![("eng", "some_future_role")]);
        assert!(!is_member_of(&claims, "eng"));
    }
}
