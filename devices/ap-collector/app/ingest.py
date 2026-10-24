"""Sign and POST one building's Wi-Fi tick to /telemetry/observations.

`sign` is asserted against `schemas/fixtures/internal-signature.json` -- the same fixture
telemetry's own verifier (`ingest_auth.rs`) checks -- so the two sides can never silently
disagree about what a valid signature is.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import urllib.error
import urllib.request
from typing import Any


class IngestError(RuntimeError):
    """The tick was not accepted -- transport failure or a non-2xx response."""


def sign(secret: bytes, raw: bytes) -> str:
    return hmac.new(secret, raw, hashlib.sha256).hexdigest()


def post_observations(
    telemetry_url: str, secret: bytes, batch: dict[str, Any], timeout: float
) -> None:
    raw = json.dumps(batch, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(  # noqa: S310
        telemetry_url,
        data=raw,
        headers={"content-type": "application/json", "x-signature": sign(secret, raw)},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout):  # noqa: S310
            pass
    except urllib.error.HTTPError as error:
        raise IngestError(f"{telemetry_url} returned {error.code}: {error.reason}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise IngestError(f"{telemetry_url} unreachable: {error}") from error
