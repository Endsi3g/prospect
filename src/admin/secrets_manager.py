from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from ..core.db_models import DBAdminSetting, DBIntegrationConfig, DBAuditLog

class SecretsManagerError(Exception):
    pass

# Canonical schema for managed secrets
SECRET_SCHEMA = {
    "version": "v1",
    "categories": [
        {
            "id": "ai",
            "label": "IA / NLP",
            "keys": [
                {"key": "OPENAI_API_KEY", "required": False, "multiline": False, "description": "Clé API OpenAI (gpt-4o, etc.)"},
                {"key": "ANTHROPIC_API_KEY", "required": False, "multiline": False, "description": "Clé API Anthropic (claude-3, etc.)"},
                {"key": "OLLAMA_API_KEY", "required": False, "multiline": False, "description": "Clé API/Bearer pour Ollama (si configuré)"},
                {"key": "PERPLEXITY_API_KEY", "required": False, "multiline": False, "description": "Clé API Perplexity pour la recherche Web"},
            ]
        },
        {
            "id": "tools",
            "label": "Outils & Extraction",
            "keys": [
                {"key": "APIFY_API_TOKEN", "required": False, "multiline": False, "description": "Token Apify pour le scraping LinkedIn/Web"},
                {"key": "FIRECRAWL_API_KEY", "required": False, "multiline": False, "description": "Clé Firecrawl pour le crawling haute performance"},
            ]
        },
        {
            "id": "system",
            "label": "Système & Auth",
            "keys": [
                {"key": "SMTP_PASSWORD", "required": False, "multiline": False, "description": "Mot de passe pour l'envoi d'emails"},
                {"key": "JWT_SECRET", "required": False, "multiline": False, "description": "Secret pour la signature des tokens (Lecture seule suggérée)", "readonly": True},
            ]
        }
    ]
}

SECURE_SECRETS_SETTING_KEY = "secure_secrets_v1"
MIGRATION_MARKER_KEY = "secure_secrets_migration_v1_done"

