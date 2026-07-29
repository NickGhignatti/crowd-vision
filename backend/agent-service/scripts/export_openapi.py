"""Dump the FastAPI OpenAPI schema to disk as JSON and YAML.

Usage:
    uv run python scripts/export_openapi.py [--out openapi]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Stubs so `app.main` imports cleanly without real credentials — schema export
# never makes outbound calls.
os.environ.setdefault("GEMINI_API_KEY", "stub-for-openapi-export")
os.environ.setdefault("JWT_PUBLIC_KEY", "stub")


def _to_yaml(obj: object, indent: int = 0) -> str:
    """Tiny YAML dumper. Avoids adding a runtime dep just for export."""
    pad = "  " * indent
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        out: list[str] = []
        for k, v in obj.items():
            key = str(k)
            if isinstance(v, dict | list) and v:
                out.append(f"{pad}{key}:")
                out.append(_to_yaml(v, indent + 1))
            else:
                out.append(f"{pad}{key}: {_to_yaml(v, indent + 1).lstrip()}")
        return "\n".join(out)
    if isinstance(obj, list):
        if not obj:
            return "[]"
        out = []
        for item in obj:
            if isinstance(item, dict | list) and item:
                out.append(f"{pad}-")
                out.append(_to_yaml(item, indent + 1))
            else:
                out.append(f"{pad}- {_to_yaml(item, indent + 1).lstrip()}")
        return "\n".join(out)
    if isinstance(obj, bool):
        return "true" if obj else "false"
    if obj is None:
        return "null"
    if isinstance(obj, int | float):
        return str(obj)
    s = str(obj)
    if any(ch in s for ch in ":#\n\"'") or s.strip() != s or s == "":
        return json.dumps(s)
    return s


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="openapi", help="Output basename (no extension).")
    args = parser.parse_args()

    # Import lazily so `--help` works without app deps.
    from app.main import app

    schema = app.openapi()
    base = Path(args.out)
    base.with_suffix(".json").write_text(json.dumps(schema, indent=2) + "\n")
    base.with_suffix(".yaml").write_text(_to_yaml(schema) + "\n")
    print(f"wrote {base.with_suffix('.json')} and {base.with_suffix('.yaml')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
