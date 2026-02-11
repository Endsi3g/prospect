from .prompts import COLD_EMAIL_TEMPLATE, LINKEDIN_CONNECTION_TEMPLATE
from ..core.models import Lead

class MessageGenerator:
    def __init__(self):
        pass

    def generate_cold_email(self, lead: Lead) -> str:
        # In a real scenario, we would call OpenAI here to dynamically fill or rewrite
        # For now, we allow simple f-string format or use a "smart" fill
        
        # Determine pain point area based on title/industry
        pain_point_area = "developer productivity"
        pain_point = "managing technical debt"
        if "sales" in (lead.title or "").lower():
             pain_point_area = "pipeline velocity"
             pain_point = "lead qualification time"
             
        # Mock "AI" generation by filling the template intelligently
        content = COLD_EMAIL_TEMPLATE.format(
            first_name=lead.first_name,
            company_name=lead.company.name,
            pain_point_area=pain_point_area,
            company_focus=lead.company.description or "growth",
            job_title=lead.title or "leader",
            pain_point=pain_point,
            related_competitor="Industry Leaders",
            value_proposition="automating the busywork"
        )
        return content

    def generate_linkedin_connect(self, lead: Lead) -> str:
        content = LINKEDIN_CONNECTION_TEMPLATE.format(
            first_name=lead.first_name,
            company_name=lead.company.name,
            industry=lead.company.industry or "Tech",
            job_title=lead.title or "Leader"
        )
        return content
