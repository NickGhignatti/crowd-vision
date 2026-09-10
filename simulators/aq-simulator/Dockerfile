FROM python:3.12-slim
LABEL authors="nickg"
# Patch base-image OS CVEs for the cd-registry Trivy scan. DL3005 (no apt upgrade) is intentionally waived here.
# hadolint ignore=DL3005
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# uv resolves from the same lockfile CI and the local venv use, so the image cannot
# quietly ship a different dependency set than the one that was linted.
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv==0.11.32 \
    && uv sync --locked --no-dev \
    && rm -rf /root/.cache
ENV PATH="/app/.venv/bin:$PATH"

COPY . .

EXPOSE 3000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "3000"]
