import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.llm import LLMClient, get_llm
from app.agent.loop import Agent
from app.auth import AuthUser, require_user
from app.config import get_settings
from app.db import get_session
from app.models.api import AskRequest, AskResponse, CitationModel, UsageModel

router = APIRouter(tags=["ask"])
_agent = Agent()


def _resolve_override_llm(model: str | None, user: AuthUser) -> LLMClient | None:
    """Validate a per-request model override and return its client (or None).

    The override spends the shared OpenRouter balance, so it is a privileged eval/ops
    feature: gated behind `MODEL_OVERRIDE_MIN_ROLE` and, when configured, an
    `ALLOWED_MODELS` allowlist. Returns None when no override was requested.
    """
    if not model:
        return None
    settings = get_settings()
    if not user.has_role_at_least(settings.model_override_min_role):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"model override requires role '{settings.model_override_min_role}' or higher",
        )
    allowed = settings.allowed_models_set
    if allowed and model not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"model '{model}' is not in the allowed set: {sorted(allowed)}",
        )
    return get_llm(model)


@router.post(
    "/ask",
    response_model=AskResponse,
    summary="Ask the agent a question",
    description=(
        "Runs the tool-calling loop and returns an answer with citations and a "
        "tool-call trace. If `stream=true` (default), the response is a "
        "Server-Sent Events stream of `{type: 'token', text}` events terminated "
        "by a `{type: 'done', citations, usage, ...}` event. If `stream=false`, "
        "returns a single JSON `AskResponse`."
    ),
    openapi_extra={"security": [{"cookieAuth": []}]},
    responses={
        200: {
            "description": "Answer payload (JSON) or SSE stream when `stream=true`.",
            "content": {
                "text/event-stream": {
                    "schema": {"type": "string"},
                    "example": (
                        'data: {"type":"token","text":"Crowd-Vision is..."}\n\n'
                        'data: {"type":"done","citations":[],"usage":{}}\n\n'
                    ),
                },
            },
        },
        400: {"description": "`model` override is not in the allowed set."},
        401: {"description": "Missing or invalid JWT cookie."},
        403: {"description": "`model` override requires a higher role."},
        422: {"description": "Validation error in request body."},
    },
)
async def ask(
    payload: AskRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthUser = Depends(require_user),
):
    # Per-request model override (None ⇒ server default); privilege/allowlist checked.
    llm = _resolve_override_llm(payload.model, user)

    if payload.stream:

        async def sse():
            async for event in _agent.stream_answer(
                session,
                payload.question,
                user,
                llm=llm,
                history=[turn.model_dump() for turn in payload.history],
            ):
                yield f"data: {json.dumps(event)}\n\n"

        return StreamingResponse(sse(), media_type="text/event-stream")

    result = await _agent.answer(
        session,
        payload.question,
        user,
        llm=llm,
        history=[turn.model_dump() for turn in payload.history],
    )
    return AskResponse(
        answer=result.answer,
        citations=[
            CitationModel(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                source=c.source,
                section_path=c.section_path,
            )
            for c in result.citations
        ],
        usage=UsageModel(
            input_tokens=result.usage.input_tokens,
            output_tokens=result.usage.output_tokens,
            cost_usd=result.usage.cost_usd,
        ),
        retrieval={
            "tool_calls": result.tool_calls,
            "hallucinated_citations": result.hallucinated_citations,
        },
        idk=result.idk,
        decision=result.decision,
    )
