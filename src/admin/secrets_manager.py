from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from ..core.db_models import DBAdminSetting, DBIntegrationConfig
from ..core.logging import get_logger

logger = get_logger(__name__)

SECURE_SECRETS_SETTING_KEY = "secure_secrets_v1"
SECURE_SECRETS_MIGRATION_MARKER_KEY = "secure_secrets_migration_v1_done"
MASKED_SECRET_VALUE = "********"

SECRET_SCHEMA_VERSION = "v1"

SECRET_CATALOG: list[dict[str, Any]] = [
    {
        "id": "ai",
        "label": "AI / NLP",
        "keys": [
            {
                "key": "OPENAI_API_KEY",
                "required": False,
                "multiline": False,
                "description": "OpenAI API key.",
            },
            {
                "key": "ANTHROPIC_API_KEY",
                "required": False,
                "multiline": False,
                "description": "Anthropic API key.",
            },
            {
                "key": "OLLAMA_API_KEY",
                "required": False,
                "multiline": False,
                "description": "Ollama bearer key.",
            },
        ],
    },
    {
        "id": "sourcing",
        "label": "Data Sourcing",
        "keys": [
            {
                "key": "APIFY_API_TOKEN",
                "required": False,
                "multiline": False,
                "description": "Apify token for lead sourcing.",
            },
            {
                "key": "APOLLO_API_KEY",
                "required": False,
                "multiline": False,
                "description": "Apollo API key.",
            },
            {
                "key": "PERPLEXITY_API_KEY",
                "required": False,
                "multiline": False,
                "description": "Perplexity API key.",
            },
            {
                "key": "FIRECRAWL_API_KEY",
                "required": False,
                "multiline": False,
                "description": "Firecrawl API key.",
            },
        ],
    },
    {
        "id": "comms",
        "label": "Communications",
        "keys": [
            {
                "key": "SMTP_PASSWORD",
                "required": False,
                "multiline": False,
                "description": "SMTP password.",
            },
            {
                "key": "SLACK_WEBHOOK_URL",
                "required": False,
                "multiline": False,
                "description": "Slack incoming webhook URL.",
            },
            {
                "key": "KHOJ_API_BEARER_TOKEN",
                "required": False,
                "multiline": False,
                "description": "Khoj bearer token.",
            },
        ],
    },
    {
        "id": "security",
        "label": "Security",
        "keys": [
            {
                "key": "JWT_SECRET",
                "required": False,
                "multiline": False,
                "description": "JWT signing secret.",
            },
        ],
    },
]

SUPPORTED_SECRET_KEYS: set[str] = {
    str(item.get("key")).strip()
    for category in SECRET_CATALOG
    for item in (category.get("keys") or [])
    if str(item.get("key")).strip()
}

INTEGRATION_SECRET_FIELDS: dict[str, dict[str, str]] = {
    "perplexity": {"api_key": "PERPLEXITY_API_KEY"},
    "firecrawl": {"api_key": "FIRECRAWL_API_KEY"},
    "ollama": {"api_key": "OLLAMA_API_KEY"},
    "slack": {"webhook": "SLACK_WEBHOOK_URL"},
}


