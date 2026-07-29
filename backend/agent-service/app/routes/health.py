from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    summary="Liveness + DB reachability probe",
    description="Public. Returns `ok` if the database responds, `degraded` if it doesn't.",
)
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    try:
        await session.execute(text("SELECT 1"))
        db = "ok"
    except Exception:
        db = "down"
    return {"status": "ok" if db == "ok" else "degraded", "db": db}
