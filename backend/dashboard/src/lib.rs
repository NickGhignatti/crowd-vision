//! Dashboard's library target.
//!
//! `main.rs` is a thin binary over this crate, and the split is what lets
//! `tests/*.rs` exist at all: an integration test can only import a library
//! target. Before it existed, the MongoDB tests had nowhere to live except
//! in-module behind `#[ignore]`, where `scripts/test/rust-integration-tests.sh`
//! (which runs `tests/*.rs` only) could never see them — so they never ran.

pub mod api;
pub mod infra;
pub mod models;
pub mod state;
pub mod tunnel;
