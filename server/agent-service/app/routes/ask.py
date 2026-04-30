import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.loop import Agent
from app.auth import AuthUser, require_user
from app.db import get_session
from app.models.api import AskRequest, AskResponse, CitationModel, UsageModel

router = APIRouter()
_agent = Agent()


@router.post("/ask")
async def ask(
    payload: AskRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthUser = Depends(require_user),
):
    if payload.stream:

        async def sse():
            async for event in _agent.stream_answer(session, payload.question, user):
                yield f"data: {json.dumps(event)}\n\n"

        return StreamingResponse(sse(), media_type="text/event-stream")

    result = await _agent.answer(session, payload.question, user)
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
