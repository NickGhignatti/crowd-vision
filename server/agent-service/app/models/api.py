from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    source: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    metadata: dict = Field(default_factory=dict)
    permissions: list[str] = Field(default_factory=list)


class IngestResponse(BaseModel):
    document_id: str
    chunks: int
    skipped: bool


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int | None = None
    stream: bool = True


class CitationModel(BaseModel):
    chunk_id: str
    document_id: str
    source: str
    section_path: str | None = None


class UsageModel(BaseModel):
    input_tokens: int
    output_tokens: int
    cost_usd: float


class AskResponse(BaseModel):
    answer: str
    citations: list[CitationModel]
    usage: UsageModel
    retrieval: dict
    idk: bool
    decision: str
