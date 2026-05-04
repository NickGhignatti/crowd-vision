"""Unit-test environment shim.

Some app modules (notably `app.agent.tools.search_docs`) instantiate the Gemini
embedder at import time. The embedder rejects an empty API key, so to import any
sibling tool module from a unit test we need a non-empty placeholder. The value
is never used — unit tests stub HTTP/embedding boundaries.
"""

from __future__ import annotations

import os

os.environ.setdefault("GOOGLE_API_KEY", "test-placeholder")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-placeholder")
os.environ.setdefault("JWT_SECRET", "test-placeholder")
