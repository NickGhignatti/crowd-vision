from __future__ import annotations

from typing import TYPE_CHECKING

from app.agent.llm.base import ToolSchema

if TYPE_CHECKING:
    from app.agent.tools.base import Tool


def _strip_for_gemini(schema: dict) -> dict:
    """Gemini's FunctionDeclaration parameters reject some JSON-Schema keys
    (e.g. ``$defs``, ``title``). Strip them recursively so the same Pydantic
    schema works across providers."""
    drop = {"title", "$defs", "definitions", "additionalProperties"}
    if isinstance(schema, dict):
        return {k: _strip_for_gemini(v) for k, v in schema.items() if k not in drop}
    if isinstance(schema, list):
        return [_strip_for_gemini(v) for v in schema]
    return schema


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"tool {tool.name!r} already registered")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def all(self) -> list[Tool]:
        return list(self._tools.values())

    def schemas(self) -> list[ToolSchema]:
        out: list[ToolSchema] = []
        for t in self._tools.values():
            params = _strip_for_gemini(t.Args.model_json_schema())
            out.append(ToolSchema(name=t.name, description=t.description, parameters=params))
        return out


REGISTRY = ToolRegistry()
