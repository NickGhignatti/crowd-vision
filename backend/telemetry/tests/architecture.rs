use std::path::Path;

const IO_CRATES: &[&str] = &[
    "use sqlx",
    "use redis",
    "use rdkafka",
    "use axum",
    "use reqwest",
    "use prometheus",
];

fn file_is_rust(path: &Path) -> bool {
    path.extension().is_some_and(|e| e == "rs")
}

fn file_under_dir(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            file_under_dir(&path, out);
        } else if file_is_rust(&path) {
            out.push(path);
        }
    }
}

fn assert_forbidden_imports<S: AsRef<str>>(dir: &str, forbidden: &[S]) {
    let mut files = Vec::new();
    file_under_dir(Path::new(dir), &mut files);
    assert!(!files.is_empty(), "no rust files under {dir}");
    for file in files {
        let content = std::fs::read_to_string(&file).unwrap();
        for forbidden in forbidden {
            assert!(
                !content.contains(forbidden.as_ref()),
                "file {} ({dir}) contains forbidden import {}",
                file.display(),
                forbidden.as_ref()
            );
        }
    }
}

#[test]
fn test_kernel_imports() {
    assert_forbidden_imports("src/kernel", &["crate::plugins", "crate::adapters"]);
    assert_forbidden_imports("src/kernel", IO_CRATES);
}

fn plugin_names() -> Vec<String> {
    let mut files = Vec::new();
    file_under_dir(Path::new("src/plugins"), &mut files);
    let mut names: Vec<String> = files
        .iter()
        .map(|p| p.file_stem().and_then(|n| n.to_str()).unwrap().to_owned())
        .filter(|n| n != "common")
        .collect();
    names.sort();
    names
}

#[test]
fn test_plugins_not_depends_on_plugins() {
    let plugins = plugin_names();
    assert!(!plugins.is_empty(), "no plugins found under src/plugins");
    for me in &plugins {
        let siblings: Vec<String> = plugins
            .iter()
            .filter(|n| *n != me)
            .map(|n| format!("crate::plugins::{n}"))
            .collect();
        let path = format!("src/plugins/{me}.rs");
        let content = std::fs::read_to_string(&path).unwrap();
        for sibling in &siblings {
            assert!(
                !content.contains(sibling),
                "plugin {me} imports sibling {sibling}"
            );
        }
    }
}

#[test]
fn test_plugins_imports() {
    assert_forbidden_imports("src/plugins", &["crate::kernel", "crate::adapters"]);
    assert_forbidden_imports("src/plugins", IO_CRATES);
}

#[test]
fn test_core_not_depends_on_adapters() {
    assert_forbidden_imports("src/kernel", &["crate::adapters"]);
    assert_forbidden_imports("src/plugins", &["crate::adapters"]);
}

#[test]
fn test_types_not_depends_on_anything() {
    assert_forbidden_imports(
        "src/types",
        &["crate::adapters", "crate::plugins", "crate::kernel"],
    );
    assert_forbidden_imports("src/types", IO_CRATES);
}
