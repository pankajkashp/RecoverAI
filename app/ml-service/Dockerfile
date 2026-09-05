# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# Install curl for container healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY app/ml_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML features, data generation, training modules, and serialized model artifact
COPY ml ./ml

# Copy FastAPI application
COPY app/ml_service ./app/ml_service

ENV PYTHONPATH=/app
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.ml_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
