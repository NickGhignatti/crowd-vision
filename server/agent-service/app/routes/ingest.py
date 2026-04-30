from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, require_user
from app.db import get_session
from app.embeddings import get_embedder
from app.models.api import IngestRequest, IngestResponse
from app.services.ingest import ingest_document

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
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
