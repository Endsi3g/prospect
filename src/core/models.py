from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr, HttpUrl

class LeadStatus(str, Enum):
    NEW = "NEW"
    ENRICHED = "ENRICHED"
    SCORED = "SCORED"
    CONTACTED = "CONTACTED"
    INTERESTED = "INTERESTED"
    CONVERTED = "CONVERTED"
    LOST = "LOST"
    DQ = "DISQUALIFIED"

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
    demographic_score: float = 0.0
    behavioral_score: float = 0.0
    intent_score: float = 0.0
    total_score: float = 0.0
    score_breakdown: Dict[str, float] = Field(default_factory=dict)
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
    
    score: ScoringData = Field(default_factory=ScoringData)
    interactions: List[Interaction] = Field(default_factory=list)
    
    tags: List[str] = Field(default_factory=list)
    details: Dict[str, Any] = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Config:
        use_enum_values = True
