from __future__ import annotations

from sqlalchemy import text


def _get_table_columns(connection, table_name: str) -> set[str]:
    rows = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in rows}


def ensure_sqlite_schema_compatibility(engine) -> None:
    """
    Lightweight migration helper for local SQLite usage.
    Adds missing columns required by the current runtime models.
    """
    if engine.dialect.name != "sqlite":
        return

    required_lead_columns = {
        "segment": "TEXT",
        "stage": "TEXT DEFAULT 'NEW'",
        "outcome": "TEXT",
        "icp_score": "REAL DEFAULT 0.0",
        "heat_score": "REAL DEFAULT 0.0",
        "tier": "TEXT DEFAULT 'Tier D'",
        "heat_status": "TEXT DEFAULT 'Cold'",
        "next_best_action": "TEXT",
        "icp_breakdown": "TEXT DEFAULT '{}'",
        "heat_breakdown": "TEXT DEFAULT '{}'",
        "details": "TEXT DEFAULT '{}'",
    }
    required_project_columns = {
        "name": "TEXT",
        "description": "TEXT",
        "status": "TEXT DEFAULT 'Planning'",
        "lead_id": "TEXT",
        "due_date": "TIMESTAMP",
        "created_at": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    }
    required_admin_settings_columns = {
        "key": "TEXT",
        "value_json": "TEXT NOT NULL DEFAULT '{}'",
        "updated_at": "TIMESTAMP",
    }

    with engine.begin() as connection:
        lead_columns = _get_table_columns(connection, "leads")
        if lead_columns:
            for column_name, column_type in required_lead_columns.items():
                if column_name not in lead_columns:
                    connection.execute(
                        text(f"ALTER TABLE leads ADD COLUMN {column_name} {column_type}")
                    )

            # Copy legacy scores into the new columns when they are still empty.
            connection.execute(
                text(
                    """
                    UPDATE leads
                    SET icp_score = COALESCE(NULLIF(icp_score, 0), demographic_score),
                        heat_score = COALESCE(NULLIF(heat_score, 0), behavioral_score + intent_score),
                        tier = COALESCE(NULLIF(tier, ''), 'Tier D'),
                        heat_status = COALESCE(NULLIF(heat_status, ''), 'Cold'),
                        icp_breakdown = CASE
                            WHEN icp_breakdown IS NULL OR icp_breakdown = '' OR icp_breakdown = '{}' THEN score_breakdown
                            ELSE icp_breakdown
                        END
                    """
                )
            )

        project_columns = _get_table_columns(connection, "projects")
        if project_columns:
            for column_name, column_type in required_project_columns.items():
                if column_name not in project_columns:
                    connection.execute(
                        text(f"ALTER TABLE projects ADD COLUMN {column_name} {column_type}")
                    )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_status ON projects (status)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_due_date ON projects (due_date)")
            )

        settings_columns = _get_table_columns(connection, "admin_settings")
        if not settings_columns:
            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS admin_settings (
                        id INTEGER PRIMARY KEY,
                        key TEXT UNIQUE NOT NULL,
                        value_json TEXT NOT NULL DEFAULT '{}',
                        updated_at TIMESTAMP
                    )
                    """
                )
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_admin_settings_key ON admin_settings (key)")
            )
        else:
            for column_name, column_type in required_admin_settings_columns.items():
                if column_name not in settings_columns:
                    connection.execute(
                        text(
                            f"ALTER TABLE admin_settings ADD COLUMN {column_name} {column_type}"
                        )
                    )
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_settings_key ON admin_settings (key)"
                )
            )

        # Ensure additive admin tables exist on legacy local SQLite databases.
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_roles (
                    id INTEGER PRIMARY KEY,
                    key TEXT UNIQUE NOT NULL,
                    label TEXT NOT NULL,
                    created_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    display_name TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_user_roles (
                    id INTEGER PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    role_id INTEGER NOT NULL,
                    created_at TIMESTAMP,
                    UNIQUE(user_id, role_id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                    id TEXT PRIMARY KEY,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_webhook_configs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    events TEXT NOT NULL DEFAULT '[]',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_integration_configs (
                    id INTEGER PRIMARY KEY,
                    key TEXT UNIQUE NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    config_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_account_profiles (
                    id INTEGER PRIMARY KEY,
                    key TEXT UNIQUE NOT NULL,
                    full_name TEXT,
                    email TEXT,
                    title TEXT,
                    locale TEXT NOT NULL DEFAULT 'fr-FR',
                    timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
                    preferences_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_billing_profiles (
                    id INTEGER PRIMARY KEY,
                    key TEXT UNIQUE NOT NULL,
                    plan_name TEXT NOT NULL DEFAULT 'Business',
                    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
                    status TEXT NOT NULL DEFAULT 'active',
                    currency TEXT NOT NULL DEFAULT 'EUR',
                    amount_cents INTEGER NOT NULL DEFAULT 9900,
                    company_name TEXT,
                    billing_email TEXT,
                    vat_number TEXT,
                    address_line TEXT,
                    city TEXT,
                    postal_code TEXT,
                    country TEXT,
                    notes TEXT,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_billing_invoices (
                    id TEXT PRIMARY KEY,
                    invoice_number TEXT UNIQUE NOT NULL,
                    period_start TIMESTAMP,
                    period_end TIMESTAMP,
                    issued_at TIMESTAMP,
                    due_at TIMESTAMP,
                    status TEXT NOT NULL DEFAULT 'paid',
                    currency TEXT NOT NULL DEFAULT 'EUR',
                    amount_cents INTEGER NOT NULL DEFAULT 0,
                    notes TEXT,
                    created_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_notification_preferences (
                    id INTEGER PRIMARY KEY,
                    channel TEXT NOT NULL,
                    event_key TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    updated_at TIMESTAMP,
                    UNIQUE(channel, event_key)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_notifications (
                    id TEXT PRIMARY KEY,
                    event_key TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'in_app',
                    entity_type TEXT,
                    entity_id TEXT,
                    link_href TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    sent_at TIMESTAMP,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_report_schedules (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    frequency TEXT NOT NULL DEFAULT 'weekly',
                    timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
                    hour_local INTEGER NOT NULL DEFAULT 9,
                    minute_local INTEGER NOT NULL DEFAULT 0,
                    format TEXT NOT NULL DEFAULT 'pdf',
                    recipients_json TEXT NOT NULL DEFAULT '[]',
                    filters_json TEXT NOT NULL DEFAULT '{}',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    last_run_at TIMESTAMP,
                    next_run_at TIMESTAMP,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_report_runs (
                    id TEXT PRIMARY KEY,
                    schedule_id TEXT,
                    status TEXT NOT NULL DEFAULT 'success',
                    output_format TEXT NOT NULL DEFAULT 'pdf',
                    recipient_count INTEGER NOT NULL DEFAULT 0,
                    started_at TIMESTAMP,
                    finished_at TIMESTAMP,
                    message TEXT,
                    created_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_roles_key ON admin_roles (key)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_users_email ON admin_users (email)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_users_status ON admin_users (status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_user_roles_user_id ON admin_user_roles (user_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_user_roles_role_id ON admin_user_roles (role_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_created_at ON admin_audit_logs (created_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_admin_webhook_configs_name ON admin_webhook_configs (name)"))
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_integration_configs_key ON admin_integration_configs (key)")
        )
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_account_profiles_key ON admin_account_profiles (key)")
        )
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_billing_profiles_key ON admin_billing_profiles (key)")
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_billing_invoices_invoice_number ON admin_billing_invoices (invoice_number)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_admin_notification_preferences_channel ON admin_notification_preferences (channel)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_admin_notification_preferences_event_key ON admin_notification_preferences (event_key)"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_notifications_created_at ON admin_notifications (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_notifications_is_read ON admin_notifications (is_read)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_notifications_event_key ON admin_notifications (event_key)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_report_schedules_enabled ON admin_report_schedules (enabled)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_report_schedules_next_run_at ON admin_report_schedules (next_run_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_report_runs_schedule_id ON admin_report_runs (schedule_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_report_runs_created_at ON admin_report_runs (created_at)")
        )
