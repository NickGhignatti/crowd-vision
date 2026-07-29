"""init: pgvector + documents + chunks

Revision ID: 0001
Revises:
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE TABLE documents (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source       TEXT NOT NULL,
            content_hash TEXT NOT NULL UNIQUE,
            metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
            permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE chunks (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            section_path TEXT,
            kind         TEXT NOT NULL,
            content      TEXT NOT NULL,
            token_count  INT  NOT NULL,
            embedding    vector(768) NOT NULL,
            tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
            permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
            metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        "CREATE INDEX chunks_embedding_ivfflat ON chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.execute("CREATE INDEX chunks_tsv_gin ON chunks USING gin (tsv)")
    op.execute("CREATE INDEX chunks_permissions_gin ON chunks USING gin (permissions)")
    op.execute("CREATE INDEX chunks_document_id_idx ON chunks (document_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chunks")
    op.execute("DROP TABLE IF EXISTS documents")
