"""Bazel py_test entry point — rules_python has no native pytest integration.

Hardcodes what pyproject.toml's [tool.pytest.ini_options] sets, since the
Bazel sandbox doesn't reliably surface pyproject.toml to pytest's config
discovery the way a plain `uv run pytest` invocation does.
"""

import sys

import pytest

if __name__ == "__main__":
    raise SystemExit(pytest.main(["--asyncio-mode=auto", *sys.argv[1:]]))
