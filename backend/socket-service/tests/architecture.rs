use std::path::Path;

const CORE: &[&str] = &["src/auth.rs", "src/relay.rs", "src/rooms.rs"];
const SHELL: &[&str] = &["src/handlers.rs", "src/server.rs", "src/main.rs"];

const IO_CRATES: &[&str] = &[
    "use axum",
    "use redis",
    "use socketioxide",
    "use tokio",
    "use tower_http",
    "use prometheus",
];

const SHELL_MODULES: &[&str] = &[
    "crate::handlers",
    "crate::server",
    "crate::metrics",
    "socket_service::",
];

fn read(file: &str) -> String {
    assert!(Path::new(file).exists(), "{file} is missing");
    std::fs::read_to_string(file).unwrap()
}

fn assert_absent(file: &str, needles: &[&str], reason: &str) {
    let contents = read(file);
    for needle in needles {
        assert!(
            !contents.contains(needle),
            "{file} contains `{needle}` — {reason}"
        );
    }
}

#[test]
fn the_functional_core_touches_no_io_crate() {
    for file in CORE {
        assert_absent(
            file,
            IO_CRATES,
            "the functional core must stay free of sockets, HTTP, and the broker",
        );
    }
}

#[test]
fn the_functional_core_does_not_reach_into_the_shell() {
    for file in CORE {
        assert_absent(
            file,
            SHELL_MODULES,
            "dependencies point inward: the shell calls the core, never the reverse",
        );
    }
}

#[test]
fn the_functional_core_is_synchronous() {
    for file in CORE {
        assert_absent(
            file,
            &["async fn", ".await"],
            "a pure function has nothing to await; async here means I/O leaked in",
        );
    }
}

#[test]
fn room_names_are_built_only_in_rooms() {
    for file in CORE.iter().chain(SHELL).filter(|f| **f != "src/rooms.rs") {
        assert_absent(
            file,
            &["\"building:", "\"domain:"],
            "room names are a wire contract with the browser — build them via rooms.rs",
        );
    }
}

#[test]
fn the_claims_header_is_named_only_in_auth() {
    for file in CORE.iter().chain(SHELL).filter(|f| **f != "src/auth.rs") {
        assert_absent(
            file,
            &["x-gateway-claims"],
            "the claims header name belongs to auth.rs, via its CLAIMS_HEADER const",
        );
    }
}

#[test]
fn main_only_composes_and_delegates_to_the_server() {
    assert_absent(
        "src/main.rs",
        &[
            "crate::auth",
            "::auth::",
            "::relay::",
            "::rooms::",
            "::handlers::",
        ],
        "main.rs binds a port and installs signals; wiring belongs to server.rs",
    );
}
