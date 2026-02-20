from .prompts import COLD_EMAIL_TEMPLATE, LINKEDIN_CONNECTION_TEMPLATE, LINKEDIN_MESSAGE_TEMPLATE
from ..core.models import Lead
from openai import OpenAI
import os
import json
from typing import Dict

class MessageGenerator:
    """AI content generator with cascading provider fallback.

    Resolution order (first available wins):
    1. Explicit ``LLM_PROVIDER`` env var (``openai``, ``groq``, ``ollama``)
    2. Auto-detect: OpenAI key → Groq key → local Ollama → templates only
    """

    def __init__(self):
        from ..admin.secrets_manager import secrets_manager

        explicit_provider = os.getenv("LLM_PROVIDER", "").lower().strip()
        self.client = None
        self.provider = "none"
        self.model_name = os.getenv("LLM_MODEL", "")

        # --- Explicit provider ------------------------------------------------
        if explicit_provider == "openai":
            api_key = secrets_manager.resolve_secret(None, "OPENAI_API_KEY")
            if api_key:
                self.client = OpenAI(api_key=api_key)
                self.provider = "openai"
                self.model_name = self.model_name or "gpt-4o-mini"
            # If key missing, fall through to auto-detect below

        elif explicit_provider == "groq":
            api_key = secrets_manager.resolve_secret(None, "GROQ_API_KEY") or os.getenv("GROQ_API_KEY", "")
            if api_key:
                self.client = OpenAI(
                    base_url="https://api.groq.com/openai/v1",
                    api_key=api_key,
                )
                self.provider = "groq"
                self.model_name = self.model_name or "llama-3.3-70b-versatile"

        elif explicit_provider == "ollama":
            base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            self.client = OpenAI(base_url=base_url, api_key="ollama")
            self.provider = "ollama"
            self.model_name = self.model_name or "llama3.1:8b-instruct"

        # --- Auto-detect (no explicit provider or explicit failed) -------------
        if self.client is None:
            # Try OpenAI
            openai_key = secrets_manager.resolve_secret(None, "OPENAI_API_KEY")
            if openai_key:
                self.client = OpenAI(api_key=openai_key)
                self.provider = "openai"
                self.model_name = self.model_name or "gpt-4o-mini"

        if self.client is None:
            # Try Groq
            groq_key = secrets_manager.resolve_secret(None, "GROQ_API_KEY") or os.getenv("GROQ_API_KEY", "")
            if groq_key:
                self.client = OpenAI(
                    base_url="https://api.groq.com/openai/v1",
                    api_key=groq_key,
                )
                self.provider = "groq"
                self.model_name = self.model_name or "llama-3.3-70b-versatile"

        if self.client is None:
            # Try local Ollama (check if accessible)
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            try:
                import httpx
                resp = httpx.get(ollama_url.replace("/v1", ""), timeout=2.0)
                if resp.status_code == 200:
                    self.client = OpenAI(base_url=ollama_url, api_key="ollama")
                    self.provider = "ollama"
                    self.model_name = self.model_name or "llama3.1:8b-instruct"
            except Exception:
                pass  # Ollama not running

        # Log result
        if self.client:
            print(f"AI Engine initialized: provider={self.provider}, model={self.model_name}")
        else:
            print("Warning: No AI provider available. Using template fallbacks only.")

    def generate_gpt_content(self, prompt: str) -> str:
        if not self.client:
            return None
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"AI Generation Error ({self.provider}): {e}")
            return None

    def generate_personalized_hook(self, lead: Lead) -> str:
        if not self.client:
            return f"Bonjour {lead.first_name}, j'ai vu votre travail chez {lead.company.name}."
            
        prompt = f"""
        Génère une phrase d'accroche ultra-personnalisée pour un email de prospection B2B.
        Cible : {lead.first_name} {lead.last_name}, {lead.title} chez {lead.company.name}.
        Contexte Entreprise : {lead.company.description or 'Secteur ' + (lead.company.industry or 'N/A')}
        
        Contraintes :
        - 1 seule phrase courte (max 15 mots).
        - Ton : Direct, pas de bla-bla commercial.
        - Langue : Français.
        - Angle : "J'ai remarqué votre [élément spécifique lié à leur activité]..." ou "En tant que [Titre], j'imagine que [défi spécifique]..."
        - Pas de salutations (juste l'accroche).
        """
        content = self.generate_gpt_content(prompt)
        return content or f"Bonjour {lead.first_name}, j'ai vu votre travail chez {lead.company.name}."

    def generate_cold_email(self, lead: Lead) -> str:
        # Determine clinic-specific pain points
        is_clinic = lead.segment and "Clinic" in lead.segment
        
        pain_point_area = "gestion administrative"
        pain_point = "la saisie manuelle des données patients"
        
        if is_clinic:
            pain_point_area = "suivi patient"
            pain_point = "le temps passé sur la paperasse plutôt qu'avec les patients"
        elif "sales" in (lead.title or "").lower():
            pain_point_area = "vitesse du pipeline"
            pain_point = "le temps de qualification des leads"

        # Try AI generation first
        if self.client:
            prompt = f"""
            Rédige un email de prospection personnalisé à {lead.first_name} {lead.last_name}, {lead.title} chez {lead.company.name}.
            
            Contexte :
            - Industrie : {lead.company.industry or 'N/A'}
            - Description entreprise : {lead.company.description or 'N/A'}
            - Segment : {lead.segment or 'N/A'}
            - Pain Point : {pain_point or 'N/A'}
            - Valeur : Automatisation des tâches répétitives pour libérer du temps.
            
            Contrainte : 
            - CTA UNIQUE : "OK pour un appel de 15 min ?"
            - Ton : Professionnel, direct, empathique.
            - Langue : Français.
            - Moins de 100 mots.
            """
            content = self.generate_gpt_content(prompt)
            if content:
                return content

        # Fallback to template
        from .prompts import COLD_EMAIL_TEMPLATE
        content = COLD_EMAIL_TEMPLATE.format(
            first_name=lead.first_name,
            company_name=lead.company.name,
            pain_point_area=pain_point_area,
            pain_point=pain_point
        )
        return content

    def generate_sequence_email(self, lead: Lead, step: int = 2) -> str:
        if step == 1:
            return self.generate_cold_email(lead)
            
        # For now, we only have step 2 follow-up
        is_clinic = lead.segment and "Clinic" in lead.segment
        pain_point_area = "optimisation des processus"
        if is_clinic:
            pain_point_area = "gestion du temps médical"

        if self.client:
            prompt = f"""
            Rédige un email de FOLLOW-UP (Etape {step}) à {lead.first_name} chez {lead.company.name}.
            Relance suite à un message précédent sur l'automatisation de {pain_point_area}.
            
            Contrainte : 
            - CTA UNIQUE : "OK pour un appel de 15 min ?"
            - Langue : Français.
            - Très court (3-4 phrases).
            """
            content = self.generate_gpt_content(prompt)
            if content:
                return content
                
        from .prompts import FOLLOW_UP_TEMPLATE
        return FOLLOW_UP_TEMPLATE.format(
            first_name=lead.first_name,
            company_name=lead.company.name,
            pain_point_area=pain_point_area
        )

    def generate_linkedin_connect(self, lead: Lead) -> str:
        # Try AI generation first
        if self.client:
            prompt = f"""
            Write a LinkedIn connection request message (max 300 chars) for {lead.first_name} {lead.last_name}, {lead.title or 'Leader'} at {lead.company.name or 'their company'}.
            Mention shared interest in {lead.company.industry or 'tech'}.
            """
            content = self.generate_gpt_content(prompt)
            if content:
                return content

        content = LINKEDIN_CONNECTION_TEMPLATE.format(
            first_name=lead.first_name,
            company_name=lead.company.name,
            industry=lead.company.industry or "Tech",
            job_title=lead.title or "Leader"
        )
        return content

    def generate_landing_page_copy(self, business_type: str, target_audience: str) -> Dict[str, str]:
        if not self.client:
            return {
                "hero_title": f"Solution IA pour {business_type}",
                "hero_subtitle": f"Optimisez votre gestion et gagnez du temps pour vos clients {target_audience}.",
                "cta_text": "Réserver un appel",
                "problem_statement": "Les tâches administratives répétitives freinent votre croissance.",
                "solution_statement": "Notre IA automatise votre workflow pour vous concentrer sur l'essentiel."
            }
            
        prompt = f"""
        Génère du contenu pour une landing page de vente B2B.
        Type de business : {business_type}
        Cible : {target_audience}
        Produit : Solution d'automatisation par Intelligence Artificielle (automatisation administrative, rappels, facturation, qualification de leads).
        
        Retourne UNIQUEMENT un objet JSON avec ces clés :
        - hero_title : Une accroche percutante axée sur le bénéfice (max 10 mots).
        - hero_subtitle : Une explication courte de la valeur ajoutée (max 20 mots).
        - cta_text : Texte du bouton d'action.
        - problem_statement : Description du problème résolu.
        - solution_statement : Description de comment l'IA aide.
        
        Langue : Français.
        """
        
        try:
            kwargs = {"model": self.model_name, "messages": [{"role": "user", "content": prompt}]}
            # Only use json_object format for providers that support it
            if self.provider in ("openai", "groq"):
                kwargs["response_format"] = {"type": "json_object"}
            response = self.client.chat.completions.create(**kwargs)
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"Landing Page Generation Error: {e}")
            return {
                "hero_title": f"Solution IA pour {business_type}",
                "hero_subtitle": f"Optimisez votre gestion et gagnez du temps pour vos clients {target_audience}.",
                "cta_text": "Réserver un appel"
            }
