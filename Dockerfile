FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

# Local Docker Compose maps this path for SQLite persistence.
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.admin.app:create_app --host 0.0.0.0 --port ${PORT:-8000} --factory"]
