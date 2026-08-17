use std::path::Path;

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

fn list_dir(dir: &str) -> Vec<std::path::PathBuf> {
    std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|entry| entry.is_dir())
        .collect()
}

fn assert_forbidden_imports(dir: &str, forbidden: &[&str]) {
    let mut files = Vec::new();
    file_under_dir(Path::new(dir), &mut files);
    for file in files {
        let content = std::fs::read_to_string(&file).unwrap();
        for forbidden in forbidden {
            assert!(
                !content.contains(forbidden),
                "file {} ({dir}) contains forbidden import {}",
                file.display(),
                forbidden
            );
        }
    }
}

#[test]
fn test_kernel_imports() {
    assert_forbidden_imports("src/kernel", &["crate::plugins"]);
}

#[test]
fn test_plugins_not_depends_on_plugins() {
    let mut plugins = list_dir("src/plugins");
    plugins.retain(|value| value.file_name().and_then(|n| n.to_str()).unwrap() != "common");
    for plugin in plugins {
        assert_forbidden_imports(plugin.to_str().unwrap(), &["crate::plugins"]);
    }
}

#[test]
fn test_core_not_depends_on_adapters() {
    assert_forbidden_imports("src/kernel", &["crate::adapters"]);
    assert_forbidden_imports("src/plugins", &["crate::adapters"]);
    assert_forbidden_imports("src/contracts", &["crate::adapters"]);
}

#[test]
fn test_contracts_not_depends_on_anything() {
    assert_forbidden_imports(
        "src/contracts",
        &["crate::adapters", "crate::plugins", "crate::kernel"],
    );
}
