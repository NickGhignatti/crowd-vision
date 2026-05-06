FROM python:3.12-slim
LABEL authors="nickg"
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "3000"]
