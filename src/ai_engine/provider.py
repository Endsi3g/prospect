from abc import ABC, abstractmethod
import os
import requests
from typing import Optional

class LLMProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str) -> str:
        """Generates text based on the prompt."""
        pass

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-3.5-turbo"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        # Import here to avoid hard dependency if not used
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=self.api_key)
        except ImportError:
            self.client = None

    def generate(self, prompt: str) -> str:
        if not self.client:
             # Fallback mock for demo purposes if package missing or key missing
             return "[OpenAI Mock] Generated content based on: " + prompt[:50] + "..."

        if not self.api_key:
             return "[OpenAI Mock] (No API Key) Generated content based on: " + prompt[:50] + "..."

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error generating content: {str(e)}"

class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url
        self.model = model

    def generate(self, prompt: str) -> str:
        try:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False
            }
            response = requests.post(f"{self.base_url}/api/generate", json=payload)
            response.raise_for_status()
            return response.json().get("response", "")
        except requests.exceptions.ConnectionError:
            return "[Ollama Error] Could not connect to Ollama at {}. Is it running?".format(self.base_url)
        except Exception as e:
            return f"[Ollama Error] {str(e)}"

class HuggingFaceProvider(LLMProvider):
    def __init__(self, api_key: Optional[str] = None, model: str = "mistralai/Mistral-7B-Instruct-v0.2"):
        self.api_key = api_key or os.getenv("HUGGINGFACE_API_KEY")
        self.model = model
        try:
            from huggingface_hub import InferenceClient
            self.client = InferenceClient(model=self.model, token=self.api_key)
        except ImportError:
            self.client = None

    def generate(self, prompt: str) -> str:
        if not self.client:
            return "[HF Error] huggingface_hub not installed."

        try:
            # text_generation returns a string directly or an object depending on version
            # simplified usage
            return self.client.text_generation(prompt, max_new_tokens=500)
        except Exception as e:
            return f"[HF Error] {str(e)}"

class MockProvider(LLMProvider):
    def generate(self, prompt: str) -> str:
        return "[Mock AI] Generated content for: " + prompt[:30] + "..."
