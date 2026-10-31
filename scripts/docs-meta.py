#!/usr/bin/env python3
"""Write the last real change of every guide page to a JSON file for the site."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "documentation"


def last_change(path):
    # --diff-filter=M skips renames, so moving a page does not read as an edit to it.
    for extra in (["--follow", "--diff-filter=M"], []):
        out = subprocess.run(
            ["git", "log", "-1", "--format=%h %cs", *extra, "--", str(path)],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.split()
        if out:
            return out
    return None


def main():
    pages = {}
    for path in [DOCS / "main.qd", *sorted((DOCS / "docs").rglob("*.qd"))]:
        change = last_change(path)
        if change:
            slug = "" if path.name == "main.qd" else path.stem
            pages[slug] = {"path": str(path.relative_to(ROOT)), "commit": change[0], "date": change[1]}
    manifest = json.loads((ROOT / ".release-please-manifest.json").read_text(encoding="utf-8"))
    pages["_version"] = "v" + manifest["."]
    Path(sys.argv[1]).write_text(json.dumps(pages, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
