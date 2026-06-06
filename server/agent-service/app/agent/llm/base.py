from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class CompletionUsage:
    input_tokens: int
    output_tokens: int
    cost_usd: float


@dataclass
class Completion:
    text: str
    usage: CompletionUsage
    model: str


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolSchema:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema for the tool's args


@dataclass
class ChatTurn:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: CompletionUsage = field(default_factory=lambda: CompletionUsage(0, 0, 0.0))
    model: str = ""


class LLMClient(Protocol):
    model: str

    async def complete(self, messages: list[dict], temperature: float = 0.2) -> Completion: ...

    # Async generator: calling it returns the iterator directly (not a coroutine),
    # so this is a plain `def` returning AsyncIterator — not `async def`.
    def stream(self, messages: list[dict], temperature: float = 0.2) -> AsyncIterator[str]: ...

    async def chat(
        self,
        messages: list[dict],
        tools: list[ToolSchema] | None = None,
        temperature: float = 0.2,
    ) -> ChatTurn: ...
