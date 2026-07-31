// Shared across two separate test binaries (`api`, `cucumber`), each of
// which only exercises part of this surface — dead_code runs per-binary, so
// without this every helper the *other* binary owns reports as unused here.
#[allow(dead_code)]
pub mod fixtures;
#[allow(dead_code)]
pub mod http_client;
#[allow(dead_code)]
pub mod registration;
#[allow(dead_code)]
pub mod test_app;
#[allow(dead_code)]
pub mod world;
