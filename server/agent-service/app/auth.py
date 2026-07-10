from dataclasses import dataclass, field

import jwt
from fastapi import HTTPException, Request, status

from app.config import Settings, get_settings
from app.gateway_jwks import GatewayJwksError, get_gateway_signing_key
from app.roles import ROLE_WEIGHTS


@dataclass
class AuthUser:
    user_id: str
    roles: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    # Raw JWT, kept so downstream tools can forward the caller's identity to other
    # services (e.g. twin-service, which now authenticates its routes).
    raw_token: str | None = None

    @property
    def permissions(self) -> list[str]:
        return [*self.roles, *self.domains]

    @property
    def max_role_weight(self) -> int:
        return max((ROLE_WEIGHTS.get(r, 0) for r in self.roles), default=0)

    def has_role_at_least(self, role: str) -> bool:
        """True if the caller's highest role weight meets/exceeds `role`'s weight."""
        return self.max_role_weight >= ROLE_WEIGHTS.get(role, 101)


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


async def _decode_gateway_token(token: str, settings: Settings) -> dict:
    if not settings.gateway_jwks_uri:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "GATEWAY_JWKS_URI not configured"
        )
    try:
        header = jwt.get_unverified_header(token)
        signing_key = await get_gateway_signing_key(header.get("kid"), settings.gateway_jwks_uri)
        return jwt.decode(
            token,
            key=signing_key.key,
            algorithms=["RS256"],
            issuer=settings.gateway_issuer,
        )
    except (jwt.PyJWTError, GatewayJwksError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc


def _decode_eval_token(token: str, secret: str) -> dict:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc


async def _decode(token: str, settings: Settings) -> AuthUser:
    # The header's `alg` only ROUTES to a verification path; it never selects
    # which key/secret is used within that path (both are our own trusted
    # material), so a forged header can't trick the eval path into skipping
    # gateway verification — see test_auth.py's alg-confusion case.
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc

    if header.get("alg") == "HS256" and settings.eval_jwt_secret:
        payload = _decode_eval_token(token, settings.eval_jwt_secret)
    else:
        payload = await _decode_gateway_token(token, settings)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token missing subject")

    roles, domains = _claims_from_payload(payload)
    return AuthUser(user_id=str(user_id), roles=roles, domains=domains)


async def require_user(request: Request) -> AuthUser:
    settings = get_settings()

    if not settings.require_auth:
        return AuthUser(user_id="anonymous")

    token = request.cookies.get(settings.jwt_cookie_name)
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing auth token")

    user = await _decode(token, settings)
    user.raw_token = token
    return user
