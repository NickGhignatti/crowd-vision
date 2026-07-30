mod steps;
mod support;

use cucumber::World;

use support::world::TwinWorld;

#[tokio::main]
async fn main() {
    TwinWorld::cucumber()
        .max_concurrent_scenarios(1)
        .run_and_exit("tests/features")
        .await;
}
