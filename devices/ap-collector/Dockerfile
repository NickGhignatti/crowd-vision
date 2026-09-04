FROM python:3.12-slim
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY app ./app
COPY collector.dev.json ./collector.json

ENTRYPOINT ["python", "-m", "app"]
CMD ["--config", "collector.json", "--dry-run"]