class SecretsManagerError(RuntimeError):
    """Raised when encrypted secret operations fail."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _encryption_key() -> str:
    return str(os.getenv("APP_ENCRYPTION_KEY") or "").strip()


def _build_fernet(*, require_key: bool) -> Fernet | None:
    key = _encryption_key()
    if not key:
        if require_key:
            raise SecretsManagerError("APP_ENCRYPTION_KEY is not configured.")
        return None
    try:
        return Fernet(key.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - invalid key format
        if require_key:
            raise SecretsManagerError("APP_ENCRYPTION_KEY is invalid for Fernet.") from exc
        return None


def _get_setting_row(db: Session, key: str) -> DBAdminSetting | None:
    return db.query(DBAdminSetting).filter(DBAdminSetting.key == key).first()


def _read_vault_payload(
    db: Session,
    *,
    require_encryption_key: bool,
) -> tuple[dict[str, str], datetime | None]:
    row = _get_setting_row(db, SECURE_SECRETS_SETTING_KEY)
    if not row or not isinstance(row.value_json, dict):
        return {}, None

    value_json = row.value_json
    ciphertext = str(value_json.get("ciphertext") or "").strip()
    if not ciphertext:
        return {}, row.updated_at

    fernet = _build_fernet(require_key=require_encryption_key)
    if not fernet:
        logger.warning("Encrypted secret vault present but APP_ENCRYPTION_KEY is missing.")
        return {}, row.updated_at

    try:
        decrypted = fernet.decrypt(ciphertext.encode("utf-8"))
    except InvalidToken as exc:
        raise SecretsManagerError("Failed to decrypt secure secrets vault.") from exc

    try:
        payload = json.loads(decrypted.decode("utf-8"))
    except Exception as exc:  # pragma: no cover - corrupted ciphertext payload
        raise SecretsManagerError("Failed to parse decrypted secure secrets payload.") from exc

    if not isinstance(payload, dict):
        raise SecretsManagerError("Decrypted secure secrets payload must be a JSON object.")

    normalized: dict[str, str] = {}
    for key, value in payload.items():
        key_name = str(key or "").strip()
        if not key_name:
            continue
        value_text = str(value or "")
        if not value_text:
            continue
        normalized[key_name] = value_text
    return normalized, row.updated_at


def _write_vault_payload(
    db: Session,
    *,
    secrets_payload: dict[str, str],
    actor: str,
) -> DBAdminSetting:
    fernet = _build_fernet(require_key=True)
    assert fernet is not None

    sorted_payload = {
        key: str(value)
        for key, value in sorted(secrets_payload.items(), key=lambda item: item[0])
        if str(key).strip() and str(value or "")
    }
    plaintext = json.dumps(sorted_payload, ensure_ascii=False, separators=(",", ":"))
    ciphertext = fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    row = _get_setting_row(db, SECURE_SECRETS_SETTING_KEY)
    if not row:
        row = DBAdminSetting(key=SECURE_SECRETS_SETTING_KEY)
        db.add(row)
    row.value_json = {
        "version": 1,
        "ciphertext": ciphertext,
        "updated_by": actor,
        "updated_at": _utc_now_iso(),
    }
    return row


def get_secret_schema() -> dict[str, Any]:
    return {
        "version": SECRET_SCHEMA_VERSION,
        "categories": SECRET_CATALOG,
    }


def is_supported_secret_key(key: str) -> bool:
    return key.strip() in SUPPORTED_SECRET_KEYS


def list_secret_states(db: Session) -> dict[str, Any]:
    vault, vault_updated_at = _read_vault_payload(db, require_encryption_key=False)

    items: list[dict[str, Any]] = []
    for key in sorted(SUPPORTED_SECRET_KEYS):
        db_value = str(vault.get(key) or "").strip()
        env_value = str(os.getenv(key) or "").strip()

        source = "none"
        configured = False
        if db_value:
            source = "db"
            configured = True
        elif env_value:
            source = "env"
            configured = True

        updated_at: str | None = None
        if source == "db" and vault_updated_at:
            updated_at = vault_updated_at.isoformat()

        items.append(
            {
                "key": key,
                "configured": configured,
                "source": source,
                "masked_value": MASKED_SECRET_VALUE if configured else "",
                "updated_at": updated_at,
            }
        )

    return {
        "items": items,
    }


def upsert_secret(db: Session, *, key: str, value: str, actor: str) -> dict[str, Any]:
    normalized_key = key.strip()
    normalized_value = value.strip()
    if not is_supported_secret_key(normalized_key):
        raise ValueError(f"Unsupported secret key: {normalized_key}")
    if not normalized_value:
        raise ValueError("Secret value must not be empty.")

    vault, _ = _read_vault_payload(db, require_encryption_key=True)
    vault[normalized_key] = normalized_value
    _write_vault_payload(db, secrets_payload=vault, actor=actor)
    db.commit()

    return {
        "key": normalized_key,
        "configured": True,
        "source": "db",
        "masked_value": MASKED_SECRET_VALUE,
    }


def upsert_many_secrets(
    db: Session,
    *,
    secrets_payload: dict[str, str],
    actor: str,
) -> dict[str, int]:
    if not secrets_payload:
        return {"updated": 0}

    vault, _ = _read_vault_payload(db, require_encryption_key=True)
    updated = 0
    for key, value in secrets_payload.items():
        normalized_key = str(key or "").strip()
        normalized_value = str(value or "").strip()
        if not normalized_key or not normalized_value:
            continue
        if not is_supported_secret_key(normalized_key):
            continue
        if vault.get(normalized_key) != normalized_value:
            updated += 1
        vault[normalized_key] = normalized_value

    _write_vault_payload(db, secrets_payload=vault, actor=actor)
    db.commit()
    return {"updated": updated}


def delete_secret(db: Session, *, key: str, actor: str) -> dict[str, Any]:
    normalized_key = key.strip()
    if not is_supported_secret_key(normalized_key):
        raise ValueError(f"Unsupported secret key: {normalized_key}")

    vault, _ = _read_vault_payload(db, require_encryption_key=True)
    removed = normalized_key in vault
    vault.pop(normalized_key, None)
    _write_vault_payload(db, secrets_payload=vault, actor=actor)
    db.commit()

    return {
        "deleted": removed,
        "key": normalized_key,
    }


def resolve_secret(
    key: str,
    *,
    db: Session | None,
    default: str = "",
) -> str:
    normalized_key = key.strip()
    if not normalized_key:
        return default

    if db is not None:
        try:
            vault, _ = _read_vault_payload(db, require_encryption_key=False)
            db_value = str(vault.get(normalized_key) or "").strip()
            if db_value:
                return db_value
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.warning(
                "Failed to resolve secret from encrypted vault; falling back to env.",
                extra={"key": normalized_key, "error": str(exc)},
            )

    env_value = str(os.getenv(normalized_key) or "").strip()
    if env_value:
        return env_value

    return default


def sanitize_integration_config(
    *,
    provider_key: str,
    config: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, str]]:
    clean_config = dict(config or {})
    secret_updates: dict[str, str] = {}

    field_map = INTEGRATION_SECRET_FIELDS.get(provider_key, {})
    for config_field, secret_env_key in field_map.items():
        if config_field not in clean_config:
            continue
        target_secret_key = secret_env_key
        if config_field == "api_key":
            env_hint = str(clean_config.get("api_key_env") or "").strip()
            if env_hint:
                target_secret_key = env_hint
        raw_value = str(clean_config.get(config_field) or "").strip()
        if raw_value and raw_value != MASKED_SECRET_VALUE:
            secret_updates[target_secret_key] = raw_value
        clean_config[config_field] = ""

    return clean_config, secret_updates


def apply_integration_secret_fields(
    *,
    db: Session,
    provider_key: str,
    config: dict[str, Any],
    include_runtime_values: bool,
) -> dict[str, Any]:
    hydrated = dict(config or {})
    field_map = INTEGRATION_SECRET_FIELDS.get(provider_key, {})
    for config_field, fallback_secret_key in field_map.items():
        secret_key = fallback_secret_key
        if config_field == "api_key":
            env_hint = str(hydrated.get("api_key_env") or "").strip()
            if env_hint:
                secret_key = env_hint
        value = resolve_secret(secret_key, db=db, default="")
        if include_runtime_values:
            hydrated[config_field] = value
        else:
            hydrated[config_field] = MASKED_SECRET_VALUE if value else ""
    return hydrated


def migrate_plaintext_integration_secrets_if_needed(db: Session) -> dict[str, int]:
    marker = _get_setting_row(db, SECURE_SECRETS_MIGRATION_MARKER_KEY)
    marker_payload = marker.value_json if marker and isinstance(marker.value_json, dict) else {}
    if bool(marker_payload.get("done")):
        return {"migrated_fields": 0, "updated_providers": 0}

    rows = db.query(DBIntegrationConfig).order_by(DBIntegrationConfig.key.asc()).all()
    vault, _ = _read_vault_payload(db, require_encryption_key=False)

    migrated_fields = 0
    updated_providers = 0
    changed = False

    for row in rows:
        provider_key = str(row.key or "").strip().lower()
        if not provider_key:
            continue
        row_config = row.config_json if isinstance(row.config_json, dict) else {}
        clean_config, secret_updates = sanitize_integration_config(
            provider_key=provider_key,
            config=row_config,
        )

        if secret_updates:
            if not _encryption_key():
                raise SecretsManagerError(
                    "APP_ENCRYPTION_KEY is required to migrate plaintext integration secrets."
                )
            migrated_fields += len(secret_updates)
            for secret_key, secret_value in secret_updates.items():
                if str(secret_value).strip():
                    vault[secret_key] = str(secret_value).strip()
            changed = True

        if clean_config != row_config:
            row.config_json = clean_config
            updated_providers += 1
            changed = True

    if changed:
        _write_vault_payload(db, secrets_payload=vault, actor="system:migration")

    if not marker:
        marker = DBAdminSetting(key=SECURE_SECRETS_MIGRATION_MARKER_KEY)
        db.add(marker)
    marker.value_json = {
        "done": True,
        "at": _utc_now_iso(),
        "migrated_fields": migrated_fields,
        "updated_providers": updated_providers,
    }

    db.commit()
    return {
        "migrated_fields": migrated_fields,
        "updated_providers": updated_providers,
    }
