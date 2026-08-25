use cucumber::{given, then, when};

use crate::steps::registration::{acknowledged, handle_reports, upload_valid};
use crate::support::world::TwinWorld;

#[given(expr = "a twin has been provisioned in organization {string}")]
async fn twin_provisioned(world: &mut TwinWorld, domain: String) {
    upload_valid(world, domain).await;
    acknowledged(world).await;
    handle_reports(world, "ready".to_string()).await;
}

#[when(expr = "a member of organization {string} lists its buildings")]
pub async fn lists_buildings(world: &mut TwinWorld, domain: String) {
    let path = format!("/buildings/{domain}");
    world.call("GET", &path, &domain, None).await;
}

#[then(expr = "organization {string} holds no buildings")]
async fn holds_no_buildings(world: &mut TwinWorld, domain: String) {
    lists_buildings(world, domain).await;
    no_building_listed(world).await;
}

#[then("no building is listed")]
async fn no_building_listed(world: &mut TwinWorld) {
    let listed = world.body.as_array().map_or(0, Vec::len);
    assert_eq!(listed, 0, "expected no buildings, got {}", world.body);
}
