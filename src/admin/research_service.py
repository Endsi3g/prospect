from __future__ import annotations

import html
import os
import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import requests

from ..core.http import HttpRequestConfig, request_json, request_with_retries
from ..core.logging import get_logger


logger = get_logger(__name__)


DUCKDUCKGO_SEARCH_URL = "https://duckduckgo.com/html/"
PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search"
PERPLEXITY_CHAT_COMPLETIONS_URL = "https://api.perplexity.ai/chat/completions"
FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search"

DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_RESULT_LIMIT = 25

SUPPORTED_RESEARCH_PROVIDERS = ("duckduckgo", "perplexity", "firecrawl")
PROVIDER_ALIASES = {
    "ddg": "duckduckgo",
    "duckduckgo": "duckduckgo",
    "perplexity": "perplexity",
    "pplx": "perplexity",
    "firecrawl": "firecrawl",
}


def _clip_text(value: Any, limit: int = 320) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def _strip_html(raw: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", raw or "")
    normalized = re.sub(r"\s+", " ", html.unescape(no_tags)).strip()
    return normalized


def _decode_duckduckgo_redirect(url: str) -> str:
    parsed = urlparse(url)
    if "duckduckgo.com" not in parsed.netloc:
        return url
    encoded = parse_qs(parsed.query).get("uddg")
    if not encoded:
        return url
    return unquote(encoded[0])


def _normalize_provider_key(raw: str) -> str:
    cleaned = (raw or "").strip().lower()
    return PROVIDER_ALIASES.get(cleaned, cleaned)


def _resolve_provider_list(
    selector: str,
    provider_configs: dict[str, dict[str, Any]],
) -> list[str]:
    raw_selector = (selector or "auto").strip().lower()
    if raw_selector in {"", "auto", "free", "default"}:
        enabled = []
        for provider in SUPPORTED_RESEARCH_PROVIDERS:
            cfg = provider_configs.get(provider, {})
            if cfg.get("enabled"):
                enabled.append(provider)
        return enabled or ["duckduckgo"]

    providers: list[str] = []
    for piece in raw_selector.split(","):
        key = _normalize_provider_key(piece)
        if key in SUPPORTED_RESEARCH_PROVIDERS and key not in providers:
            providers.append(key)
    return providers or ["duckduckgo"]


def _extract_api_key(config: dict[str, Any], default_env_name: str) -> str:
    direct_key = str(config.get("api_key") or "").strip()
    if direct_key:
        return direct_key

    env_name = str(config.get("api_key_env") or default_env_name).strip() or default_env_name
    return str(os.getenv(env_name) or "").strip()


def _normalize_item(
    *,
    provider: str,
    title: Any,
    url: Any,
    snippet: Any = "",
    source: Any = "",
    published_at: Any = None,
) -> dict[str, Any] | None:
    normalized_url = str(url or "").strip()
    normalized_title = _clip_text(title or normalized_url or "Untitled result", limit=180)
    if not normalized_url and not normalized_title:
        return None
    return {
        "provider": provider,
        "source": str(source or provider),
        "title": normalized_title,
        "url": normalized_url,
        "snippet": _clip_text(snippet),
        "published_at": str(published_at).strip() if published_at else None,
    }


def _dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique_items: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        key = (str(item.get("url") or "").lower(), str(item.get("title") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        unique_items.append(item)
    return unique_items


def _search_duckduckgo(query: str, limit: int) -> list[dict[str, Any]]:
    session = requests.Session()
    response = request_with_retries(
        session,
        "GET",
        DUCKDUCKGO_SEARCH_URL,
        params={"q": query, "kl": "us-en"},
        config=HttpRequestConfig(timeout=DEFAULT_TIMEOUT_SECONDS, max_retries=2),
    )
    markup = response.text

    title_matches = re.findall(
        r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        markup,
        flags=re.IGNORECASE | re.DOTALL,
    )
    snippet_matches = re.findall(
        r'<(?:a|div)[^>]*class="result__snippet"[^>]*>(.*?)</(?:a|div)>',
        markup,
        flags=re.IGNORECASE | re.DOTALL,
    )

    items: list[dict[str, Any]] = []
    for index, (href, raw_title) in enumerate(title_matches[:limit]):
        snippet = _strip_html(snippet_matches[index]) if index < len(snippet_matches) else ""
        normalized = _normalize_item(
            provider="duckduckgo",
            source="duckduckgo",
            title=_strip_html(raw_title),
            url=_decode_duckduckgo_redirect(href),
            snippet=snippet,
        )
        if normalized:
            items.append(normalized)
    return items


def _extract_perplexity_search_items(payload: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    raw_items: Any = payload.get("results") or payload.get("data") or payload.get("items") or []
    if isinstance(raw_items, dict):
        raw_items = raw_items.get("results") or raw_items.get("items") or raw_items.get("data") or []
    if not isinstance(raw_items, list):
        return []

    items: list[dict[str, Any]] = []
    for row in raw_items:
        if not isinstance(row, dict):
            continue
        normalized = _normalize_item(
            provider="perplexity",
            source=row.get("source") or "perplexity",
            title=row.get("title") or row.get("name"),
            url=row.get("url") or row.get("link"),
            snippet=row.get("snippet") or row.get("content") or row.get("text") or "",
            published_at=row.get("date") or row.get("published_at"),
        )
        if normalized:
            items.append(normalized)
        if len(items) >= limit:
            break
    return items


def _search_perplexity_chat_fallback(
    query: str,
    limit: int,
    *,
    api_key: str,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    model_name = str(config.get("model") or "sonar").strip() or "sonar"
    try:
        max_tokens = int(config.get("max_tokens") or 550)
    except (TypeError, ValueError):
        max_tokens = 550
    max_tokens = max(150, min(max_tokens, 1024))

    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": "You are a factual web research assistant. Keep answers concise and cite sources.",
            },
            {"role": "user", "content": query},
        ],
        "web_search_options": {"search_context_size": "medium"},
        "max_tokens": max_tokens,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    session = requests.Session()
    response_payload = request_json(
        session,
        "POST",
        PERPLEXITY_CHAT_COMPLETIONS_URL,
        headers=headers,
        json=payload,
        config=HttpRequestConfig(timeout=DEFAULT_TIMEOUT_SECONDS, max_retries=2),
    )

    content = ""
    choices = response_payload.get("choices") if isinstance(response_payload, dict) else None
    if isinstance(choices, list) and choices:
        first = choices[0] or {}
        message = first.get("message") if isinstance(first, dict) else {}
        if isinstance(message, dict):
            content = str(message.get("content") or "")

    citations = response_payload.get("citations") if isinstance(response_payload, dict) else None
    items: list[dict[str, Any]] = []
    if isinstance(citations, list):
        for citation in citations[:limit]:
            url = citation if isinstance(citation, str) else citation.get("url")
            title = citation if isinstance(citation, str) else citation.get("title")
            normalized = _normalize_item(
                provider="perplexity",
                source="perplexity",
                title=title or "Perplexity source",
                url=url,
                snippet=content,
            )
            if normalized:
                items.append(normalized)

    if items:
        return items

    normalized = _normalize_item(
        provider="perplexity",
        source="perplexity",
        title=f"Perplexity summary for '{query}'",
        url="",
        snippet=content,
    )
    return [normalized] if normalized else []


def _search_perplexity(
    query: str,
    limit: int,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    api_key = _extract_api_key(config, default_env_name="PERPLEXITY_API_KEY")
    if not api_key:
        return []

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"query": query, "max_results": limit}
    session = requests.Session()

    try:
        response_payload = request_json(
            session,
            "POST",
            PERPLEXITY_SEARCH_URL,
            headers=headers,
            json=payload,
            config=HttpRequestConfig(timeout=DEFAULT_TIMEOUT_SECONDS, max_retries=2),
        )
        if isinstance(response_payload, dict):
            results = _extract_perplexity_search_items(response_payload, limit=limit)
            if results:
                return results
    except Exception as exc:  # pragma: no cover - network variation
        logger.warning("Perplexity search endpoint call failed, trying chat fallback.", extra={"error": str(exc)})

    try:
        return _search_perplexity_chat_fallback(
            query=query,
            limit=limit,
            api_key=api_key,
            config=config,
        )
    except Exception as exc:  # pragma: no cover - network variation
        logger.warning("Perplexity chat fallback failed.", extra={"error": str(exc)})
        return []


def _extract_firecrawl_items(payload: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    raw_data: Any = payload.get("data") if isinstance(payload, dict) else []
    if isinstance(raw_data, dict):
        raw_items = raw_data.get("results") or raw_data.get("items") or raw_data.get("web") or raw_data.get("data") or []
    else:
        raw_items = raw_data

    if not raw_items and isinstance(payload, dict):
        raw_items = payload.get("results") or payload.get("items") or []

    if not isinstance(raw_items, list):
        return []

    items: list[dict[str, Any]] = []
    for row in raw_items:
        if not isinstance(row, dict):
            continue
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        normalized = _normalize_item(
            provider="firecrawl",
            source=row.get("source") or "firecrawl",
            title=row.get("title") or metadata.get("title"),
            url=row.get("url") or row.get("link"),
            snippet=row.get("description") or row.get("snippet") or row.get("markdown") or row.get("content") or "",
            published_at=row.get("published_at") or metadata.get("publishedTime"),
        )
        if normalized:
            items.append(normalized)
        if len(items) >= limit:
            break
    return items


def _search_firecrawl(query: str, limit: int, config: dict[str, Any]) -> list[dict[str, Any]]:
    api_key = _extract_api_key(config, default_env_name="FIRECRAWL_API_KEY")
    if not api_key:
        return []

    payload: dict[str, Any] = {"query": query, "limit": limit}
    country = str(config.get("country") or "").strip()
    lang = str(config.get("lang") or "").strip()
    if country:
        payload["country"] = country
    if lang:
        payload["lang"] = lang

    formats = config.get("formats")
    if isinstance(formats, str):
        normalized_formats = [part.strip() for part in formats.split(",") if part.strip()]
        if normalized_formats:
            payload["scrapeOptions"] = {"formats": normalized_formats}
    elif isinstance(formats, list):
        normalized_formats = [str(part).strip() for part in formats if str(part).strip()]
        if normalized_formats:
            payload["scrapeOptions"] = {"formats": normalized_formats}

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    session = requests.Session()
    response_payload = request_json(
        session,
        "POST",
        FIRECRAWL_SEARCH_URL,
        headers=headers,
        json=payload,
        config=HttpRequestConfig(timeout=DEFAULT_TIMEOUT_SECONDS, max_retries=2),
    )
    if not isinstance(response_payload, dict):
        return []
    return _extract_firecrawl_items(response_payload, limit=limit)


def run_web_research(
    *,
    query: str,
    limit: int,
    provider_selector: str,
    provider_configs: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    clean_query = query.strip()
    safe_limit = max(1, min(int(limit), MAX_RESULT_LIMIT))
    providers_map = provider_configs or {}
    requested_providers = _resolve_provider_list(provider_selector, providers_map)

    if not clean_query:
        return {
            "query": query,
            "provider_selector": provider_selector,
            "providers_requested": requested_providers,
            "providers_used": [],
            "total": 0,
            "items": [],
            "warnings": [],
        }

    items: list[dict[str, Any]] = []
    providers_used: list[str] = []
    warnings: list[str] = []

    for provider in requested_providers:
        if len(items) >= safe_limit:
            break

        provider_entry = providers_map.get(provider, {})
        enabled = bool(provider_entry.get("enabled", provider == "duckduckgo"))
        provider_config = provider_entry.get("config") if isinstance(provider_entry.get("config"), dict) else {}

        if not enabled:
            warnings.append(f"Provider '{provider}' disabled in integrations.")
            continue

        per_provider_limit = safe_limit - len(items)

        try:
            provider_items: list[dict[str, Any]]
            if provider == "duckduckgo":
                provider_items = _search_duckduckgo(clean_query, per_provider_limit)
            elif provider == "perplexity":
                provider_items = _search_perplexity(clean_query, per_provider_limit, provider_config)
            elif provider == "firecrawl":
                provider_items = _search_firecrawl(clean_query, per_provider_limit, provider_config)
            else:
                provider_items = []
        except Exception as exc:  # pragma: no cover - defensive network fallback
            logger.warning("Web research provider failed.", extra={"provider": provider, "error": str(exc)})
            provider_items = []

        if not provider_items:
            warnings.append(f"Provider '{provider}' returned no results.")
            continue

        items.extend(provider_items)
        items = _dedupe_items(items)
        providers_used.append(provider)

    trimmed = items[:safe_limit]
    return {
        "query": clean_query,
        "provider_selector": provider_selector,
        "providers_requested": requested_providers,
        "providers_used": providers_used,
        "total": len(trimmed),
        "items": trimmed,
        "warnings": warnings,
    }
