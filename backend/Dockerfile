```dockerfile
# ── Stage 1: Build — install Python dependencies ───────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Build deps for native extensions (lxml, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime image ──────────────────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app

# Runtime shared libraries required by lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY backend/ ./backend/

RUN useradd -m appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data

USER appuser

ENV PYTHONPATH=/app \
    FLASK_APP=backend.app:create_app \
    FLASK_PORT=5000 \
    FLASK_DEBUG=false \
    DB_PATH=/data/stock_news.db

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c \
    "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/health')" \
    || exit 1

CMD ["python", "-m", "flask", "run", \
     "--host=0.0.0.0", "--port=5000", \
     "--without-debugger", "--no-reload"]
```