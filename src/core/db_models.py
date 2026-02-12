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
    status = Column(String, default="To Do")
    priority = Column(String, default="Medium")
    due_date = Column(DateTime, nullable=True)
    assigned_to = Column(String, default="You")
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class DBProject(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    status = Column(String, default="Planning", index=True)
    lead_id = Column(String, ForeignKey("leads.id"), nullable=True)
    due_date = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.now)
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
