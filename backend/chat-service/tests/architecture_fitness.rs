use std::path::{Path, PathBuf};

fn files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files_under(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

fn assert_no_forbidden_imports(dir: &str, forbidden: &[&str]) {
    let mut files = Vec::new();
    files_under(Path::new(dir), &mut files);
    for file in files {
        let contents = std::fs::read_to_string(&file).unwrap();
        for pattern in forbidden {
            assert!(
                !contents.contains(pattern),
                "{dir} must not depend on {pattern} ({})",
                file.display()
            );
        }
    }
}

#[test]
fn domain_has_no_framework_dependencies() {
    assert_no_forbidden_imports(
        "src/domain",
        &[
            "axum",
            "mongodb",
            "reqwest",
            "bson",
            "crate::adapters",
            "crate::service",
        ],
    );
}

#[test]
fn service_has_no_framework_or_adapter_dependencies() {
    assert_no_forbidden_imports(
        "src/service",
        &["axum", "mongodb", "reqwest", "bson", "crate::adapters"],
    );
}

#[test]
fn driving_adapters_do_not_reach_into_driven_adapters() {
    assert_no_forbidden_imports("src/adapters/driving", &["crate::adapters::driven"]);
}

#[test]
fn the_claims_header_is_only_named_by_the_identity_domain() {
    let mut files = Vec::new();
    files_under(Path::new("src"), &mut files);
    let owners: Vec<PathBuf> = files
        .into_iter()
        .filter(|file| {
            std::fs::read_to_string(file)
                .unwrap()
                .contains("\"x-gateway-claims\"")
        })
        .collect();

    assert_eq!(
        owners,
        vec![PathBuf::from("src/domain/identity.rs")],
        "the raw claims header literal must live only in the identity domain"
    );
}

/// The bson crate renders an ObjectId as `{"$oid": "..."}`. Every id the API returns
/// must have been mapped to a bare string first, which only the persistence adapter
/// is allowed to do — so ObjectId must not appear anywhere else.
#[test]
fn object_ids_never_escape_the_persistence_adapter() {
    let mut files = Vec::new();
    files_under(Path::new("src"), &mut files);
    let owners: Vec<PathBuf> = files
        .into_iter()
        .filter(|file| std::fs::read_to_string(file).unwrap().contains("ObjectId"))
        .collect();

    assert_eq!(
        owners,
        vec![PathBuf::from(
            "src/adapters/driven/persistence/conversations.rs"
        )],
        "ObjectId must stay inside the persistence adapter"
    );
}

/// A blanket camelCase rename would silently rewrite the citation fields, which are
/// agent-service's Python payload and are stored and returned as-is.
#[test]
fn no_module_applies_a_blanket_camel_case_rename() {
    assert_no_forbidden_imports("src", &["rename_all = \"camelCase\""]);
}
