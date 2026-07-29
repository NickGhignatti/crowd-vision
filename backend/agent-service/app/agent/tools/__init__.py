from app.agent.tools.base import Tool, ToolContext, ToolResult
from app.agent.tools.registry import REGISTRY, ToolRegistry
from app.agent.tools.search_docs import SearchDocsTool
from app.agent.tools.sensor import (
    GetLatestSensorDataTool,
    GetSensorHistoryTool,
    ListSensorsTool,
)
from app.agent.tools.twin import (
    GetBuildingTool,
    GetRoomTool,
    ListBuildingsTool,
    ListRoomsTool,
)

REGISTRY.register(SearchDocsTool())
REGISTRY.register(ListBuildingsTool())
REGISTRY.register(GetBuildingTool())
REGISTRY.register(ListRoomsTool())
REGISTRY.register(GetRoomTool())
REGISTRY.register(GetLatestSensorDataTool())
REGISTRY.register(GetSensorHistoryTool())
REGISTRY.register(ListSensorsTool())

__all__ = ["REGISTRY", "Tool", "ToolContext", "ToolRegistry", "ToolResult"]
