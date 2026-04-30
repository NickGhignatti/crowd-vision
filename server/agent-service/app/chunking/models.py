from dataclasses import dataclass, field
from typing import Literal

ChunkKind = Literal["text", "code", "table", "heading"]


@dataclass
class Chunk:
    content: str
    kind: ChunkKind
    section_path: str
    token_count: int
    metadata: dict = field(default_factory=dict)
