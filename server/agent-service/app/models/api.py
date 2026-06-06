from pydantic import BaseModel, ConfigDict, Field


class IngestRequest(BaseModel):
    source: str = Field(
        ..., min_length=1, description="Stable identifier for the document (e.g. file path or URL)."
    )
    content: str = Field(..., min_length=1, description="Raw markdown content to ingest.")
    metadata: dict = Field(
        default_factory=dict,
        description="Free-form metadata stored alongside the document.",
    )
    permissions: list[str] = Field(
        default_factory=list,
        description="Role/domain identifiers allowed to retrieve chunks from this document. "
        "Empty list means public to any authenticated user.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "source": "documentation/getting-started.md",
                "content": "# Getting started\n\nCrowd-Vision is...",
                "metadata": {"team": "platform"},
                "permissions": ["domain:acme"],
            }
        }
    )


class IngestResponse(BaseModel):
    document_id: str = Field(..., description="UUID of the upserted document.")
    chunks: int = Field(..., description="Number of chunks produced.")
    skipped: bool = Field(
        ..., description="True if the document was already present (same content hash)."
    )


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Natural-language question for the agent.")
    top_k: int | None = Field(
        default=None, description="Override default retrieval depth for `search_docs`."
    )
    stream: bool = Field(
        default=True,
        description="If true, return Server-Sent Events. If false, return a single JSON response.",
    )
    model: str | None = Field(
        default=None,
        description="Override the chat model for this request (an OpenRouter model id, "
        "e.g. 'google/gemini-2.5-flash'). Defaults to the server's ANSWER_MODEL. "
        "Embeddings/retrieval are unaffected — for A/B evaluating generators. "
        "**Privileged:** requires the MODEL_OVERRIDE_MIN_ROLE role (default "
        "business_admin) and, when configured, the model must be in ALLOWED_MODELS.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "question": "Which rooms are over capacity in building HQ right now?",
                "stream": False,
            }
        }
    )


class CitationModel(BaseModel):
    chunk_id: str = Field(..., description="UUID of the cited chunk.")
    document_id: str = Field(..., description="UUID of the parent document.")
    source: str = Field(..., description="Original source identifier (file path or URL).")
    section_path: str | None = Field(
        default=None, description="Heading hierarchy of the chunk, e.g. 'Top > Sub'."
    )


class UsageModel(BaseModel):
    input_tokens: int
    output_tokens: int
    cost_usd: float = Field(..., description="Estimated USD cost of the request.")


class AskResponse(BaseModel):
    answer: str = Field(..., description="Final answer with inline `[^chunk_id]` citation markers.")
    citations: list[CitationModel] = Field(
        ..., description="Resolved citations for every valid `[^chunk_id]` marker in `answer`."
    )
    usage: UsageModel
    retrieval: dict = Field(
        ...,
        description="Diagnostic payload: `tool_calls` (trace of tools the agent ran) and "
        "`hallucinated_citations` (markers the model invented; stripped from `answer`).",
    )
    idk: bool = Field(
        ..., description="True if the agent emitted the IDK marker because it couldn't answer."
    )
    decision: str = Field(
        ..., description="`answered` on success, `tool_loop_exhausted` if hop limit was hit."
    )
