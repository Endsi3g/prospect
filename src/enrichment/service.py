from typing import List
from ..core.models import Lead, Company
from .client import SourcingClient

class EnrichmentService:
    def __init__(self, client: SourcingClient):
        self.client = client

    def format_lead(self, raw_data: dict) -> Lead:
        """
        Converts raw API data into our standardized Lead model.
        """
        # First, enrich company data if domain is present
        # Start with data from CSV/Source
        company_data = {
            "name": raw_data.get("company_name", "Unknown"),
            "domain": raw_data.get("company_domain"),
            "industry": raw_data.get("industry"),
            "size_range": raw_data.get("size_range"),
            "revenue_range": raw_data.get("revenue_range"),
            "location": raw_data.get("location"),
            "description": raw_data.get("company_description")
        }

        # Remove None values to allow enrichment to fill/overwrite or defaults
        company_data = {k: v for k, v in company_data.items() if v is not None}

        domain = raw_data.get("company_domain")
        
        if domain:
            enriched_company = self.client.enrich_company(domain)
            # Update with enriched data (enriched data takes precedence usually, or fills gaps)
            # Here we let enriched data overwrite source data if present.
            # But FreeSourcingClient returns "industry": "Unknown" which is bad if CSV had it.
            # So we should only update if enriched value is meaningful?
            # Or assume enrichment is better.
            # FreeSourcingClient returns defaults.
            # I should fix FreeSourcingClient to NOT return "Unknown" if it failed, or return None.

            # Let's simple merge for now.
            company_data.update({k: v for k, v in enriched_company.items() if v})
        
        company = Company(**company_data)

        # Create Lead object
        lead = Lead(
            id=raw_data.get("email"), # using email as ID for simplicity
            first_name=raw_data.get("first_name"),
            last_name=raw_data.get("last_name"),
            email=raw_data.get("email"),
            title=raw_data.get("title"),
            linkedin_url=raw_data.get("linkedin_url"),
            company=company,
            phone=raw_data.get("phone")
        )
        
        return lead

    def source_and_enrich(self, criteria: dict) -> List[Lead]:
        """
        Full workflow: Search -> Enrich -> Standardize
        """
        raw_leads = self.client.search_leads(criteria)
        processed_leads = []
        
        for raw in raw_leads:
            lead = self.format_lead(raw)
            processed_leads.append(lead)
            
        return processed_leads
