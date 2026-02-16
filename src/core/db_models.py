from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SqlEnum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from .models import LeadStatus, LeadStage, LeadOutcome, InteractionType

class DBCompany(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    domain = Column(String, unique=True, index=True)
    industry = Column(String, nullable=True)
    size_range = Column(String, nullable=True)
    revenue_range = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    tech_stack = Column(JSON, default=list) # Store as JSON array
    description = Column(String, nullable=True)

    leads = relationship("DBLead", back_populates="company")

class DBLead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True, index=True) # Using email as ID for compatibility
    first_name = Column(String)
    last_name = Column(String)
    email = Column(String, unique=True, index=True)
    title = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    
    company_id = Column(Integer, ForeignKey("companies.id"))
    company = relationship("DBCompany", back_populates="leads")

    status = Column(SqlEnum(LeadStatus), default=LeadStatus.NEW)
    segment = Column(String, nullable=True)
    stage = Column(SqlEnum(LeadStage), default=LeadStage.NEW)
    outcome = Column(SqlEnum(LeadOutcome), nullable=True)
    lead_owner_user_id = Column(String, ForeignKey("admin_users.id"), nullable=True, index=True)
    stage_canonical = Column(String, nullable=False, default="new", index=True)
    stage_entered_at = Column(DateTime, nullable=True, index=True)
    sla_due_at = Column(DateTime, nullable=True, index=True)
    next_action_at = Column(DateTime, nullable=True, index=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    playbook_id = Column(String, nullable=True, index=True)
    handoff_required = Column(Boolean, nullable=False, default=False, index=True)
    handoff_completed_at = Column(DateTime, nullable=True, index=True)
    
    # Legacy scoring columns (kept for compatibility with existing DBs)
    demographic_score = Column(Float, default=0.0)
    behavioral_score = Column(Float, default=0.0)
    intent_score = Column(Float, default=0.0)
    score_breakdown = Column(JSON, default=dict)

    # Current scoring model
    icp_score = Column(Float, default=0.0)
    heat_score = Column(Float, default=0.0)
    total_score = Column(Float, default=0.0)
    tier = Column(String, default="Tier D")
    heat_status = Column(String, default="Cold")
    next_best_action = Column(String, nullable=True)
    icp_breakdown = Column(JSON, default=dict)
    heat_breakdown = Column(JSON, default=dict)
    last_scored_at = Column(DateTime, nullable=True)

    tags = Column(JSON, default=list)
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    interactions = relationship("DBInteraction", back_populates="lead")

class DBInteraction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(String, ForeignKey("leads.id"))
    type = Column(SqlEnum(InteractionType))
    timestamp = Column(DateTime, default=datetime.now)
    details = Column(JSON, default=dict)

    lead = relationship("DBLead", back_populates="interactions")

class DBTask(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, index=True)
    title = Column(String)
    description = Column(String, nullable=True)
    status = Column(String, default="To Do")
    priority = Column(String, default="Medium")
    due_date = Column(DateTime, nullable=True)
    assigned_to = Column(String, default="You")
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True, index=True)
    project_name = Column(String, nullable=True)
    channel = Column(String, default="email", nullable=False, index=True)
    sequence_step = Column(Integer, default=1, nullable=False)
    source = Column(String, default="manual", nullable=False, index=True)
    rule_id = Column(String, nullable=True, index=True)
    score_snapshot_json = Column(JSON, default=dict, nullable=False)
    subtasks_json = Column(JSON, default=list, nullable=False)
    comments_json = Column(JSON, default=list, nullable=False)
    attachments_json = Column(JSON, default=list, nullable=False)
    timeline_json = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    closed_at = Column(DateTime, nullable=True)

