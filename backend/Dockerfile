```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ /app/backend/

# Copy core project files
COPY templates/ /app/templates/

# Create data and logs directories
RUN mkdir -p /app/data /app/data/logs

# Set environment
ENV PYTHONPATH=/app
ENV DB_PATH=/app/data/stock_news.db
ENV LOG_DIR=/app/data/logs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["python", "-m", "backend.app"]
```