import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    # Sourcing Settings
    SOURCING_PROVIDER = os.getenv("SOURCING_PROVIDER", "csv").lower() # Options: "apollo", "csv"
    CSV_PATH = os.getenv("CSV_PATH", "leads.csv")

    # AI Settings
    AI_PROVIDER = os.getenv("AI_PROVIDER", "ollama").lower() # Options: "openai", "ollama", "huggingface", "mock"

    # Provider Specifics
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

    HF_MODEL = os.getenv("HF_MODEL", "mistralai/Mistral-7B-Instruct-v0.2")

    @classmethod
    def get_sourcing_client(cls):
        from src.enrichment.client import MockApolloClient
        from src.enrichment.free_extensions import FreeSourcingClient

        if cls.SOURCING_PROVIDER == "apollo":
            print(f"[Config] Using MockApolloClient (Paid Mock)")
            return MockApolloClient()
        elif cls.SOURCING_PROVIDER == "csv":
            print(f"[Config] Using FreeSourcingClient (CSV: {cls.CSV_PATH})")
            return FreeSourcingClient(csv_path=cls.CSV_PATH)
        else:
            print(f"[Config] Unknown provider '{cls.SOURCING_PROVIDER}', defaulting to FreeSourcingClient")
            return FreeSourcingClient(csv_path=cls.CSV_PATH)

    @classmethod
    def get_llm_provider(cls):
        from src.ai_engine.provider import OpenAIProvider, OllamaProvider, HuggingFaceProvider, MockProvider

        if cls.AI_PROVIDER == "openai":
            print(f"[Config] Using OpenAIProvider")
            return OpenAIProvider(api_key=cls.OPENAI_API_KEY)
        elif cls.AI_PROVIDER == "ollama":
            print(f"[Config] Using OllamaProvider (URL: {cls.OLLAMA_BASE_URL}, Model: {cls.OLLAMA_MODEL})")
            return OllamaProvider(base_url=cls.OLLAMA_BASE_URL, model=cls.OLLAMA_MODEL)
        elif cls.AI_PROVIDER == "huggingface":
            print(f"[Config] Using HuggingFaceProvider (Model: {cls.HF_MODEL})")
            return HuggingFaceProvider(api_key=cls.HUGGINGFACE_API_KEY, model=cls.HF_MODEL)
        elif cls.AI_PROVIDER == "mock":
             print(f"[Config] Using MockProvider")
             return MockProvider()
        else:
            print(f"[Config] Unknown AI provider '{cls.AI_PROVIDER}', defaulting to MockProvider")
            return MockProvider()
