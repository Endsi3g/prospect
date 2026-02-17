import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import argparse

from dotenv import load_dotenv
from sqlalchemy.exc import SQLAlchemyError

from src.core.database import Base, SessionLocal, engine
from src.core.db_migrations import ensure_sqlite_schema_compatibility
from src.core.db_models import DBCompany, DBInteraction, DBLead
from src.core.logging import configure_logging, get_logger
from src.core.models import Lead
from src.enrichment.apify_client import ApifyMapsClient
from src.enrichment.client import ApolloClient, MockApolloClient
from src.intent.factory import create_intent_client
from src.workflows.manager import WorkflowManager


logger = get_logger(__name__)

# Load environment variables
load_dotenv()

def init_db():
    logger.info("Initializing database.")
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema_compatibility(engine)

def save_lead_to_db(lead: Lead, session):
    # Check if company exists (prefer domain match when available).
    db_company = None
    if lead.company.domain:
        db_company = session.query(DBCompany).filter(DBCompany.domain == lead.company.domain).first()
    if not db_company:
        db_company = session.query(DBCompany).filter(DBCompany.name == lead.company.name).first()

    if not db_company:
        db_company = DBCompany(
            name=lead.company.name,
            domain=lead.company.domain,
            industry=lead.company.industry,
            size_range=lead.company.size_range,
            revenue_range=lead.company.revenue_range,
            tech_stack=lead.company.tech_stack,
            description=lead.company.description,
            linkedin_url=str(lead.company.linkedin_url) if lead.company.linkedin_url else None,
            location=lead.company.location
        )
        session.add(db_company)
        session.flush()
    else:
        # Avoid overwriting fields with None if the lead object has missing data
        if lead.company.name: db_company.name = lead.company.name
        if lead.company.domain: db_company.domain = lead.company.domain
        if lead.company.industry: db_company.industry = lead.company.industry
        if lead.company.size_range: db_company.size_range = lead.company.size_range
        if lead.company.revenue_range: db_company.revenue_range = lead.company.revenue_range
        if lead.company.tech_stack: db_company.tech_stack = lead.company.tech_stack
        if lead.company.description: db_company.description = lead.company.description
        if lead.company.linkedin_url: db_company.linkedin_url = str(lead.company.linkedin_url)
        if lead.company.location: db_company.location = lead.company.location

    db_lead = session.query(DBLead).filter(DBLead.email == lead.email).first()
    if not db_lead:
        db_lead = DBLead(
            id=lead.email,
            first_name=lead.first_name,
            last_name=lead.last_name,
            email=lead.email,
            title=lead.title,
            phone=lead.phone,
            linkedin_url=str(lead.linkedin_url) if lead.linkedin_url else None,
            company_id=db_company.id,
            status=lead.status,
            segment=lead.segment,
            stage=lead.stage,
            outcome=lead.outcome,
            demographic_score=lead.score.icp_score,
            behavioral_score=lead.score.heat_score,
            intent_score=lead.score.heat_breakdown.get("intent_level", 0.0),
            icp_score=lead.score.icp_score,
            heat_score=lead.score.heat_score,
            total_score=lead.score.total_score if lead.score else 0.0,
            tier=lead.score.tier if lead.score else "Tier D",
            heat_status=lead.score.heat_status if lead.score else "Cold",
            next_best_action=lead.score.next_best_action if lead.score else None,
            score_breakdown={
                "icp": lead.score.icp_breakdown,
                "heat": lead.score.heat_breakdown,
            },
            icp_breakdown=lead.score.icp_breakdown,
            heat_breakdown=lead.score.heat_breakdown,
            last_scored_at=lead.score.last_scored_at,
            tags=lead.tags,
            details=lead.details,
        )
        session.add(db_lead)
    else:
        db_lead.first_name = lead.first_name
        db_lead.last_name = lead.last_name
        db_lead.title = lead.title
        db_lead.phone = lead.phone
        db_lead.linkedin_url = str(lead.linkedin_url) if lead.linkedin_url else None
        db_lead.company_id = db_company.id
        db_lead.status = lead.status
        db_lead.segment = lead.segment
        db_lead.stage = lead.stage
        db_lead.outcome = lead.outcome
        db_lead.demographic_score = lead.score.icp_score
        db_lead.behavioral_score = lead.score.heat_score
        db_lead.intent_score = lead.score.heat_breakdown.get("intent_level", 0.0)
        db_lead.icp_score = lead.score.icp_score
        db_lead.heat_score = lead.score.heat_score
        db_lead.total_score = lead.score.total_score if lead.score else 0.0
        db_lead.tier = lead.score.tier if lead.score else "Tier D"
        db_lead.heat_status = lead.score.heat_status if lead.score else "Cold"
        db_lead.next_best_action = lead.score.next_best_action if lead.score else None
        db_lead.score_breakdown = {
            "icp": lead.score.icp_breakdown,
            "heat": lead.score.heat_breakdown,
        }
        db_lead.icp_breakdown = lead.score.icp_breakdown
        db_lead.heat_breakdown = lead.score.heat_breakdown
        db_lead.last_scored_at = lead.score.last_scored_at
        db_lead.tags = lead.tags
        db_lead.details = lead.details

    existing_interactions = {
        (
            interaction.type.value if hasattr(interaction.type, "value") else str(interaction.type),
            interaction.timestamp,
        )
        for interaction in db_lead.interactions
    }
    for interaction in lead.interactions:
        interaction_type = interaction.type.value if hasattr(interaction.type, "value") else str(interaction.type)
        key = (interaction_type, interaction.timestamp)
        if key in existing_interactions:
            continue
        db_lead.interactions.append(
            DBInteraction(
                type=interaction_type,
                timestamp=interaction.timestamp,
                details=interaction.details,
            )
        )
    
    session.commit()

