#!/usr/bin/env python3
"""Print the dorny/paths-filter rules for every service in .github/services.json.

A service's rule matches its own `dir`, the folders in its `depends_on`, and the
service dirs those services depend on in turn. A change to a library therefore
also selects every service built from it, so its consumers rebuild in the same pull
request.

`depends_on` is written by hand, so this also refuses to print when it disagrees with
the code: a declared folder that does not exist, or a local Go `replace ... => ../path`
or Cargo `path = "../path"` that no `depends_on` covers. Either way the filter would
silently stop selecting a service that needs to rebuild.

Usage: python3 scripts/service-filters.py > filter-services.yml

Stdlib only.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY = Path(".github") / "services.json"

# `old => ../path` in a go.mod replace, single line or inside a replace ( ... ) block
GO_LOCAL_REPLACE = re.compile(r"=>\s*(\.{1,2}/\S*)")
CARGO_PATH = re.compile(r"""\bpath\s*=\s*["']([^"']+)["']""")
MANIFESTS = {"go.mod": GO_LOCAL_REPLACE, "Cargo.toml": CARGO_PATH}


def _registry(repo_root: Path) -> list[dict]:
    return json.loads((repo_root / REGISTRY).read_text())


def _declared_closure(entry: dict, entry_by_dir: dict[str, dict]) -> set[str]:
    """The service's depends_on, plus the service dirs its listed services depend on, transitively.

    Only service dirs carry over: a dependency's plain folders (fixtures, json schemas)
    feed that dependency's own tests, not the code its consumers compile.
    """
    folders = {folder.rstrip("/") for folder in entry.get("depends_on", [])} - {entry["dir"]}
    pending = [folder for folder in folders if folder in entry_by_dir]
    while pending:
        for folder in entry_by_dir[pending.pop()].get("depends_on", []):
            folder = folder.rstrip("/")
            if folder in entry_by_dir and folder not in folders and folder != entry["dir"]:
                folders.add(folder)
                pending.append(folder)
    return folders


def build_filters(repo_root: Path) -> dict[str, list[str]]:
    """service key -> [its own dir, then every folder it depends on, sorted]."""
    registry = _registry(repo_root)
    entry_by_dir = {entry["dir"]: entry for entry in registry}
    return {
        entry["key"]: [entry["dir"]] + sorted(_declared_closure(entry, entry_by_dir))
        for entry in registry
    }


def _manifest_dependencies(repo_root: Path, service_dir: str) -> list[tuple[str, str]]:
    """(manifest, repo-relative folder) for every local path a manifest names outside the service."""
    found: list[tuple[str, str]] = []
    for manifest_name, pattern in MANIFESTS.items():
        manifest = repo_root / service_dir / manifest_name
        if not manifest.is_file():
            continue
        for written_path in pattern.findall(manifest.read_text()):
            # normpath, not resolve: the repo may sit behind a symlink
            target = Path(os.path.normpath(repo_root / service_dir / written_path))
            try:
                folder = target.relative_to(repo_root).as_posix()
            except ValueError:
                continue
            # [[bin]] path = "src/main.rs" and the like stay inside the service
            if folder == service_dir or folder.startswith(service_dir + "/"):
                continue
            # a crate in both [dependencies] and [dev-dependencies] is one dependency
            if (f"{service_dir}/{manifest_name}", folder) not in found:
                found.append((f"{service_dir}/{manifest_name}", folder))
    return found


def problems(repo_root: Path) -> list[str]:
    """Every way depends_on disagrees with the repo; empty when the filters can be trusted."""
    registry = _registry(repo_root)
    entry_by_dir = {entry["dir"]: entry for entry in registry}
    found: list[str] = []

    for entry in registry:
        for folder in entry.get("depends_on", []):
            if not (repo_root / folder).is_dir():
                found.append(f"{entry['key']}: depends_on lists {folder}, which does not exist")

        covered = _declared_closure(entry, entry_by_dir)
        for manifest, folder in _manifest_dependencies(repo_root, entry["dir"]):
            if not any(folder == declared or folder.startswith(declared + "/") for declared in covered):
                found.append(
                    f"{entry['key']}: {manifest} builds from {folder}, "
                    f"which is missing from its depends_on in {REGISTRY}"
                )
    return found


def render(filters: dict[str, list[str]]) -> str:
    """The rules as paths-filter YAML: one named filter per service, one glob per folder."""
    lines: list[str] = []
    for service, folders in filters.items():
        lines.append(f"{service}:")
        lines.extend(f'  - "{folder}/**"' for folder in folders)
    return "\n".join(lines) + "\n"


def main() -> int:
    found = problems(REPO_ROOT)
    if found:
        for problem in found:
            print(f"::error::{problem}", file=sys.stderr)
        return 1
    sys.stdout.write(render(build_filters(REPO_ROOT)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
