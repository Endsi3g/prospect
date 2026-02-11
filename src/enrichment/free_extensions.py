import csv
import time
from typing import List, Dict, Any
from duckduckgo_search import DDGS
from .client import SourcingClient

class FreeSourcingClient(SourcingClient):
    def __init__(self, csv_path: str = "leads.csv"):
        self.csv_path = csv_path
        try:
            self.ddgs = DDGS()
        except Exception as e:
            print(f"Warning: Could not initialize DuckDuckGo Search: {e}")
            self.ddgs = None

    def search_leads(self, criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        print(f"Reading leads from {self.csv_path}...")
        leads = []
        try:
            with open(self.csv_path, mode='r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                for row in reader:
                    # Helper to handle empty strings
                    def clean(val):
                        if val:
                            val = val.strip()
                            return val if val else None
                        return None

                    # Map CSV columns to expected keys, plus handle extra fields
                    lead = {
                        "first_name": clean(row.get("first_name", "")),
                        "last_name": clean(row.get("last_name", "")),
                        "email": clean(row.get("email", "")),
                        "title": clean(row.get("title", "")),
                        "linkedin_url": clean(row.get("linkedin_url")),
                        "company_name": clean(row.get("company_name", "")),
                        "company_domain": clean(row.get("company_domain", "")),
                        "location": clean(row.get("location", "")),
                        "industry": clean(row.get("industry")),
                        "size_range": clean(row.get("size_range")),
                        "revenue_range": clean(row.get("revenue_range")),
                        "phone": clean(row.get("phone")),
                        "company_description": clean(row.get("company_description"))
                    }
                    leads.append(lead)
        except FileNotFoundError:
            print(f"Error: CSV file {self.csv_path} not found. Please create one with headers: first_name, last_name, email, title, company_name, company_domain, location")
            return []
        except Exception as e:
            print(f"Error reading CSV: {e}")
            return []

        return leads

    def enrich_company(self, company_domain: str) -> Dict[str, Any]:
        print(f"Enriching company via Web: {company_domain}")
        info = {}

        if not company_domain or not self.ddgs:
            return info

        try:
            # Rate limiting / polite delay
            time.sleep(1)

            # Use DuckDuckGo to find a description
            query = f"{company_domain} company description"

            # Use context manager for DDGS
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=1))
                if results:
                    result = results[0]
                    info["description"] = result.get("body", "")
                    title = result.get("title", "")
                    if "-" in title:
                        info["name"] = title.split("-")[0].strip()
                    elif "|" in title:
                        info["name"] = title.split("|")[0].strip()
                    else:
                        info["name"] = title

                    # Try to guess industry from snippet (naive)
                    desc = info.get("description", "").lower()
                    if "software" in desc or "saas" in desc or "technology" in desc or "ai" in desc:
                        info["industry"] = "Software"
                    elif "healthcare" in desc or "medical" in desc:
                        info["industry"] = "Healthcare"

        except Exception as e:
            print(f"Web enrichment failed for {company_domain}: {e}")

        return info
