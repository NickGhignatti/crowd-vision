from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, require_user
from app.db import get_session
from app.embeddings import get_embedder
from app.models.api import IngestRequest, IngestResponse
from app.services.ingest import ingest_document

router = APIRouter(tags=["ingest"])


@router.post(
    "/ingest",
    response_model=IngestResponse,
    summary="Ingest a document into the knowledge base",
    description=(
        "Chunks the markdown content, embeds each chunk with Gemini, and upserts "
        "into pgvector + tsvector. Idempotent on content hash — re-ingesting the "
        "same `source` + `content` returns `skipped=true` without re-embedding."
    ),
    openapi_extra={"security": [{"cookieAuth": []}]},
    responses={
        401: {"description": "Missing or invalid JWT cookie."},
        422: {"description": "Validation error in request body."},
    },
)
async def ingest(
    payload: IngestRequest,
    session: AsyncSession = Depends(get_session),
    user: AuthUser = Depends(require_user),
) -> IngestResponse:
    document_id, chunks, skipped = await ingest_document(
        session=session,
        embedder=get_embedder(),
        source=payload.source,
        content=payload.content,
        metadata={**payload.metadata, "ingested_by": user.user_id},
        permissions=payload.permissions,
    )
    return IngestResponse(document_id=document_id, chunks=chunks, skipped=skipped)