def main():
    configure_logging()
    parser = argparse.ArgumentParser(description="Automated Prospecting System")
    parser.add_argument("--source", choices=["apollo", "apify", "mock"], default="mock", help="Data source to use")
    parser.add_argument("--industry", help="Target industry")
    parser.add_argument("--role", help="Target role (e.g. 'CTO')")
    parser.add_argument("--location", help="Target location")
    parser.add_argument("--query", help="Generic search query (for Apify mainly)")
    parser.add_argument("--limit", type=int, default=10, help="Max results to fetch")
    parser.add_argument(
        "--intent-provider",
        choices=["mock", "bombora", "6sense", "none"],
        default=None,
        help="Intent provider override (defaults to INTENT_PROVIDER env var).",
    )
    
    args = parser.parse_args()

    logger.info("Automated prospecting run started.")
    
    init_db()
    db_session = SessionLocal()

    from src.admin.secrets_manager import secrets_manager
    client = None
    
    if args.source == "apollo":
        apollo_key = secrets_manager.resolve_secret(db_session, "APOLLO_API_KEY")
        if apollo_key and apollo_key != "your_apollo_api_key_here":
            logger.info("Using Apollo data source.")
            client = ApolloClient(api_key=apollo_key)
        else:
            logger.warning("Invalid APOLLO_API_KEY. Falling back to mock source.")
            client = MockApolloClient()
            
    elif args.source == "apify":
        apify_token = secrets_manager.resolve_secret(db_session, "APIFY_API_TOKEN")
        if apify_token and apify_token != "your_apify_api_token_here":
            logger.info("Using Apify data source.")
            client = ApifyMapsClient(api_token=apify_token)
        else:
            logger.warning("Invalid APIFY_API_TOKEN. Falling back to mock source.")
            client = MockApolloClient()
             
    else:
        logger.warning("Using mock Apollo client (default).")
        client = MockApolloClient()

    intent_client = create_intent_client(provider=args.intent_provider)
    if intent_client is None:
        logger.warning("Intent provider disabled.")
    else:
        logger.info("Intent provider selected.", extra={"provider": intent_client.provider_name})
        
    workflow = WorkflowManager(client, intent_client=intent_client)
    
    target_criteria = {}
    if args.industry:
        target_criteria["industry"] = args.industry
    if args.role:
        target_criteria["role"] = args.role
    if args.location:
        target_criteria["location"] = args.location
    if args.query:
        target_criteria["query"] = args.query
    target_criteria["limit"] = args.limit
    
    if args.source == "mock" and not any([args.industry, args.role, args.location, args.query]):
        target_criteria = {
            "industry": "Software",
            "role": "CTO",
            "location": "US",
            "company_domains": ["techcorp.com", "healthplus.com"],
            "limit": args.limit,
        }
    
    logger.info("Running workflow.", extra={"criteria": target_criteria})
    results = workflow.process_lead_criteria(target_criteria)
    
    saved_count = 0
    for lead in results:
        logger.info(
            "Lead processed.",
            extra={
                "lead_id": lead.id,
                "lead_name": f"{lead.first_name} {lead.last_name}".strip(),
                "company_name": lead.company.name,
                "status": str(lead.status),
                "score": round(lead.score.total_score, 2) if lead.score else 0.0,
            },
        )

        if lead.email:
            try:
                save_lead_to_db(lead, db_session)
                saved_count += 1
            except SQLAlchemyError as exc:
                logger.exception(
                    "Failed to save lead to database.",
                    extra={"lead_email": lead.email, "error": str(exc)},
                )
                db_session.rollback()
        else:
            logger.warning("Skipping lead save due to missing email.", extra={"lead_id": lead.id})

    logger.info("Run completed.", extra={"saved_leads": saved_count})
    db_session.close()

if __name__ == "__main__":
    main()
