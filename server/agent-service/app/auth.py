import base64
import json
from dataclasses import dataclass, field

import jwt
from fastapi import HTTPException, Request, status

from app.config import Settings, get_settings


@dataclass
class AuthUser:
    user_id: str
    roles: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    # The mesh-injected x-gateway-claims header (or, for the eval-token path,
    # the raw eval JWT), kept so downstream tools can forward the caller's
    # identity to other services (e.g. twin-service, which trusts the same
    # header).
    raw_token: str | None = None

    @property
    def permissions(self) -> list[str]:
        return [*self.roles, *self.domains]


def _claims_from_payload(payload: dict) -> tuple[list[str], list[str]]:
    """Extract (roles, domains) from either token shape this service accepts:
    claims-gateway's `memberships:[{domain,role}]`, or the eval tool's flat
    `roles`/`domains` arrays (see _decode_eval_token)."""
    roles = list(payload.get("roles") or [])
    domains = list(payload.get("domains") or [])

    for m in payload.get("memberships") or []:
        if isinstance(m, dict):
            if m.get("role"):
                roles.append(str(m["role"]))
            if m.get("domain"):
                domains.append(str(m["domain"]))

    return list(dict.fromkeys(roles)), list(dict.fromkeys(domains))


def _decode_claims_header(header: str) -> dict:
    # Istio's RequestAuthentication (or, in docker-compose dev, Caddy's
    # forward_auth against claims-gateway's /verify) verifies the gateway JWT
    # once at the edge and injects the validated payload here — agent-service
    # trusts it rather than re-verifying a JWT itself.
    try:
        return json.loads(base64.b64decode(header))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc


def _decode_eval_token(token: str, secret: str) -> dict:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc


def _decode(claims_header: str | None, eval_token: str | None, settings: Settings) -> AuthUser:
    if claims_header is not None:
        payload = _decode_claims_header(claims_header)
        raw = claims_header
    elif eval_token is not None and settings.eval_jwt_secret:
        payload = _decode_eval_token(eval_token, settings.eval_jwt_secret)
        raw = eval_token
    else:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing auth token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token missing subject")

    roles, domains = _claims_from_payload(payload)
    return AuthUser(user_id=str(user_id), roles=roles, domains=domains, raw_token=raw)


async def require_user(request: Request) -> AuthUser:
    settings = get_settings()

    if not settings.require_auth:
        return AuthUser(user_id="anonymous")

    claims_header = request.headers.get("x-gateway-claims")

    eval_token = None
    if claims_header is None:
        # local-dev eval-runner bypass only — see evals/run_evals.py, which
        # sends its self-minted token as a cookie (matching how a real
        # browser session cookie would arrive). This path never reaches the
        # mesh, so it still needs its own HS256 check.
        eval_token = request.cookies.get(settings.jwt_cookie_name)
        if not eval_token:
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                eval_token = auth_header.split(" ", 1)[1].strip()

    return _decode(claims_header, eval_token, settings)
