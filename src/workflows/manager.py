import logging
from typing import List, Dict
from ..core.models import Lead, LeadStatus
from ..enrichment.service import EnrichmentService
from ..enrichment.client import SourcingClient
from ..scoring.engine import ScoringEngine
from ..ai_engine.generator import MessageGenerator

logger = logging.getLogger(__name__)

class WorkflowManager:
    def __init__(self, sourcing_client: SourcingClient):
        self.enricher = EnrichmentService(sourcing_client)
        self.scorer = ScoringEngine()
        self.generator = MessageGenerator()
        
        # Configuration
        self.min_score_threshold = 40  # Leads with score > 40 get processed
        
    def process_lead_criteria(self, criteria: Dict) -> List[Lead]:
        logger.info(f"[Workflow] Starting process for criteria: {criteria}")
        
        # 1. Sourcing & Enrichment
        leads = self.enricher.source_and_enrich(criteria)
        logger.info(f"[Workflow] Sourced {len(leads)} leads.")
        
        processed_leads = []
        for lead in leads:
            logger.debug(f"  > Processing {lead.email}...")
            
            # 2. Scoring
            lead = self.scorer.score_lead(lead)
            
            # 3. Decision Logic
            if lead.score.total_score >= self.min_score_threshold:
                lead.status = LeadStatus.SCORED
                logger.info(f"    - Qualified! Score: {lead.score.total_score}")
                
                # 4. Generate Outreach
                email_content = self.generator.generate_cold_email(lead)
                logger.info(f"    - Generated Cold Email draft.")
                
                # In a real system, we would add to queue here
                lead.details = {"draft_email": email_content}
                lead.status = LeadStatus.CONTACTED # Simulating immediate action
                
            else:
                logger.info(f"    - Disqualified. Score: {lead.score.total_score} < {self.min_score_threshold}")
                lead.status = LeadStatus.DQ
                
            processed_leads.append(lead)
            
        return processed_leads
