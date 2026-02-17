from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

from ..core.http import HttpRequestConfig, request_json
from ..core.logging import get_logger


logger = get_logger(__name__)

DEFAULT_OLLAMA_MODEL = "llama3.1:8b-instruct"
DEFAULT_OLLAMA_TIMEOUT_SECONDS = 60.0


def _clean_base_url(raw: str | None) -> str:
    return str(raw or "").strip().rstrip("/")


def _resolve_base_url(config: dict[str, Any] | None = None) -> str:
    if isinstance(config, dict):
        direct = _clean_base_url(config.get("api_base_url"))
        if direct:
            return direct
    return _clean_base_url(os.getenv("OLLAMA_API_BASE_URL"))


def _resolve_api_key(config: dict[str, Any] | None = None) -> str:
    from .secrets_manager import secrets_manager
    if isinstance(config, dict):
        direct = str(config.get("api_key") or "").strip()
        if direct:
            return direct
        env_name = str(config.get("api_key_env") or "OLLAMA_API_KEY").strip() or "OLLAMA_API_KEY"
        return secrets_manager.resolve_secret(None, env_name)
    return secrets_manager.resolve_secret(None, "OLLAMA_API_KEY")


def _resolve_timeout_seconds(config: dict[str, Any] | None = None) -> float:
    candidates: list[Any] = []
    if isinstance(config, dict):
        candidates.append(config.get("timeout_seconds"))
    candidates.append(os.getenv("OLLAMA_TIMEOUT_SECONDS"))
    for candidate in candidates:
        try:
            if candidate is None:
                continue
            value = float(candidate)
            if value > 0:
                return min(value, 120.0)
        except (TypeError, ValueError):
            continue
    return DEFAULT_OLLAMA_TIMEOUT_SECONDS


def resolve_model_name(
    *,
    config: dict[str, Any] | None,
    explicit_model: str | None = None,
    config_model_key: str | None = None,
    env_model_key: str = "OLLAMA_MODEL_RESEARCH",
) -> str:
    if explicit_model and explicit_model.strip():
        return explicit_model.strip()

    if isinstance(config, dict):
        if config_model_key:
            model_from_key = str(config.get(config_model_key) or "").strip()
            if model_from_key:
                return model_from_key
        model_from_config = str(config.get("model") or "").strip()
        if model_from_config:
            return model_from_config

    model_from_env = str(os.getenv(env_model_key) or "").strip()
    if model_from_env:
        return model_from_env

    return DEFAULT_OLLAMA_MODEL


def parse_json_from_text(raw_text: str) -> Any | None:
    text = str(raw_text or "").strip()
    if not text:
        return None

    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if not match:
        return None
    candidate = match.group(1)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def chat_completion(
    *,
    messages: list[dict[str, str]],
    config: dict[str, Any] | None = None,
    explicit_model: str | None = None,
    config_model_key: str | None = None,
    env_model_key: str = "OLLAMA_MODEL_RESEARCH",
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    base_url = _resolve_base_url(config)
    if not base_url:
        raise RuntimeError("OLLAMA_API_BASE_URL is not configured.")

    model_name = resolve_model_name(
        config=config,
        explicit_model=explicit_model,
        config_model_key=config_model_key,
        env_model_key=env_model_key,
    )

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": messages,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = _resolve_api_key(config)
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    timeout_seconds = _resolve_timeout_seconds(config)
    session = requests.Session()
    response_payload = request_json(
        session,
        "POST",
        f"{base_url}/v1/chat/completions",
        headers=headers,
        json=payload,
        config=HttpRequestConfig(timeout=timeout_seconds, max_retries=2),
    )

    choices = response_payload.get("choices") if isinstance(response_payload, dict) else None
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("Invalid Ollama response: missing choices.")

    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message") if isinstance(first, dict) else {}
    content = message.get("content") if isinstance(message, dict) else None
    final_text = str(content or "").strip()
    if not final_text:
        raise RuntimeError("Empty Ollama response content.")
    return final_text
