from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc, extract
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
from src.core.db_models import DBLead, DBTask, DBProject, DBCompany, DBLandingPage, DBAppointment, DBWorkflowRule, DBOpportunity, DBAccountProfile
from src.core.models import Lead, Task, TaskStatus, TaskPriority, Project, ProjectStatus, LandingPage, Appointment, WorkflowRule, LeadStatus, AccountProfile
from datetime import datetime
from src.ai_engine.generator import MessageGenerator
from src.scoring.engine import ScoringEngine
from src.enrichment.service import EnrichmentService
from src.enrichment.apify_client import ApifyMapsClient, MockApifyMapsClient
from src.workflows.manager import WorkflowManager
from src.workflows.rules_engine import RulesEngine

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

class DataSourceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["x-prospect-data-source"] = "upstream"
        return response

app = FastAPI(title="Prospect Sales Machine API")
app.add_middleware(DataSourceMiddleware)

# Include Routers
from src.api.routers import library, campaigns, rag
app.include_router(library.router)
app.include_router(campaigns.router)
app.include_router(rag.router)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize engines
generator = MessageGenerator()
scoring_engine = ScoringEngine()

# Sourcing client selection (Real vs Mock)
apify_token = os.getenv("APIFY_API_TOKEN")
if apify_token and apify_token != "your_apify_token_here":
    sourcing_client = ApifyMapsClient(apify_token)
else:
    print("Warning: APIFY_API_TOKEN not found. Using MockApifyMapsClient.")
    sourcing_client = MockApifyMapsClient()

enrichment_service = EnrichmentService(client=sourcing_client)
workflow_manager = WorkflowManager(sourcing_client=sourcing_client)

# ... (CORS and get_db remain same)

# --- LANDING PAGE BUILDER ---

@app.get("/api/v1/builder/pages", response_model=List[LandingPage])
def get_landing_pages(db: Session = Depends(get_db)):
    return db.query(DBLandingPage).all()

@app.post("/api/v1/builder/pages", response_model=LandingPage)
def create_landing_page(page: LandingPage, db: Session = Depends(get_db)):
    db_page = DBLandingPage(
        id=page.id,
        name=page.name,
        slug=page.slug,
        title=page.title,
        description=page.description,
        content_json=page.content,
        theme_json=page.theme,
        is_published=page.is_published
    )
    db.add(db_page)
    db.commit()
    db.refresh(db_page)
    return db_page

