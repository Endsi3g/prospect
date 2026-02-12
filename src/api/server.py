from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import uuid

# Add project root to path
import sys
import os
# Ensure we can import from src
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(root_dir)

from src.core.database import SessionLocal, engine, Base
from src.core.db_models import DBLead, DBTask, DBProject, DBCompany
from src.core.models import Lead, Task, TaskStatus, TaskPriority, Project, ProjectStatus
from datetime import datetime

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Prospect Sales Machine API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    # Allow local dev and production domains
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"status": "Sales Machine Online", "time": datetime.now()}

@app.get("/api/v1/admin/leads", response_model=List[Lead])
def get_leads(db: Session = Depends(get_db)):
    return db.query(DBLead).all()

@app.get("/api/v1/admin/tasks", response_model=List[Task])
def get_tasks(db: Session = Depends(get_db)):
    return db.query(DBTask).all()

@app.post("/api/v1/admin/leads", response_model=Lead)
def create_lead(lead: Lead, db: Session = Depends(get_db)):
    # Simple manual lead creation
    # Check if company exists or create it
    company_name = lead.company.name
    db_company = db.query(DBCompany).filter(DBCompany.name == company_name).first()
    if not db_company:
        db_company = DBCompany(
            name=company_name,
            domain=lead.company.domain,
            industry=lead.company.industry
        )
        db.add(db_company)
        db.commit()
        db.refresh(db_company)
    
    db_lead = DBLead(
        id=lead.email,
        first_name=lead.first_name,
        last_name=lead.last_name,
        email=lead.email,
        phone=lead.phone,
        company_id=db_company.id,
        status=lead.status,
        segment=lead.segment or "Manual"
    )
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    return db_lead

@app.get("/api/v1/admin/leads/{lead_id}", response_model=Lead)
def get_lead(lead_id: str, db: Session = Depends(get_db)):
    # Try different ID lookups: by email (PK) or potentially generated ID if we had one
    # The models define id=email, so lead_id should be the email.
    
    lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not lead:
        # Fallback: try to find by ID if it was uuid (though currently model says id=email)
        # Or maybe the partial email?
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@app.patch("/api/v1/admin/leads/{lead_id}", response_model=Lead)
def update_lead(lead_id: str, lead_update: dict, db: Session = Depends(get_db)):
    # Partial update
    db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not db_lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Update fields provided in the dict
    for key, value in lead_update.items():
        if hasattr(db_lead, key):
            setattr(db_lead, key, value)
    
    # Special handling for company update if nested?
    # For now assume flat updates or specific logic if needed. 
    # If 'company' is passed, it might be a dict. 
    # But for PATCH, usually we expect flat fields or we strictly parse.
    
    db.commit()
    db.refresh(db_lead)
    return db_lead

@app.get("/api/v1/admin/leads/{lead_id}/tasks", response_model=List[Task])
def get_lead_tasks(lead_id: str, db: Session = Depends(get_db)):
    # Tasks where lead_id matches
    return db.query(DBTask).filter(DBTask.lead_id == lead_id).all()

@app.get("/api/v1/admin/leads/{lead_id}/projects", response_model=List[Project])
def get_lead_projects(lead_id: str, db: Session = Depends(get_db)):
    return db.query(DBProject).filter(DBProject.lead_id == lead_id).all()


@app.get("/api/v1/admin/projects", response_model=List[Project])
def get_projects(db: Session = Depends(get_db)):
    return db.query(DBProject).all()

@app.post("/api/v1/admin/projects", response_model=Project)
def create_project(project: Project, db: Session = Depends(get_db)):
    project_id = project.id or str(uuid.uuid4())
    db_project = DBProject(
        id=project_id,
        name=project.name,
        description=project.description,
        status=project.status,
        lead_id=project.lead_id,
        due_date=project.due_date
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@app.get("/api/v1/admin/analytics")
def get_analytics(db: Session = Depends(get_db)):
    # Aggregate data for analytics page
    total_leads = db.query(DBLead).count()
    leads_by_status = {}
    for status in ["NEW", "SCORED", "CONTACTED", "INTERESTED", "CONVERTED"]:
        leads_by_status[status] = db.query(DBLead).filter(DBLead.status == status).count()
    
    total_tasks = db.query(DBTask).count()
    done_tasks = db.query(DBTask).filter(DBTask.status == "Done").count()
    
    new_leads_today = db.query(DBLead).filter(
        DBLead.created_at >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    ).count()
    
    return {
        "leads_by_status": leads_by_status,
        "total_leads": total_leads,
        "task_completion_rate": (done_tasks / total_tasks * 100) if total_tasks > 0 else 0,
        "pipeline_value": db.query(DBLead).filter(DBLead.status == "INTERESTED").count() * 1000,
        "new_leads_today": new_leads_today
    }

@app.get("/api/v1/admin/stats")
def get_stats(db: Session = Depends(get_db)):
    total_leads = db.query(DBLead).count()
    # Assuming 'Interested' is a status or high score. For now, let's use a placeholder logic or a specific status if available.
    # Let's count leads with "Hot" or "Warm" status if mapped, or just total for now. 
    # Actually, looking at models.py, Lead has 'status'. Let's count 'New' vs others if possible, or just total.
    # Let's return a simple breakdown.
    
    new_leads_today = db.query(DBLead).filter(DBLead.created_at >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)).count()
    
    # Simple logic: 'converted' or 'interested' might be tracked by status. 
    # Let's assume 'Interested' means score > 70 for this MVP.
    # But for now, let's just return raw counts of tasks and leads.
    pending_tasks = db.query(DBTask).filter(DBTask.status != "Done").count()
    
    return {
        "total_leads": total_leads,
        "new_leads_today": new_leads_today,
        "pending_tasks": pending_tasks,
        "conversion_rate": 0.0 # Placeholder
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
