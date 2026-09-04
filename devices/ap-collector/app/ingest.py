"""Sign, chunk, and POST readings to /telemetry/ingest.

Only the collector's side of the contract: signing algorithm, batch shape, and the 500-reading
chunking rule. `sign` is asserted against `schemas/fixtures/internal-signature.json` -- the
same fixture telemetry's own verifier (`ingest_auth.rs`) checks -- so the two sides can never
silently disagree about what a valid signature is.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Iterable

MAX_BATCH_READINGS = 500


class IngestError(RuntimeError):
    """The batch was not accepted -- transport failure or a non-2xx response."""


def sign(secret: bytes, raw: bytes) -> str:
    return hmac.new(secret, raw, hashlib.sha256).hexdigest()


def _chunks(readings: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(readings), size):
        yield readings[i : i + size]


def post_batch(
    telemetry_url: str,
    secret: bytes,
    building_id: str,
    readings: list[dict[str, Any]],
    timeout: float,
) -> None:
    for chunk in _chunks(readings, MAX_BATCH_READINGS):
        _post_one(telemetry_url, secret, building_id, chunk, timeout)


def _post_one(
    telemetry_url: str,
    secret: bytes,
    building_id: str,
    readings: list[dict[str, Any]],
    timeout: float,
) -> None:
    body = {"buildingId": building_id, "readings": readings}
    raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
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
