from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
import uuid
from pydantic import BaseModel, ConfigDict, Field, EmailStr, HttpUrl

class LeadStatus(str, Enum):
    NEW = "NEW"
    ENRICHED = "ENRICHED"
    SCORED = "SCORED"
    CONTACTED = "CONTACTED"
    INTERESTED = "INTERESTED"
    CONVERTED = "CONVERTED"
    LOST = "LOST"
    DQ = "DISQUALIFIED"

class LeadStage(str, Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    OPENED = "OPENED"
    REPLIED = "REPLIED"
    BOOKED = "BOOKED"
    SHOW = "SHOW"
    SOLD = "SOLD"
    LOST = "LOST"

class LeadOutcome(str, Enum):
    BOOKED = "BOOKED"
    SHOW = "SHOW"
    CLOSED = "CLOSED"
    LOST = "LOST"
    NO_REPLY = "NO_REPLY"

class InteractionType(str, Enum):
    EMAIL_SENT = "EMAIL_SENT"
    EMAIL_OPENED = "EMAIL_OPENED"
    EMAIL_REPLIED = "EMAIL_REPLIED"
    LINKEDIN_CONNECT = "LINKEDIN_CONNECT"
    LINKEDIN_MESSAGE = "LINKEDIN_MESSAGE"
    CALL_ATTEMPT = "CALL_ATTEMPT"
    CALL_CONNECTED = "CALL_CONNECTED"
    MEETING_BOOKED = "MEETING_BOOKED"

class Interaction(BaseModel):
    id: str = Field(..., description="Unique ID of the interaction")
    type: InteractionType
    timestamp: datetime = Field(default_factory=datetime.now)
    details: Dict[str, Any] = Field(default_factory=dict)
    
class Company(BaseModel):
    name: str
    domain: Optional[str] = None
    industry: Optional[str] = None
    size_range: Optional[str] = None
    revenue_range: Optional[str] = None
    linkedin_url: Optional[HttpUrl] = None
    location: Optional[str] = None
    tech_stack: List[str] = Field(default_factory=list)
    description: Optional[str] = None

class ScoringData(BaseModel):
    icp_score: float = 0.0
    heat_score: float = 0.0
    total_score: float = 0.0 # Legacy/Combined
    tier: str = "Tier D"
    heat_status: str = "Cold"
    next_best_action: Optional[str] = None
    icp_breakdown: Dict[str, float] = Field(default_factory=dict)
    heat_breakdown: Dict[str, float] = Field(default_factory=dict)
    last_scored_at: Optional[datetime] = None

class Lead(BaseModel):
    id: str = Field(..., description="Unique ID of the lead")
    first_name: str
    last_name: str
    email: EmailStr
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[HttpUrl] = None
    
    company: Company
    status: LeadStatus = LeadStatus.NEW
    segment: Optional[str] = None
    personalized_hook: Optional[str] = None
    
    total_score: float = 0.0 # Added for easy root access
    score: ScoringData = Field(default_factory=ScoringData)
    interactions: List[Interaction] = Field(default_factory=list)
    outcome: Optional[LeadOutcome] = None
    
    # Follow-up Engine Fields
    stage: LeadStage = LeadStage.NEW
    next_action_date: Optional[datetime] = None
    stage_canonical: Optional[str] = None
    lead_owner_user_id: Optional[str] = None
    stage_entered_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    next_action_at: Optional[datetime] = None
    confidence_score: float = 0.0
    playbook_id: Optional[str] = None
    handoff_required: bool = False
    handoff_completed_at: Optional[datetime] = None

    details: Dict[str, Any] = Field(default_factory=dict)
    
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class TaskPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"

class TaskStatus(str, Enum):
    TODO = "To Do"
    IN_PROGRESS = "In Progress"
    DONE = "Done"

class Task(BaseModel):
    id: str = Field(..., description="Unique ID of the task")
    title: str
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: Optional[datetime] = None
    assigned_to: str = "You"
    lead_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    
    # Use simple strings in API responses for enums
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class ProjectStatus(str, Enum):
    PLANNING = "Planning"
    IN_PROGRESS = "In Progress"
    ON_HOLD = "On Hold"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.PLANNING
    lead_id: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class AppointmentStatus(str, Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no-show"

class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: datetime
    status: AppointmentStatus = AppointmentStatus.SCHEDULED
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    opportunity_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class WorkflowRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    trigger_type: str
    criteria: Dict[str, Any] = Field(default_factory=dict, alias="criteria_json")
    action_type: str
    action_config: Dict[str, Any] = Field(default_factory=dict, alias="action_config_json")
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class LandingPage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    title: str
    description: Optional[str] = None
    content: Dict[str, Any] = Field(default_factory=dict)
    theme: Dict[str, Any] = Field(default_factory=dict)
    is_published: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True)

class LibraryDoc(BaseModel):
    id: str
    title: str
    filename: str
    file_type: str
    size_bytes: int
    mime_type: str
    metadata: Dict[str, Any] = Field(default_factory=dict, alias="metadata_json")
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class CampaignSequence(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: str = "draft"
    channels: List[str] = Field(default_factory=list, alias="channels_json")
    steps: List[Dict[str, Any]] = Field(default_factory=list, alias="steps_json")
    created_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: str = "draft"
    sequence_id: Optional[str] = None
    channel_strategy: Dict[str, Any] = Field(default_factory=dict, alias="channel_strategy_json")
    enrollment_filter: Dict[str, Any] = Field(default_factory=dict, alias="enrollment_filter_json")
    created_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class CampaignRun(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    campaign_id: str
    lead_id: Optional[str] = None
    trigger_source: str = "manual"
    action_type: str = "nurture_step"
    status: str = "pending"
    step_index: int = 0
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True)

class AccountProfile(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None
    locale: str = "fr-FR"
    timezone: str = "Europe/Paris"
    preferences: Dict[str, Any] = Field(default_factory=dict, alias="preferences_json")
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
