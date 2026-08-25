from __future__ import annotations

import os
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("pgvector/pgvector:pg17", dbname="agentdb") as container:
        url = container.get_connection_url().replace("postgresql+psycopg2", "postgresql+asyncpg")
        os.environ["POSTGRES_URL"] = url
        yield url


@pytest_asyncio.fixture(scope="session")
async def engine(pg_container):
    eng = create_async_engine(pg_container, pool_pre_ping=True)
    from alembic.config import Config

    from alembic import command

    cfg = Config("alembic.ini")
    cfg.set_main_option(
        "sqlalchemy.url",
        pg_container.replace("postgresql+asyncpg://", "postgresql://"),
    )
    # Run migrations via alembic's sync command on a sync connection string.
    command.upgrade(cfg, "head")
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
        await s.rollback()
        await s.execute(text("TRUNCATE chunks, documents RESTART IDENTITY CASCADE"))
        await s.commit()