@app.get("/api/v1/builder/pages/{page_id}", response_model=LandingPage)
def get_landing_page(page_id: str, db: Session = Depends(get_db)):
    page = db.query(DBLandingPage).filter(DBLandingPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return LandingPage(
        id=page.id,
        name=page.name,
        slug=page.slug,
        title=page.title,
        description=page.description,
        content=page.content_json,
        theme=page.theme_json,
        is_published=page.is_published,
        created_at=page.created_at,
        updated_at=page.updated_at
    )

@app.patch("/api/v1/builder/pages/{page_id}", response_model=LandingPage)
def update_landing_page(page_id: str, page_update: dict, db: Session = Depends(get_db)):
    db_page = db.query(DBLandingPage).filter(DBLandingPage.id == page_id).first()
    if not db_page:
        raise HTTPException(status_code=404, detail="Page not found")
    
    for key, value in page_update.items():
        if key == "content":
            db_page.content_json = value
        elif key == "theme":
            db_page.theme_json = value
        elif hasattr(db_page, key):
            setattr(db_page, key, value)
    
    db.commit()
    db.refresh(db_page)
    return db_page

@app.get("/api/v1/public/pages/{slug}", response_model=LandingPage)
def get_public_landing_page(slug: str, db: Session = Depends(get_db)):
    page = db.query(DBLandingPage).filter(DBLandingPage.slug == slug, DBLandingPage.is_published == True).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found or not published")
    return LandingPage(
        id=page.id,
        name=page.name,
        slug=page.slug,
        title=page.title,
        description=page.description,
        content=page.content_json,
        theme=page.theme_json,
        is_published=page.is_published,
        created_at=page.created_at,
        updated_at=page.updated_at
    )

@app.post("/api/v1/builder/generate")
def generate_builder_content(config: dict):
    business_type = config.get("business_type", "Clinique")
    target_audience = config.get("target_audience", "Patients")
    content = generator.generate_landing_page_copy(business_type, target_audience)
    # Ensure it's a dict and has expected keys
    if not isinstance(content, dict):
        return {
            "hero_title": f"Solution IA pour {business_type}",
            "hero_subtitle": f"Optimisez votre gestion et gagnez du temps pour vos clients {target_audience}.",
            "cta_text": "Réserver un appel",
            "problem_statement": "Les tâches administratives répétitives freinent votre croissance.",
            "solution_statement": "Notre IA automatise votre workflow."
        }
    return content

# --- WORKFLOW UTILITIES ---

def execute_workflow_action(lead: DBLead, rule: DBWorkflowRule, db: Session):
    config = rule.action_config_json
    if rule.action_type == "create_task":
        db_task = DBTask(
            id=str(uuid.uuid4()),
            title=config.get("title", f"Workflow: {rule.name}"),
            description=config.get("description", ""),
            status="To Do",
            priority=config.get("priority", "Medium"),
            lead_id=lead.id,
            assigned_to="You"
        )
        db.add(db_task)
        db.commit()
    elif rule.action_type == "change_stage":
        lead.stage_canonical = config.get("stage", "qualified")
        db.commit()

def trigger_workflow(lead: DBLead, trigger_type: str, db: Session):
    rules = db.query(DBWorkflowRule).filter(
        DBWorkflowRule.trigger_type == trigger_type,
        DBWorkflowRule.is_active == True
    ).all()
    
    for rule in rules:
        criteria = rule.criteria_json
        match = True
        
        if trigger_type == "lead_scored":
            if "min_score" in criteria and lead.total_score < criteria["min_score"]:
                match = False
            if "tier" in criteria and lead.tier != criteria["tier"]:
                match = False
                
        if match:
            execute_workflow_action(lead, rule, db)


# --- LEAD CAPTURE ---

@app.post("/api/v1/capture/lead")
def capture_lead(payload: dict, db: Session = Depends(get_db)):
    # This is called by the landing pages
    email = payload.get("email")
    company_name = payload.get("company_name", "Inconnue")
    source = payload.get("source", "landing_page")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email requis")
        
    # 1. Create/Get Company
    db_company = db.query(DBCompany).filter(DBCompany.name == company_name).first()
    if not db_company:
        db_company = DBCompany(name=company_name)
        db.add(db_company)
        db.commit()
        db.refresh(db_company)
        
    # 2. Create Lead (Raw)
    db_lead = db.query(DBLead).filter(DBLead.id == email).first()
    if not db_lead:
        db_lead = DBLead(
            id=email,
            email=email,
            company_id=db_company.id,
            status="NEW",
            source=source
        )
        db.add(db_lead)
        db.commit()
        db.refresh(db_lead)
    
    # 3. Process through Workflow
    # We create a Lead model for the manager
    lead_model = Lead.from_orm(db_lead)
    
    # Enrichment
    try:
        if lead_model.company.domain:
            enriched_company = sourcing_client.enrich_company(lead_model.company.domain)
            lead_model.company.industry = enriched_company.get("industry")
            lead_model.company.description = enriched_company.get("description")
    except:
        pass

    # Score & Action (Decision Logic)
    scored_lead = scoring_engine.score_lead(lead_model)
    
    # Generate hook/email
    scored_lead.personalized_hook = generator.generate_personalized_hook(scored_lead)
    scored_lead.details["draft_email"] = generator.generate_cold_email(scored_lead)

    # Update DB
    db_lead.icp_score = scored_lead.score.icp_score
    db_lead.heat_score = scored_lead.score.heat_score
    db_lead.total_score = scored_lead.score.total_score
    db_lead.tier = scored_lead.score.tier
    db_lead.heat_status = scored_lead.score.heat_status
    db_lead.personalized_hook = scored_lead.personalized_hook
    db_lead.details = scored_lead.details
    db_lead.status = "SCORED"
    
    db.commit()
    
    # 4. Trigger Workflows
    trigger_workflow(db_lead, "lead_scored", db)
    
    return {"status": "success", "lead_id": db_lead.id, "tier": db_lead.tier}
    
    
    # Configure CORS for Next.js frontend
    
app.add_middleware(
    CORSMiddleware,
    # Allow local dev and production domains
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    
    # Trigger Workflows
    rules = RulesEngine(db)
    rules.evaluate_and_execute(db_lead, "lead_created")

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

    # Trigger Workflows
    rules = RulesEngine(db)
    rules.evaluate_and_execute(db_lead, "lead_updated")

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


# --- APPOINTMENTS ---

@app.get("/api/v1/admin/appointments", response_model=List[Appointment])
def get_appointments(db: Session = Depends(get_db)):
    return db.query(DBAppointment).all()

@app.post("/api/v1/admin/appointments", response_model=Appointment)
def create_appointment(appointment: Appointment, db: Session = Depends(get_db)):
    appointment_id = appointment.id or str(uuid.uuid4())
    db_appointment = DBAppointment(
        id=appointment_id,
        lead_id=appointment.lead_id,
        title=appointment.title,
        description=appointment.description,
        start_at=appointment.start_at,
        end_at=appointment.end_at,
        status=appointment.status,
        location=appointment.location,
        meeting_link=appointment.meeting_link,
        opportunity_id=appointment.opportunity_id
    )
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    
    # Automate: transition lead to booked
    db_lead = db.query(DBLead).filter(DBLead.id == appointment.lead_id).first()
    if db_lead:
        db_lead.stage_canonical = "booked"
        db.commit()

    return db_appointment

@app.get("/api/v1/admin/leads/{lead_id}/appointments", response_model=List[Appointment])
def get_lead_appointments(lead_id: str, db: Session = Depends(get_db)):
    return db.query(DBAppointment).filter(DBAppointment.lead_id == lead_id).all()

@app.patch("/api/v1/admin/appointments/{appointment_id}", response_model=Appointment)
def update_appointment(appointment_id: str, appointment_update: dict, db: Session = Depends(get_db)):
    db_appointment = db.query(DBAppointment).filter(DBAppointment.id == appointment_id).first()
    if not db_appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    for key, value in appointment_update.items():
        if hasattr(db_appointment, key):
            if key in ["start_at", "end_at"] and isinstance(value, str):
                setattr(db_appointment, key, datetime.fromisoformat(value.replace("Z", "+00:00")))
            else:
                setattr(db_appointment, key, value)
    
    db.commit()
    db.refresh(db_appointment)
    return db_appointment

@app.delete("/api/v1/admin/appointments/{appointment_id}")
def delete_appointment(appointment_id: str, db: Session = Depends(get_db)):
    db_appointment = db.query(DBAppointment).filter(DBAppointment.id == appointment_id).first()
    if not db_appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    db.delete(db_appointment)
    db.commit()
    return {"status": "success"}

@app.post("/api/v1/admin/leads/bulk-status")
def bulk_status_update(payload: dict, db: Session = Depends(get_db)):
    ids = payload.get("ids", [])
    status = payload.get("status")
    if not ids or not status:
        raise HTTPException(status_code=400, detail="Missing ids or status")
    
    db.query(DBLead).filter(DBLead.id.in_(ids)).update({DBLead.status: status}, synchronize_session=False)
    db.commit()
    return {"status": "success"}


# --- WORKFLOWS ---

@app.get("/api/v1/admin/workflows", response_model=List[WorkflowRule])
def get_workflows(db: Session = Depends(get_db)):
    return db.query(DBWorkflowRule).all()

@app.post("/api/v1/admin/workflows", response_model=WorkflowRule)
def create_workflow(workflow: WorkflowRule, db: Session = Depends(get_db)):
    workflow_id = workflow.id or str(uuid.uuid4())
    db_workflow = DBWorkflowRule(
        id=workflow_id,
        name=workflow.name,
        trigger_type=workflow.trigger_type,
        criteria_json=workflow.criteria,
        action_type=workflow.action_type,
        action_config_json=workflow.action_config,
        is_active=workflow.is_active
    )
    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)
    return WorkflowRule(
        id=db_workflow.id,
        name=db_workflow.name,
        trigger_type=db_workflow.trigger_type,
        criteria=db_workflow.criteria_json,
        action_type=db_workflow.action_type,
        action_config=db_workflow.action_config_json,
        is_active=db_workflow.is_active,
        created_at=db_workflow.created_at
    )

@app.patch("/api/v1/admin/workflows/{workflow_id}", response_model=WorkflowRule)
def update_workflow(workflow_id: str, workflow_update: dict, db: Session = Depends(get_db)):
    db_workflow = db.query(DBWorkflowRule).filter(DBWorkflowRule.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    for key, value in workflow_update.items():
        if key == "criteria":
            db_workflow.criteria_json = value
        elif key == "action_config":
            db_workflow.action_config_json = value
        elif hasattr(db_workflow, key):
            setattr(db_workflow, key, value)
    
    db.commit()
    db.refresh(db_workflow)
    
    return WorkflowRule(
        id=db_workflow.id,
        name=db_workflow.name,
        trigger_type=db_workflow.trigger_type,
        criteria=db_workflow.criteria_json,
        action_type=db_workflow.action_type,
        action_config=db_workflow.action_config_json,
        is_active=db_workflow.is_active,
        created_at=db_workflow.created_at
    )

@app.delete("/api/v1/admin/workflows/{workflow_id}")
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    db_workflow = db.query(DBWorkflowRule).filter(DBWorkflowRule.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(db_workflow)
    db.commit()
    return {"status": "success"}


@app.get("/api/v1/admin/analytics")
def get_analytics(db: Session = Depends(get_db)):
    # Aggregate data for analytics page with optimized query
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Single query for leads stats
    leads_stats = db.query(
        func.count(DBLead.id).label("total"),
        func.sum(case((DBLead.status == "NEW", 1), else_=0)).label("new"),
        func.sum(case((DBLead.status == "SCORED", 1), else_=0)).label("scored"),
        func.sum(case((DBLead.status == "CONTACTED", 1), else_=0)).label("contacted"),
        func.sum(case((DBLead.status == "INTERESTED", 1), else_=0)).label("interested"),
        func.sum(case((DBLead.status == "CONVERTED", 1), else_=0)).label("converted"),
        func.sum(case((DBLead.created_at >= today_start, 1), else_=0)).label("new_today")
    ).first()
    
    # Single query for task stats
    tasks_stats = db.query(
        func.count(DBTask.id).label("total"),
        func.sum(case((DBTask.status == "Done", 1), else_=0)).label("done")
    ).first()
    
    leads_by_status = {
        "NEW": leads_stats.new or 0,
        "SCORED": leads_stats.scored or 0,
        "CONTACTED": leads_stats.contacted or 0,
        "INTERESTED": leads_stats.interested or 0,
        "CONVERTED": leads_stats.converted or 0
    }
    
    total_leads = leads_stats.total or 0
    total_tasks = tasks_stats.total or 0
    done_tasks = tasks_stats.done or 0
    
    task_completion_rate = (done_tasks / total_tasks * 100) if total_tasks > 0 else 0
    pipeline_value = (leads_stats.interested or 0) * 1000
    
    return {
        "leads_by_status": leads_by_status,
        "total_leads": total_leads,
        "task_completion_rate": task_completion_rate,
        "pipeline_value": pipeline_value,
        "new_leads_today": leads_stats.new_today or 0
    }

@app.get("/api/v1/admin/stats")
def get_stats(db: Session = Depends(get_db)):
    # Optimized counters for dashboard
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    stats = db.query(
        func.count(DBLead.id).label("total"),
        func.sum(case((DBLead.tier.in_(["Tier A", "Tier B"]), 1), else_=0)).label("qualified"),
        func.sum(case((DBLead.heat_status == "Hot", 1), else_=0)).label("hot"),
        func.sum(case((DBLead.created_at >= today_start, 1), else_=0)).label("new_today"),
        func.sum(case((DBLead.status == "CONTACTED", 1), else_=0)).label("contacted")
    ).first()
    
    pending_tasks = db.query(DBTask).filter(DBTask.status != "Done").count()
    
    total_leads = stats.total or 0
    contacted = stats.contacted or 0
    
    conversion_rate = (contacted / total_leads * 100) if total_leads > 0 else 0.0
    
    return {
        "total_leads": total_leads,
        "new_leads_today": stats.new_today or 0,
        "qualified_leads": stats.qualified or 0,
        "hot_leads": stats.hot or 0,
        "pending_tasks": pending_tasks,
        "conversion_rate": round(conversion_rate, 1)
    }

# --- ACCOUNT & ONBOARDING ---

@app.get("/api/v1/admin/account", response_model=AccountProfile)
def get_account(db: Session = Depends(get_db)):
    profile = db.query(DBAccountProfile).filter(DBAccountProfile.key == "primary").first()
    if not profile:
        # Create a default profile if it doesn't exist
        profile = DBAccountProfile(
            key="primary",
            full_name="Tony Stark",
            email="stark@industrial.com",
            title="Iron Man",
            locale="fr-FR",
            timezone="Europe/Paris",
            preferences_json={"onboarding": "pending"}
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile

@app.put("/api/v1/admin/account", response_model=AccountProfile)
def update_account(profile_update: AccountProfile, db: Session = Depends(get_db)):
    db_profile = db.query(DBAccountProfile).filter(DBAccountProfile.key == "primary").first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Account not found")
    
    db_profile.full_name = profile_update.full_name
    db_profile.email = profile_update.email
    db_profile.title = profile_update.title
    db_profile.locale = profile_update.locale
    db_profile.timezone = profile_update.timezone
    db_profile.preferences_json = profile_update.preferences
    
    db.commit()
    db.refresh(db_profile)
    return db_profile

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