class DBProject(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    status = Column(String, default="Planning", index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True)
    progress_percent = Column(Integer, default=0)
    budget_total = Column(Float, nullable=True)
    budget_spent = Column(Float, default=0.0)
    team_json = Column(JSON, default=list, nullable=False)
    timeline_json = Column(JSON, default=list, nullable=False)
    deliverables_json = Column(JSON, default=list, nullable=False)
    due_date = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBOpportunity(Base):
    __tablename__ = "opportunities"

    id = Column(String, primary_key=True, index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    stage = Column(String, nullable=False, default="qualification", index=True)
    status = Column(String, nullable=False, default="open", index=True)
    owner_user_id = Column(String, ForeignKey("admin_users.id"), nullable=True, index=True)
    stage_canonical = Column(String, nullable=False, default="opportunity", index=True)
    stage_entered_at = Column(DateTime, nullable=True, index=True)
    sla_due_at = Column(DateTime, nullable=True, index=True)
    next_action_at = Column(DateTime, nullable=True, index=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    playbook_id = Column(String, nullable=True, index=True)
    handoff_required = Column(Boolean, nullable=False, default=False, index=True)
    handoff_completed_at = Column(DateTime, nullable=True, index=True)
    amount = Column(Float, nullable=True)
    probability = Column(Integer, nullable=False, default=10)
    assigned_to = Column(String, nullable=False, default="Vous", index=True)
    expected_close_date = Column(DateTime, nullable=True, index=True)
    details_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBStageEvent(Base):
    __tablename__ = "stage_events"

    id = Column(String, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(String, nullable=False, index=True)
    from_stage = Column(String, nullable=True, index=True)
    to_stage = Column(String, nullable=False, index=True)
    reason = Column(String, nullable=True)
    actor = Column(String, nullable=False, default="system", index=True)
    source = Column(String, nullable=False, default="manual", index=True)
    metadata_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)


class DBSmartRecommendation(Base):
    __tablename__ = "smart_recommendations"

    id = Column(String, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(String, nullable=False, index=True)
    recommendation_type = Column(String, nullable=False, index=True)
    priority = Column(Integer, nullable=False, default=50, index=True)
    payload_json = Column(JSON, default=dict, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    requires_confirm = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    resolved_at = Column(DateTime, nullable=True, index=True)


class DBTeamQueue(Base):
    __tablename__ = "team_queues"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    routing_rule_json = Column(JSON, default=dict, nullable=False)
    sla_policy_json = Column(JSON, default=dict, nullable=False)
    active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBAdminSetting(Base):
    __tablename__ = "admin_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value_json = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBAdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    password_updated_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="active", index=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    role_links = relationship(
        "DBAdminUserRole",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class DBAdminRole(Base):
    __tablename__ = "admin_roles"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    label = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    user_links = relationship(
        "DBAdminUserRole",
        back_populates="role",
        cascade="all, delete-orphan",
    )


class DBAdminUserRole(Base):
    __tablename__ = "admin_user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_admin_user_role"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("admin_users.id"), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey("admin_roles.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("DBAdminUser", back_populates="role_links")
    role = relationship("DBAdminRole", back_populates="user_links")


class DBAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(String, primary_key=True, index=True)
    actor = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(String, nullable=True, index=True)
    metadata_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, index=True)


class DBAdminSession(Base):
    __tablename__ = "admin_auth_sessions"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    refresh_token_hash = Column(String, unique=True, nullable=False, index=True)
    rotated_from_session_id = Column(String, nullable=True, index=True)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    last_seen_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)


class DBWebhookConfig(Base):
    __tablename__ = "admin_webhook_configs"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    url = Column(String, nullable=False)
    events = Column(JSON, default=list, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBIntegrationConfig(Base):
    __tablename__ = "admin_integration_configs"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    enabled = Column(Boolean, default=False, nullable=False)
    config_json = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBAccountProfile(Base):
    __tablename__ = "admin_account_profiles"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True, default="primary")
    full_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    title = Column(String, nullable=True)
    locale = Column(String, nullable=False, default="fr-FR")
    timezone = Column(String, nullable=False, default="Europe/Paris")
    preferences_json = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBBillingProfile(Base):
    __tablename__ = "admin_billing_profiles"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True, default="primary")
    plan_name = Column(String, nullable=False, default="Business")
    billing_cycle = Column(String, nullable=False, default="monthly")
    status = Column(String, nullable=False, default="active")
    currency = Column(String, nullable=False, default="EUR")
    amount_cents = Column(Integer, nullable=False, default=9900)
    company_name = Column(String, nullable=True)
    billing_email = Column(String, nullable=True)
    vat_number = Column(String, nullable=True)
    address_line = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBBillingInvoice(Base):
    __tablename__ = "admin_billing_invoices"

    id = Column(String, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    issued_at = Column(DateTime, default=datetime.now, nullable=False)
    due_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="paid", index=True)
    currency = Column(String, nullable=False, default="EUR")
    amount_cents = Column(Integer, nullable=False, default=0)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)


class DBNotificationPreference(Base):
    __tablename__ = "admin_notification_preferences"
    __table_args__ = (UniqueConstraint("channel", "event_key", name="uq_notification_channel_event"),)

    id = Column(Integer, primary_key=True, index=True)
    channel = Column(String, nullable=False, index=True)
    event_key = Column(String, nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBNotification(Base):
    __tablename__ = "admin_notifications"

    id = Column(String, primary_key=True, index=True)
    event_key = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    channel = Column(String, nullable=False, default="in_app", index=True)
    entity_type = Column(String, nullable=True, index=True)
    entity_id = Column(String, nullable=True, index=True)
    link_href = Column(String, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    sent_at = Column(DateTime, nullable=True)
    metadata_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)


class DBReportSchedule(Base):
    __tablename__ = "admin_report_schedules"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    frequency = Column(String, nullable=False, default="weekly", index=True)
    timezone = Column(String, nullable=False, default="Europe/Paris")
    hour_local = Column(Integer, nullable=False, default=9)
    minute_local = Column(Integer, nullable=False, default=0)
    format = Column(String, nullable=False, default="pdf")
    recipients_json = Column(JSON, default=list, nullable=False)
    filters_json = Column(JSON, default=dict, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, index=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class DBReportRun(Base):
    __tablename__ = "admin_report_runs"

    id = Column(String, primary_key=True, index=True)
    schedule_id = Column(String, ForeignKey("admin_report_schedules.id"), nullable=True, index=True)
    status = Column(String, nullable=False, default="success", index=True)
    output_format = Column(String, nullable=False, default="pdf")
    recipient_count = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, default=datetime.now, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)

    schedule = relationship("DBReportSchedule")


class DBAssistantRun(Base):
    __tablename__ = "assistant_runs"

    id = Column(String, primary_key=True, index=True)
    prompt = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    actor = Column(String, nullable=False, default="admin")
    summary = Column(String, nullable=True)
    config_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    finished_at = Column(DateTime, nullable=True)

    actions = relationship(
        "DBAssistantAction",
        back_populates="run",
        cascade="all, delete-orphan",
    )


class DBAssistantAction(Base):
    __tablename__ = "assistant_actions"

    id = Column(String, primary_key=True, index=True)
    run_id = Column(String, ForeignKey("assistant_runs.id"), nullable=False, index=True)
    action_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    payload_json = Column(JSON, default=dict, nullable=False)
    requires_confirm = Column(Boolean, default=False, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    result_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    executed_at = Column(DateTime, nullable=True)

    run = relationship("DBAssistantRun", back_populates="actions")


class DBCampaignSequence(Base):
    __tablename__ = "campaign_sequences"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft", index=True)
    channels_json = Column(JSON, default=list, nullable=False)
    steps_json = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    campaigns = relationship("DBCampaign", back_populates="sequence")


class DBCampaign(Base):
    __tablename__ = "campaigns"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft", index=True)
    sequence_id = Column(String, ForeignKey("campaign_sequences.id"), nullable=True, index=True)
    channel_strategy_json = Column(JSON, default=dict, nullable=False)
    enrollment_filter_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    sequence = relationship("DBCampaignSequence", back_populates="campaigns")
    enrollments = relationship(
        "DBCampaignEnrollment",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )
    runs = relationship(
        "DBCampaignRun",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )


class DBCampaignEnrollment(Base):
    __tablename__ = "campaign_enrollments"

    id = Column(String, primary_key=True, index=True)
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False, index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="active", index=True)
    current_step_index = Column(Integer, nullable=False, default=0)
    next_run_at = Column(DateTime, nullable=True, index=True)
    last_action_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    campaign = relationship("DBCampaign", back_populates="enrollments")


class DBCampaignRun(Base):
    __tablename__ = "campaign_runs"

    id = Column(String, primary_key=True, index=True)
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False, index=True)
    enrollment_id = Column(String, ForeignKey("campaign_enrollments.id"), nullable=True, index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True, index=True)
    trigger_source = Column(String, nullable=False, default="manual")
    action_type = Column(String, nullable=False, default="nurture_step")
    status = Column(String, nullable=False, default="pending", index=True)
    step_index = Column(Integer, nullable=False, default=0)
    payload_json = Column(JSON, default=dict, nullable=False)
    result_json = Column(JSON, default=dict, nullable=False)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    executed_at = Column(DateTime, nullable=True)

    campaign = relationship("DBCampaign", back_populates="runs")


class DBContentGeneration(Base):
    __tablename__ = "content_generations"

    id = Column(String, primary_key=True, index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True, index=True)
    channel = Column(String, nullable=False, index=True)
    step = Column(Integer, nullable=False, default=1)
    template_key = Column(String, nullable=True)
    provider = Column(String, nullable=False, default="deterministic")
    prompt_context_json = Column(JSON, default=dict, nullable=False)
    output_json = Column(JSON, default=dict, nullable=False)
    variables_used_json = Column(JSON, default=list, nullable=False)
    confidence = Column(Float, nullable=False, default=0.5)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)


class DBEnrichmentJob(Base):
    __tablename__ = "enrichment_jobs"

    id = Column(String, primary_key=True, index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True, index=True)
    query = Column(String, nullable=False, index=True)
    provider = Column(String, nullable=False, default="mock", index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    relevance_score = Column(Float, nullable=False, default=0.0)
    result_json = Column(JSON, default=dict, nullable=False)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    finished_at = Column(DateTime, nullable=True)
