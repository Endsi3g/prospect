from .prompts import COLD_EMAIL_TEMPLATE, LINKEDIN_CONNECTION_TEMPLATE
from ..core.models import Lead
from .provider import LLMProvider, MockProvider

class MessageGenerator:
    def __init__(self, provider: LLMProvider = None):
        self.provider = provider or MockProvider()

    def generate_cold_email(self, lead: Lead) -> str:
        # Use the template to structure the prompt if possible, or just build a prompt.
        # Here we build a direct prompt for the LLM.
        
        pain_point_area = "developer productivity"
        if "sales" in (lead.title or "").lower():
             pain_point_area = "pipeline velocity"

        prompt = f"""
        You are an expert SDR. Write a cold email to:
        Name: {lead.first_name}
        Title: {lead.title}
        Company: {lead.company.name}
        Company Description: {lead.company.description}
        Industry: {lead.company.industry}

        Context:
        Their likely pain point is {pain_point_area}.
        Our solution helps automate prospecting with open source tools.

        Instructions:
        - Keep it under 150 words.
        - Be personalized and relevant.
        - End with a call to action.
        """

        return self.provider.generate(prompt)

    def generate_linkedin_connect(self, lead: Lead) -> str:
        prompt = f"""
        Write a LinkedIn connection request (max 300 chars) for:
        Name: {lead.first_name}
        Title: {lead.title}
        Company: {lead.company.name}

        Mention I'm expanding my network in {lead.company.industry}.
        """
        return self.provider.generate(prompt)
