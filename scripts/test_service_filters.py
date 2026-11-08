#!/usr/bin/env python3
"""Self-check for service-filters.py. Run directly: python3 scripts/test_service_filters.py"""

import importlib.util
import json
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "service_filters", Path(__file__).resolve().parent / "service-filters.py"
)
service_filters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service_filters)


def _repo(registry: list[dict], files: dict[str, str]) -> Path:
    """A throwaway repo root holding services.json and the given files."""
    repo_root = Path(tempfile.mkdtemp())
    for relative_path, content in {".github/services.json": json.dumps(registry), **files}.items():
        file_path = repo_root / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content)
    return repo_root


REGISTRY = [
    {
        "key": "auth-contracts",
        "dir": "backend/libs/auth-contracts",
        "lang": "go",
        "depends_on": ["schemas/fixtures"],
    },
    {
        "key": "auth-middleware",
        "dir": "backend/libs/auth-middleware",
        "lang": "go",
        "depends_on": ["backend/libs/auth-contracts"],
    },
    {
        "key": "tenancy",
        "dir": "backend/tenancy",
        "lang": "go",
        "depends_on": ["backend/libs/auth-middleware", "schemas/fixtures"],
    },
    {"key": "telemetry-schema", "dir": "schemas/telemetry-schema", "lang": "rust"},
    {
        "key": "twin",
        "dir": "backend/digital-twin",
        "lang": "rust",
        "depends_on": ["schemas/telemetry-schema"],
    },
    {"key": "frontend", "dir": "frontend", "lang": "node"},
]

FILES = {
    "backend/libs/auth-contracts/go.mod": "module example.com/auth-contracts\n",
    "backend/libs/auth-middleware/go.mod": "\n".join([
        "module example.com/auth-middleware",
        "replace example.com/auth-contracts => ../auth-contracts",
    ]),
    # block form; auth-contracts is covered through auth-middleware's own declaration,
    # and a replace pointing at a module version is no folder at all
    "backend/tenancy/go.mod": "\n".join([
        "module example.com/tenancy",
        "replace (",
        "\texample.com/auth-middleware => ../libs/auth-middleware",
        "\texample.com/auth-contracts => ../libs/auth-contracts",
        "\tgolang.org/x/net => golang.org/x/net v0.30.0",
        ")",
    ]),
    "schemas/fixtures/standard-claims.json": "{}",
    "schemas/telemetry-schema/Cargo.toml": "[package]\nname = \"telemetry-schema\"\n",
    # [[bin]] path points inside the service itself, which is no dependency
    "backend/digital-twin/Cargo.toml": "\n".join([
        "[package]",
        'name = "digital-twin"',
        "[[bin]]",
        'path = "src/main.rs"',
        "[dependencies]",
        'telemetry-schema = { path = "../../schemas/telemetry-schema" }',
    ]),
    "frontend/package.json": "{}",
}


def test_a_service_watches_its_dir_its_declared_dirs_and_theirs():
    filters = service_filters.build_filters(_repo(REGISTRY, FILES))
    assert filters["tenancy"] == [
        "backend/tenancy",
        "backend/libs/auth-contracts",  # declared by auth-middleware, which tenancy declares
        "backend/libs/auth-middleware",
        "schemas/fixtures",  # a folder that is no service can be declared too
    ], filters["tenancy"]
    assert filters["twin"] == ["backend/digital-twin", "schemas/telemetry-schema"]


def test_a_service_without_depends_on_watches_only_itself():
    filters = service_filters.build_filters(_repo(REGISTRY, FILES))
    assert filters["frontend"] == ["frontend"]


def test_a_plain_folder_is_not_inherited_by_the_consumers_of_its_declarer():
    """auth-contracts' fixtures feed its own tests, not the code auth-middleware compiles:
    passing them on would rebuild every consumer's image on a fixture change."""
    filters = service_filters.build_filters(_repo(REGISTRY, FILES))
    assert filters["auth-contracts"] == ["backend/libs/auth-contracts", "schemas/fixtures"]
    assert filters["auth-middleware"] == ["backend/libs/auth-middleware", "backend/libs/auth-contracts"]


def test_a_consistent_registry_has_no_problems():
    assert service_filters.problems(_repo(REGISTRY, FILES)) == []


def test_a_local_dependency_missing_from_depends_on_is_reported():
    registry = [dict(entry) for entry in REGISTRY]
    twin = next(entry for entry in registry if entry["key"] == "twin")
    del twin["depends_on"]

    problems = service_filters.problems(_repo(registry, FILES))

    assert len(problems) == 1, problems
    assert "twin" in problems[0] and "schemas/telemetry-schema" in problems[0], problems
    assert "backend/digital-twin/Cargo.toml" in problems[0], problems


def test_a_declared_folder_that_does_not_exist_is_reported():
    registry = [dict(entry) for entry in REGISTRY]
    twin = next(entry for entry in registry if entry["key"] == "twin")
    twin["depends_on"] = ["schemas/telemetry-schema", "schemas/old-name"]

    problems = service_filters.problems(_repo(registry, FILES))

    assert problems == [
        "twin: depends_on lists schemas/old-name, which does not exist"
    ], problems


def test_the_output_is_paths_filter_yaml_one_rule_per_service():
    yaml_text = service_filters.render({"tenancy": ["backend/tenancy", "backend/libs/auth-contracts"]})
    assert yaml_text == 'tenancy:\n  - "backend/tenancy/**"\n  - "backend/libs/auth-contracts/**"\n'


if __name__ == "__main__":
    test_a_service_watches_its_dir_its_declared_dirs_and_theirs()
    test_a_service_without_depends_on_watches_only_itself()
    test_a_plain_folder_is_not_inherited_by_the_consumers_of_its_declarer()
    test_a_consistent_registry_has_no_problems()
    test_a_local_dependency_missing_from_depends_on_is_reported()
    test_a_declared_folder_that_does_not_exist_is_reported()
    test_the_output_is_paths_filter_yaml_one_rule_per_service()
    print("ok")
