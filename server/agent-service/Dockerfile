FROM python:3.14-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir uv==0.11.16
COPY pyproject.toml ./
COPY app ./app
RUN uv pip install --system --no-cache .

FROM python:3.14-slim AS production
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
EXPOSE 3000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 3000"]
