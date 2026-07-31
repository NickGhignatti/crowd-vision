use cucumber::{then, when};

use crate::support::world::TwinWorld;

#[when("the completion event for that upload is redelivered")]
async fn redeliver_completion(world: &mut TwinWorld) {
    let id = world.handle().to_string();
    world
        .provisioning
        .resolve(&id, None)
        .await
        .expect("redelivered resolve failed");
}

#[then(expr = "organization {string} holds exactly one building")]
async fn holds_exactly_one_building(world: &mut TwinWorld, domain: String) {
    world
        .call("GET", &format!("/buildings/{domain}"), &domain, None)
        .await;
    let count = world.body.as_array().map_or(0, Vec::len);
    assert_eq!(
        count, 1,
        "expected exactly one building, got {}",
        world.body
    );
}
