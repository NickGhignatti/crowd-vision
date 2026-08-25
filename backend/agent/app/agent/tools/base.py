from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, TypeVar

from pydantic import BaseModel

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.auth import AuthUser

# Without the TypeVar, the protocol claims every tool's run accepts any BaseModel,
# but e.g. SearchDocsTool.run only accepts SearchDocsArgs; ArgsT lets pyright bind it.
ArgsT = TypeVar("ArgsT", bound=BaseModel)


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


class Tool(Protocol[ArgsT]):
    name: str
    description: str
    Args: type[ArgsT]

    async def run(self, args: ArgsT, ctx: ToolContext) -> ToolResult: ...
