# VIDHI AI — NLU JODHPUR EDITION (POWERED BY KELYVO)
# Production Container Image

FROM python:3.11-slim-bookworm AS base

# Install system dependencies including SQLite with FTS5 and basic utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    libsqlite3-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY docs/ ./docs/

# Create runtime directories
RUN mkdir -p /app/data /app/backups /app/logs /app/uploads
# data/ is NOT copied into the image; mount it as a volume (./data:/app/data)

# Set environment
ENV PYTHONUNBUFFERED=1
ENV PORT=8090
ENV PYTHONPATH=/app/backend

EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8090/api/status || exit 1

# Launch production server
CMD ["python", "backend/server.py"]