class SecretsManager:
    def __init__(self):
        self._encryption_key = os.getenv("APP_ENCRYPTION_KEY", "").strip()
        self._fernet = None
        if self._encryption_key:
            try:
                self._fernet = Fernet(self._encryption_key.encode())
            except Exception:
                # Invalid key format
                pass

    def get_schema(self) -> dict[str, Any]:
        return SECRET_SCHEMA

    def _get_fernet(self) -> Fernet:
        if not self._fernet:
            raise SecretsManagerError("APP_ENCRYPTION_KEY non configurée ou invalide. Impossible de gérer les secrets chiffrés.")
        return self._fernet

    def _get_vault_row(self, db: Session) -> DBAdminSetting:
        row = db.query(DBAdminSetting).filter(DBAdminSetting.key == SECURE_SECRETS_SETTING_KEY).first()
        if not row:
            row = DBAdminSetting(key=SECURE_SECRETS_SETTING_KEY, value_json={"version": 1, "ciphertext": ""})
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    def _decrypt_vault(self, row: DBAdminSetting) -> dict[str, str]:
        ciphertext = row.value_json.get("ciphertext", "")
        if not ciphertext:
            return {}
        try:
            decrypted = self._get_fernet().decrypt(ciphertext.encode()).decode()
            return json.loads(decrypted)
        except Exception:
            # Fallback to empty if decryption fails (e.g. wrong key)
            return {}

    def _encrypt_vault(self, row: DBAdminSetting, secrets: dict[str, str], actor: str = "system") -> None:
        payload = json.dumps(secrets)
        ciphertext = self._get_fernet().encrypt(payload.encode()).decode()
        row.value_json = {
            "version": 1,
            "ciphertext": ciphertext,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": actor
        }

    def list_secret_states(self, db: Session) -> dict[str, Any]:
        row = self._get_vault_row(db)
        db_secrets = self._decrypt_vault(row)
        
        items = []
        all_keys = []
        for cat in SECRET_SCHEMA["categories"]:
            for k in cat["keys"]:
                all_keys.append(k["key"])

        for key in all_keys:
            source = "none"
            configured = False
            
            if key in db_secrets and db_secrets[key]:
                source = "db"
                configured = True
            elif os.getenv(key):
                source = "env"
                configured = True
            
            items.append({
                "key": key,
                "configured": configured,
                "source": source,
                "masked_value": "********" if configured else "",
                "updated_at": row.updated_at.isoformat() if source == "db" else None
            })
            
        return {"items": items}

    def upsert_secret(self, db: Session, key: str, value: str, actor: str) -> dict[str, Any]:
        # Validate key against schema
        valid_keys = []
        for cat in SECRET_SCHEMA["categories"]:
            for k in cat["keys"]:
                valid_keys.append(k["key"])
        
        if key not in valid_keys:
            raise ValueError(f"Clé de secret invalide: {key}")
        
        if not value.strip():
            raise ValueError("La valeur du secret ne peut pas être vide.")

        row = self._get_vault_row(db)
        secrets = self._decrypt_vault(row)
        secrets[key] = value.strip()
        self._encrypt_vault(row, secrets, actor)
        db.commit()
        
        return {"success": True, "key": key}

    def upsert_many_secrets(self, db: Session, secrets_payload: dict[str, str], actor: str) -> dict[str, Any]:
        row = self._get_vault_row(db)
        secrets = self._decrypt_vault(row)
        for key, value in secrets_payload.items():
            if value and value != "********":
                secrets[key] = value.strip()
        
        self._encrypt_vault(row, secrets, actor)
        db.commit()
        return {"success": True, "count": len(secrets_payload)}

    def delete_secret(self, db: Session, key: str, actor: str) -> dict[str, Any]:
        row = self._get_vault_row(db)
        secrets = self._decrypt_vault(row)
        if key in secrets:
            del secrets[key]
            self._encrypt_vault(row, secrets, actor)
            db.commit()
            return {"deleted": True, "key": key}
        
        return {"deleted": False, "key": key}

    def resolve_secret(self, db: Session | None, key: str, default: str = "") -> str:
        if db is None:
            try:
                from ..core.database import SessionLocal
                with SessionLocal() as session:
                    return self._resolve_from_db_or_env(session, key, default)
            except Exception:
                # If even SessionLocal fails or pypy issues
                return os.getenv(key, default)
        
        return self._resolve_from_db_or_env(db, key, default)

    def _resolve_from_db_or_env(self, db: Session, key: str, default: str) -> str:
        try:
            row = db.query(DBAdminSetting).filter(DBAdminSetting.key == SECURE_SECRETS_SETTING_KEY).first()
            if row:
                secrets = self._decrypt_vault(row)
                if secrets.get(key):
                    return secrets[key]
        except Exception:
            pass
        
        return os.getenv(key, default)

    def sanitize_integration_config(self, provider_key: str, config: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
        # Define sensitive fields per provider
        SENSITIVE_FIELDS = {
            "openai": ["api_key"],
            "apify": ["api_token"],
            "perplexity": ["api_key"],
            "firecrawl": ["api_key"],
            "ollama": ["api_key"],
            "anthropic": ["api_key"],
            "slack": ["webhook"],
            "smtp": ["password"]
        }
        
        sensitive_keys = SENSITIVE_FIELDS.get(provider_key, [])
        extracted = {}
        clean_config = dict(config)
        
        for s_key in sensitive_keys:
            val = config.get(s_key)
            if val and val != "********":
                # Map to canonical vault key
                vault_key = s_key.upper()
                if provider_key == "apify" and s_key == "api_token":
                    vault_key = "APIFY_API_TOKEN"
                elif provider_key == "slack" and s_key == "webhook":
                    vault_key = "SLACK_WEBHOOK"
                elif provider_key != "smtp":
                    vault_key = f"{provider_key.upper()}_API_KEY"
                elif provider_key == "smtp" and s_key == "password":
                    vault_key = "SMTP_PASSWORD"
                
                # Verify if vault_key is in schema
                all_schema_keys = [k["key"] for cat in SECRET_SCHEMA["categories"] for k in cat["keys"]]
                if vault_key in all_schema_keys:
                    extracted[vault_key] = val
                    clean_config[s_key] = "" # Clear from config
            elif val == "********":
                # Keep as empty in clean_config to avoid overwriting with masking string
                clean_config[s_key] = ""
                
        return clean_config, extracted

    def apply_integration_secret_fields(self, db: Session, provider_key: str, config: dict[str, Any], include_runtime_values: bool = False) -> dict[str, Any]:
        SENSITIVE_FIELDS = {
            "openai": ["api_key"],
            "apify": ["api_token"],
            "perplexity": ["api_key"],
            "firecrawl": ["api_key"],
            "ollama": ["api_key"],
            "anthropic": ["api_key"],
            "slack": ["webhook"],
            "smtp": ["password"]
        }
        
        sensitive_keys = SENSITIVE_FIELDS.get(provider_key, [])
        output_config = dict(config)
        
        for s_key in sensitive_keys:
            vault_key = s_key.upper()
            if provider_key == "apify" and s_key == "api_token":
                vault_key = "APIFY_API_TOKEN"
            elif provider_key == "slack" and s_key == "webhook":
                vault_key = "SLACK_WEBHOOK"
            elif provider_key != "smtp":
                vault_key = f"{provider_key.upper()}_API_KEY"
            elif provider_key == "smtp" and s_key == "password":
                vault_key = "SMTP_PASSWORD"
            
            secret_val = self.resolve_secret(db, vault_key)
            if secret_val:
                if include_runtime_values:
                    output_config[s_key] = secret_val
                else:
                    output_config[s_key] = "********"
            else:
                output_config[s_key] = ""
                
        return output_config

    def migrate_plaintext_integration_secrets_if_needed(self, db: Session) -> dict[str, Any]:
        marker = db.query(DBAdminSetting).filter(DBAdminSetting.key == MIGRATION_MARKER_KEY).first()
        if marker and marker.value_json.get("done"):
            return {"status": "already_done"}

        # Define sensitive fields per provider
        SENSITIVE_FIELDS = {
            "openai": ["api_key"],
            "apify": ["api_token"],
            "perplexity": ["api_key"],
            "firecrawl": ["api_key"],
            "ollama": ["api_key"],
            "anthropic": ["api_key"],
            "slack": ["webhook"],
            "smtp": ["password"]
        }
        
        integrations = db.query(DBIntegrationConfig).all()
        vault_row = self._get_vault_row(db)
        secrets = self._decrypt_vault(vault_row)
        migrated_count = 0
        
        for integration in integrations:
            sensitive_keys = SENSITIVE_FIELDS.get(integration.key, [])
            config = integration.config_json or {}
            changed = False
            
            for s_key in sensitive_keys:
                val = config.get(s_key)
                if val and val != "********":
                    # Map config key to canonical vault key if needed
                    vault_key = s_key.upper()
                    if integration.key == "apify" and s_key == "api_token":
                        vault_key = "APIFY_API_TOKEN"
                    elif integration.key == "slack" and s_key == "webhook":
                        vault_key = "SLACK_WEBHOOK"
                    elif integration.key != "smtp":
                        vault_key = f"{integration.key.upper()}_API_KEY"
                    elif integration.key == "smtp" and s_key == "password":
                        vault_key = "SMTP_PASSWORD"
                    
                    # Verify if vault_key is in schema
                    all_schema_keys = [k["key"] for cat in SECRET_SCHEMA["categories"] for k in cat["keys"]]
                    if vault_key in all_schema_keys:
                        secrets[vault_key] = val
                        config[s_key] = "" # Clear from config
                        changed = True
                        migrated_count += 1
            
            if changed:
                integration.config_json = config
        
        if migrated_count > 0:
            self._encrypt_vault(vault_row, secrets, "migration_system")
        
        if not marker:
            marker = DBAdminSetting(key=MIGRATION_MARKER_KEY)
            db.add(marker)
        
        marker.value_json = {
            "done": True,
            "at": datetime.now(timezone.utc).isoformat(),
            "migrated_count": migrated_count
        }
        db.commit()
        
        return {"status": "completed", "migrated": migrated_count}

secrets_manager = SecretsManager()
