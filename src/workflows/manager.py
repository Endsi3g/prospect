from typing import List, Dict, Optional
from ..core.models import Lead, LeadStatus
from ..enrichment.service import EnrichmentService
from ..enrichment.client import SourcingClient
from ..scoring.engine import ScoringEngine
from ..ai_engine.generator import MessageGenerator
from ..ai_engine.provider import LLMProvider

class WorkflowManager:
    def __init__(self, sourcing_client: SourcingClient, llm_provider: Optional[LLMProvider] = None):
        self.enricher = EnrichmentService(sourcing_client)
        self.scorer = ScoringEngine()
        self.generator = MessageGenerator(provider=llm_provider)
        
        # Configuration
        self.min_score_threshold = 40  # Leads with score > 40 get processed
        
    def process_lead_criteria(self, criteria: Dict) -> List[Lead]:
        print(f"[Workflow] Starting process for criteria: {criteria}")
        
        # 1. Sourcing & Enrichment
        leads = self.enricher.source_and_enrich(criteria)
        print(f"[Workflow] Sourced {len(leads)} leads.")
        
        processed_leads = []
        for lead in leads:
            print(f"  > Processing {lead.email}...")
            
            # 2. Scoring
            lead = self.scorer.score_lead(lead)
            
            # 3. Decision Logic
            if lead.score.total_score >= self.min_score_threshold:
                lead.status = LeadStatus.SCORED
                print(f"    - Qualified! Score: {lead.score.total_score}")
                
                # 4. Generate Outreach
                email_content = self.generator.generate_cold_email(lead)
                print(f"    - Generated Cold Email draft.")
                
                # In a real system, we would add to queue here
                lead.details = {"draft_email": email_content}
                lead.status = LeadStatus.CONTACTED # Simulating immediate action
                
            else:
                print(f"    - Disqualified. Score: {lead.score.total_score} < {self.min_score_threshold}")
                lead.status = LeadStatus.DQ
                
            processed_leads.append(lead)
            
        return processed_leads
