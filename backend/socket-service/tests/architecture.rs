use std::path::{Path, PathBuf};

const CORE: &str = "src/core";
const SHELL: &str = "src/shell";

const IO_CRATES: &[&str] = &[
    "use axum",
    "use redis",
    "use reqwest",
    "use socketioxide",
    "use tokio",
    "use tower_http",
    "use prometheus",
];

fn rust_files_under(dir: &str) -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.extension().is_some_and(|e| e == "rs") {
                out.push(path);
            }
        }
    }

    let mut files = Vec::new();
    walk(Path::new(dir), &mut files);
    assert!(
        !files.is_empty(),
        "no rust files under {dir} — a rename would otherwise make every rule below vacuously true"
    );
    files
}

fn assert_absent(files: &[PathBuf], needles: &[&str], reason: &str) {
    for file in files {
        let contents = std::fs::read_to_string(file).unwrap();
        for needle in needles {
            assert!(
                !contents.contains(needle),
                "{} contains `{needle}` — {reason}",
                file.display()
            );
        }
    }
}

#[test]
fn every_source_file_is_classified_as_core_or_shell() {
    let classified: Vec<PathBuf> = rust_files_under(CORE)
        .into_iter()
        .chain(rust_files_under(SHELL))
        .collect();

    for file in rust_files_under("src") {
        let name = file.file_name().unwrap();
        if name == "lib.rs" || name == "main.rs" {
            continue;
        }
        assert!(
            classified.contains(&file),
            "{} lives outside src/core and src/shell, so no architecture rule applies to it",
            file.display()
        );
    }
}

#[test]
fn the_functional_core_touches_no_io_crate() {
    assert_absent(
        &rust_files_under(CORE),
        IO_CRATES,
        "the functional core must stay free of sockets, HTTP, and the broker",
    );
}

#[test]
fn the_functional_core_does_not_reach_into_the_shell() {
    assert_absent(
        &rust_files_under(CORE),
        &["crate::shell", "socket_service::shell"],
        "dependencies point inward: the shell calls the core, never the reverse",
    );
}

#[test]
fn the_functional_core_is_synchronous() {
    assert_absent(
        &rust_files_under(CORE),
        &["async fn", ".await"],
        "a pure function has nothing to await; async here means I/O leaked in",
    );
}

#[test]
fn room_names_are_built_only_in_rooms() {
    let files: Vec<PathBuf> = rust_files_under(CORE)
        .into_iter()
        .chain(rust_files_under(SHELL))
        .filter(|f| f.file_name().unwrap() != "rooms.rs")
        .collect();

    assert_absent(
        &files,
        &["\"building:", "\"domain:"],
        "room names are a wire contract with the browser — build them via core::rooms",
    );
}

#[test]
fn the_claims_header_is_named_only_in_auth() {
    let files: Vec<PathBuf> = rust_files_under(CORE)
        .into_iter()
        .chain(rust_files_under(SHELL))
        .filter(|f| f.file_name().unwrap() != "auth.rs")
        .collect();

    assert_absent(
        &files,
        &["x-gateway-claims"],
        "the claims header name belongs to core::auth, via its CLAIMS_HEADER const",
    );
}

#[test]
fn main_only_composes_and_delegates_to_the_server() {
    assert_absent(
        &[PathBuf::from("src/main.rs")],
        &["::core::", "shell::handlers", "shell::metrics"],
        "main.rs binds a port and installs signals; wiring belongs to shell::server",
    );
}
