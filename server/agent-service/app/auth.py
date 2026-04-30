from dataclasses import dataclass, field

import jwt
from fastapi import HTTPException, Request, status

from app.config import get_settings


@dataclass
class AuthUser:
    user_id: str
    roles: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)

    @property
    def permissions(self) -> list[str]:
        return [*self.roles, *self.domains]


def _decode(token: str, secret: str) -> AuthUser:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc

    user_id = (
        payload.get("sub")
        or payload.get("user_id")
        or payload.get("id")
        or payload.get("accountId")
        or payload.get("accountName")
    )
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token missing subject")

    roles = payload.get("roles") or ([payload["role"]] if payload.get("role") else [])
    domains = payload.get("domains") or ([payload["domain"]] if payload.get("domain") else [])

    memberships = payload.get("accountMemberships") or []
    for m in memberships:
        if isinstance(m, dict):
            if m.get("role"):
                roles.append(str(m["role"]))
            if m.get("domainName"):
                domains.append(str(m["domainName"]))

    return AuthUser(
        user_id=str(user_id),
        roles=list(dict.fromkeys(roles)),
        domains=list(dict.fromkeys(domains)),
    )


async def require_user(request: Request) -> AuthUser:
    settings = get_settings()

    if not settings.require_auth:
        return AuthUser(user_id="anonymous")

    if not settings.jwt_secret:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "JWT_SECRET not configured")

    token = request.cookies.get(settings.jwt_cookie_name)
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing auth token")

    return _decode(token, settings.jwt_secret)
