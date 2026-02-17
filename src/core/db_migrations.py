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
        "lead_owner_user_id": "TEXT",
        "stage_canonical": "TEXT NOT NULL DEFAULT 'new'",
        "stage_entered_at": "TIMESTAMP",
        "sla_due_at": "TIMESTAMP",
        "next_action_at": "TIMESTAMP",
        "confidence_score": "REAL NOT NULL DEFAULT 0.0",
        "playbook_id": "TEXT",
        "handoff_required": "INTEGER NOT NULL DEFAULT 0",
        "handoff_completed_at": "TIMESTAMP",
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
        "progress_percent": "INTEGER DEFAULT 0",
        "budget_total": "REAL",
        "budget_spent": "REAL DEFAULT 0.0",
        "team_json": "TEXT NOT NULL DEFAULT '[]'",
        "timeline_json": "TEXT NOT NULL DEFAULT '[]'",
        "deliverables_json": "TEXT NOT NULL DEFAULT '[]'",
        "due_date": "TIMESTAMP",
        "created_at": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    }
    required_task_columns = {
        "description": "TEXT",
        "project_id": "TEXT",
        "project_name": "TEXT",
        "channel": "TEXT NOT NULL DEFAULT 'email'",
        "sequence_step": "INTEGER NOT NULL DEFAULT 1",
        "source": "TEXT NOT NULL DEFAULT 'manual'",
        "rule_id": "TEXT",
        "score_snapshot_json": "TEXT NOT NULL DEFAULT '{}'",
        "subtasks_json": "TEXT NOT NULL DEFAULT '[]'",
        "comments_json": "TEXT NOT NULL DEFAULT '[]'",
        "attachments_json": "TEXT NOT NULL DEFAULT '[]'",
        "timeline_json": "TEXT NOT NULL DEFAULT '[]'",
        "updated_at": "TIMESTAMP",
        "closed_at": "TIMESTAMP",
    }
    required_opportunity_columns = {
        "lead_id": "TEXT NOT NULL DEFAULT 'unknown'",
        "name": "TEXT NOT NULL DEFAULT 'Opportunity'",
        "stage": "TEXT NOT NULL DEFAULT 'qualification'",
        "status": "TEXT NOT NULL DEFAULT 'open'",
        "owner_user_id": "TEXT",
        "stage_canonical": "TEXT NOT NULL DEFAULT 'opportunity'",
        "stage_entered_at": "TIMESTAMP",
        "sla_due_at": "TIMESTAMP",
        "next_action_at": "TIMESTAMP",
        "confidence_score": "REAL NOT NULL DEFAULT 0.0",
        "playbook_id": "TEXT",
        "handoff_required": "INTEGER NOT NULL DEFAULT 0",
        "handoff_completed_at": "TIMESTAMP",
        "amount": "REAL",
        "probability": "INTEGER NOT NULL DEFAULT 10",
        "assigned_to": "TEXT NOT NULL DEFAULT 'You'",
        "expected_close_date": "TIMESTAMP",
        "details_json": "TEXT NOT NULL DEFAULT '{}'",
        "created_at": "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "updated_at": "TIMESTAMP",
    }
    required_admin_settings_columns = {
        "key": "TEXT",
        "value_json": "TEXT NOT NULL DEFAULT '{}'",
        "updated_at": "TIMESTAMP",
    }
    required_admin_user_columns = {
        "password_hash": "TEXT",
        "password_updated_at": "TIMESTAMP",
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

        task_columns = _get_table_columns(connection, "tasks")
        if task_columns:
            for column_name, column_type in required_task_columns.items():
                if column_name not in task_columns:
                    connection.execute(
                        text(f"ALTER TABLE tasks ADD COLUMN {column_name} {column_type}")
                    )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_tasks_channel ON tasks (channel)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_tasks_source ON tasks (source)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_tasks_rule_id ON tasks (rule_id)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON tasks (project_id)")
            )

        opportunity_columns = _get_table_columns(connection, "opportunities")
        if opportunity_columns:
            for column_name, column_type in required_opportunity_columns.items():
                if column_name not in opportunity_columns:
                    connection.execute(
                        text(f"ALTER TABLE opportunities ADD COLUMN {column_name} {column_type}")
                    )
            connection.execute(
                text(
                    """
                    UPDATE opportunities
                    SET stage_canonical = CASE
                        WHEN lower(COALESCE(stage_canonical, '')) <> '' THEN lower(stage_canonical)
                        WHEN lower(COALESCE(stage, '')) IN ('prospect') THEN 'contacted'
                        WHEN lower(COALESCE(stage, '')) IN ('qualification', 'qualified') THEN 'qualified'
                        WHEN lower(COALESCE(stage, '')) IN ('discovery') THEN 'engaged'
                        WHEN lower(COALESCE(stage, '')) IN ('proposal', 'proposed', 'negotiation') THEN 'opportunity'
                        WHEN lower(COALESCE(stage, '')) = 'won' THEN 'won'
                        WHEN lower(COALESCE(stage, '')) = 'lost' THEN 'lost'
                        ELSE 'opportunity'
                    END,
                    stage_entered_at = COALESCE(stage_entered_at, updated_at, created_at),
                    confidence_score = COALESCE(confidence_score, 0.0),
                    handoff_required = COALESCE(handoff_required, 0)
                    WHERE stage_canonical IS NULL OR trim(stage_canonical) = ''
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE opportunities
                    SET lead_id = COALESCE(NULLIF(trim(lead_id), ''), 'unknown'),
                        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                        assigned_to = CASE
                            WHEN assigned_to IS NULL OR trim(assigned_to) = '' OR assigned_to = 'Vous' THEN 'You'
                            ELSE assigned_to
                        END
                    """
                )
            )
        else:
            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS opportunities (
                        id TEXT PRIMARY KEY,
                        lead_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        stage TEXT NOT NULL DEFAULT 'qualification',
                        status TEXT NOT NULL DEFAULT 'open',
                        owner_user_id TEXT,
                        stage_canonical TEXT NOT NULL DEFAULT 'opportunity',
                        stage_entered_at TIMESTAMP,
                        sla_due_at TIMESTAMP,
                        next_action_at TIMESTAMP,
                        confidence_score REAL NOT NULL DEFAULT 0.0,
                        playbook_id TEXT,
                        handoff_required INTEGER NOT NULL DEFAULT 0,
                        handoff_completed_at TIMESTAMP,
                        amount REAL,
                        probability INTEGER NOT NULL DEFAULT 10,
                        assigned_to TEXT NOT NULL DEFAULT 'You',
                        expected_close_date TIMESTAMP,
                        details_json TEXT NOT NULL DEFAULT '{}',
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE leads
                    SET stage_canonical = CASE
                        WHEN lower(COALESCE(stage_canonical, '')) <> '' THEN lower(stage_canonical)
                        WHEN status = 'NEW' THEN 'new'
                        WHEN status = 'ENRICHED' THEN 'enriched'
                        WHEN status = 'SCORED' THEN 'qualified'
                        WHEN status = 'CONTACTED' THEN 'contacted'
                        WHEN status = 'INTERESTED' THEN 'engaged'
                        WHEN status = 'CONVERTED' THEN 'won'
                        WHEN status IN ('LOST', 'DISQUALIFIED') THEN 'lost'
                        ELSE 'new'
                    END,
                    stage_entered_at = COALESCE(stage_entered_at, updated_at, created_at),
                    confidence_score = COALESCE(confidence_score, 0.0),
                    handoff_required = COALESCE(handoff_required, 0)
                    WHERE stage_canonical IS NULL OR trim(stage_canonical) = ''
                    """
                )
            )
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_lead_owner_user_id ON leads (lead_owner_user_id)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_stage_canonical ON leads (stage_canonical)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_stage_entered_at ON leads (stage_entered_at)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_sla_due_at ON leads (sla_due_at)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_next_action_at ON leads (next_action_at)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_playbook_id ON leads (playbook_id)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_handoff_required ON leads (handoff_required)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_handoff_completed_at ON leads (handoff_completed_at)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_lead_id ON opportunities (lead_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_status ON opportunities (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_stage ON opportunities (stage)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_expected_close_date ON opportunities (expected_close_date)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_created_at ON opportunities (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_assigned_to ON opportunities (assigned_to)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_owner_user_id ON opportunities (owner_user_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_stage_canonical ON opportunities (stage_canonical)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_stage_entered_at ON opportunities (stage_entered_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_sla_due_at ON opportunities (sla_due_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_next_action_at ON opportunities (next_action_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_playbook_id ON opportunities (playbook_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_handoff_required ON opportunities (handoff_required)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_opportunities_handoff_completed_at ON opportunities (handoff_completed_at)")
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
                    password_hash TEXT,
                    password_updated_at TIMESTAMP,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        admin_user_columns = _get_table_columns(connection, "admin_users")
        for column_name, column_type in required_admin_user_columns.items():
            if column_name not in admin_user_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE admin_users ADD COLUMN {column_name} {column_type}"
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

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admin_auth_sessions (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    refresh_token_hash TEXT UNIQUE NOT NULL,
                    rotated_from_session_id TEXT,
                    user_agent TEXT,
                    ip_address TEXT,
                    created_at TIMESTAMP NOT NULL,
                    last_seen_at TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    revoked_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_auth_sessions_username ON admin_auth_sessions (username)")
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_auth_sessions_refresh_token_hash ON admin_auth_sessions (refresh_token_hash)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_admin_auth_sessions_rotated_from_session_id ON admin_auth_sessions (rotated_from_session_id)"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_auth_sessions_created_at ON admin_auth_sessions (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_auth_sessions_expires_at ON admin_auth_sessions (expires_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_admin_auth_sessions_revoked_at ON admin_auth_sessions (revoked_at)")
        )

        # ── Funnel intelligence tables ──────────────────────────
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS stage_events (
                    id TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    from_stage TEXT,
                    to_stage TEXT NOT NULL,
                    reason TEXT,
                    actor TEXT NOT NULL DEFAULT 'system',
                    source TEXT NOT NULL DEFAULT 'manual',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS smart_recommendations (
                    id TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    recommendation_type TEXT NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 50,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'pending',
                    requires_confirm INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP NOT NULL,
                    resolved_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS team_queues (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    routing_rule_json TEXT NOT NULL DEFAULT '{}',
                    sla_policy_json TEXT NOT NULL DEFAULT '{}',
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_entity_type ON stage_events (entity_type)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_entity_id ON stage_events (entity_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_from_stage ON stage_events (from_stage)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_to_stage ON stage_events (to_stage)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_actor ON stage_events (actor)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_source ON stage_events (source)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_stage_events_created_at ON stage_events (created_at)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_entity_type ON smart_recommendations (entity_type)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_entity_id ON smart_recommendations (entity_id)")
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_smart_recommendations_recommendation_type ON smart_recommendations (recommendation_type)"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_priority ON smart_recommendations (priority)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_status ON smart_recommendations (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_requires_confirm ON smart_recommendations (requires_confirm)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_created_at ON smart_recommendations (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_smart_recommendations_resolved_at ON smart_recommendations (resolved_at)")
        )
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_team_queues_name ON team_queues (name)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_team_queues_active ON team_queues (active)"))

        # ── Assistant Prospect tables ────────────────────────────
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS assistant_runs (
                    id TEXT PRIMARY KEY,
                    prompt TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    actor TEXT NOT NULL DEFAULT 'admin',
                    summary TEXT,
                    config_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP,
                    finished_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS assistant_actions (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    entity_type TEXT,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    requires_confirm INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    result_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP,
                    executed_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_assistant_runs_status ON assistant_runs (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_assistant_runs_created_at ON assistant_runs (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_assistant_actions_run_id ON assistant_actions (run_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_assistant_actions_status ON assistant_actions (status)")
        )

        # ── Campaigns / Sequences / Content / Enrichment ────────
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS campaign_sequences (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    channels_json TEXT NOT NULL DEFAULT '[]',
                    steps_json TEXT NOT NULL DEFAULT '[]',
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS campaigns (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    sequence_id TEXT,
                    channel_strategy_json TEXT NOT NULL DEFAULT '{}',
                    enrollment_filter_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS campaign_enrollments (
                    id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    lead_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    current_step_index INTEGER NOT NULL DEFAULT 0,
                    next_run_at TIMESTAMP,
                    last_action_at TIMESTAMP,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    UNIQUE(campaign_id, lead_id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS campaign_runs (
                    id TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL,
                    enrollment_id TEXT,
                    lead_id TEXT,
                    trigger_source TEXT NOT NULL DEFAULT 'manual',
                    action_type TEXT NOT NULL DEFAULT 'nurture_step',
                    status TEXT NOT NULL DEFAULT 'pending',
                    step_index INTEGER NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    result_json TEXT NOT NULL DEFAULT '{}',
                    error_message TEXT,
                    created_at TIMESTAMP,
                    executed_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS content_generations (
                    id TEXT PRIMARY KEY,
                    lead_id TEXT,
                    channel TEXT NOT NULL,
                    step INTEGER NOT NULL DEFAULT 1,
                    template_key TEXT,
                    provider TEXT NOT NULL DEFAULT 'deterministic',
                    prompt_context_json TEXT NOT NULL DEFAULT '{}',
                    output_json TEXT NOT NULL DEFAULT '{}',
                    variables_used_json TEXT NOT NULL DEFAULT '[]',
                    confidence REAL NOT NULL DEFAULT 0.5,
                    created_at TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS enrichment_jobs (
                    id TEXT PRIMARY KEY,
                    lead_id TEXT,
                    query TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'mock',
                    status TEXT NOT NULL DEFAULT 'pending',
                    relevance_score REAL NOT NULL DEFAULT 0.0,
                    result_json TEXT NOT NULL DEFAULT '{}',
                    error_message TEXT,
                    created_at TIMESTAMP,
                    finished_at TIMESTAMP
                )
                """
            )
        )

        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_sequences_status ON campaign_sequences (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_sequences_created_at ON campaign_sequences (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaigns_status ON campaigns (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaigns_sequence_id ON campaigns (sequence_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaigns_created_at ON campaigns (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_enrollments_campaign_id ON campaign_enrollments (campaign_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_enrollments_lead_id ON campaign_enrollments (lead_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_enrollments_status ON campaign_enrollments (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_enrollments_next_run_at ON campaign_enrollments (next_run_at)")
        )
        
        # Cleanup duplicates before enforcing uniqueness
        connection.execute(
            text(
                """
                DELETE FROM campaign_enrollments 
                WHERE id NOT IN (
                    SELECT MIN(id) 
                    FROM campaign_enrollments 
                    GROUP BY campaign_id, lead_id
                )
                """
            )
        )

        try:
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_enrollments_campaign_id_lead_id "
                    "ON campaign_enrollments (campaign_id, lead_id)"
                )
            )
        except Exception as exc:
            # Fallback for systems where index creation might fail despite cleanup
            print(f"Warning: Could not create unique index on campaign_enrollments: {exc}")

        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_runs_campaign_id ON campaign_runs (campaign_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_runs_enrollment_id ON campaign_runs (enrollment_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_runs_lead_id ON campaign_runs (lead_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_runs_status ON campaign_runs (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_campaign_runs_created_at ON campaign_runs (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_content_generations_channel ON content_generations (channel)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_content_generations_lead_id ON content_generations (lead_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_content_generations_created_at ON content_generations (created_at)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_enrichment_jobs_status ON enrichment_jobs (status)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_enrichment_jobs_provider ON enrichment_jobs (provider)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_enrichment_jobs_created_at ON enrichment_jobs (created_at)")
        )
