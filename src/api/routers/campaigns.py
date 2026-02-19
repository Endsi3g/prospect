from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
from datetime import datetime

from src.core.database import SessionLocal
from src.core.db_models import DBCampaign, DBCampaignSequence, DBCampaignRun
from src.core.models import Campaign, CampaignSequence, CampaignRun

router = APIRouter(prefix="/api/v1/admin", tags=["Campaigns"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- SEQUENCES ---

@router.get("/sequences", response_model=dict)
def get_sequences(
    limit: int = 100, 
    offset: int = 0, 
    db: Session = Depends(get_db)
):
    items = db.query(DBCampaignSequence).offset(offset).limit(limit).all()
    return {"items": items}

@router.post("/sequences", response_model=CampaignSequence)
def create_sequence(sequence: CampaignSequence, db: Session = Depends(get_db)):
    db_seq = DBCampaignSequence(
        id=sequence.id,
        name=sequence.name,
        description=sequence.description,
        status=sequence.status,
        channels_json=sequence.channels,
        steps_json=sequence.steps
    )
    db.add(db_seq)
    db.commit()
    db.refresh(db_seq)
    return db_seq

# --- CAMPAIGNS ---

@router.get("/campaigns", response_model=dict)
def get_campaigns(
    limit: int = 100, 
    offset: int = 0, 
    db: Session = Depends(get_db)
):
    items = db.query(DBCampaign).offset(offset).limit(limit).all()
    return {"items": items}

@router.post("/campaigns", response_model=Campaign)
def create_campaign(campaign: Campaign, db: Session = Depends(get_db)):
    db_camp = DBCampaign(
        id=campaign.id,
        name=campaign.name,
        description=campaign.description,
        status=campaign.status,
        sequence_id=campaign.sequence_id,
        channel_strategy_json=campaign.channel_strategy,
        enrollment_filter_json=campaign.enrollment_filter
    )
    db.add(db_camp)
    db.commit()
    db.refresh(db_camp)
    return db_camp

@router.patch("/campaigns/{campaign_id}", response_model=Campaign)
def update_campaign(campaign_id: str, campaign_update: dict, db: Session = Depends(get_db)):
    db_camp = db.query(DBCampaign).filter(DBCampaign.id == campaign_id).first()
    if not db_camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    for key, value in campaign_update.items():
        if key == "channel_strategy":
            db_camp.channel_strategy_json = value
        elif key == "enrollment_filter":
            db_camp.enrollment_filter_json = value
        elif hasattr(db_camp, key):
            setattr(db_camp, key, value)
    
    db.commit()
    db.refresh(db_camp)
    return db_camp

@router.post("/campaigns/{campaign_id}/activate")
def activate_campaign(campaign_id: str, db: Session = Depends(get_db)):
    db_camp = db.query(DBCampaign).filter(DBCampaign.id == campaign_id).first()
    if not db_camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db_camp.status = "active"
    db.commit()
    return {"status": "success"}

@router.post("/campaigns/{campaign_id}/pause")
def pause_campaign(campaign_id: str, db: Session = Depends(get_db)):
    db_camp = db.query(DBCampaign).filter(DBCampaign.id == campaign_id).first()
    if not db_camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db_camp.status = "paused"
    db.commit()
    return {"status": "success"}

# --- RUNS ---

@router.get("/campaigns/{campaign_id}/runs", response_model=dict)
def get_campaign_runs(
    campaign_id: str,
    limit: int = 100,
    offset: int = 0,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(DBCampaignRun).filter(DBCampaignRun.campaign_id == campaign_id)
    if status:
        query = query.filter(DBCampaignRun.status == status)
    
    items = query.offset(offset).limit(limit).all()
    return {"items": items}

@router.post("/campaigns/{campaign_id}/enroll")
def enroll_leads(campaign_id: str, payload: dict, db: Session = Depends(get_db)):
    # This would typically involve logic to find leads matching filters
    # For now, we'll return a mock success to let the UI work
    return {"created": 0, "skipped": 0, "message": "Enrollment logic not fully implemented yet."}
