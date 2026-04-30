from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from pydantic import BaseModel
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.auth import AuthUser


@dataclass
class ToolContext:
    user: AuthUser
    session: AsyncSession
    citations: list[Any] = field(default_factory=list)


@dataclass
class ToolResult:
    content: Any
    is_error: bool = False
    citations: list[Any] = field(default_factory=list)


class Tool(Protocol):
    name: str
    description: str
    Args: type[BaseModel]

    async def run(self, args: BaseModel, ctx: ToolContext) -> ToolResult: ...
