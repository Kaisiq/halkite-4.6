FROM python:3.14-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv

RUN python -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /build

COPY apps/api/README.md apps/api/pyproject.toml ./apps/api/
COPY apps/api/src ./apps/api/src

RUN pip install --upgrade pip setuptools wheel \
    && pip install ./apps/api

FROM python:3.14-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    API_HOST=0.0.0.0 \
    API_PORT=8000 \
    LOG_LEVEL=info

RUN addgroup --system nexus && adduser --system --ingroup nexus nexus

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

USER nexus

EXPOSE 8000

CMD ["sh", "-c", "uvicorn nexus_api.main:app --host \"${API_HOST}\" --port \"${API_PORT}\" --log-level \"$(printf '%s' \"${LOG_LEVEL}\" | tr '[:upper:]' '[:lower:]')\""]
