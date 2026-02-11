import logging
from src.enrichment.client import MockApolloClient
from src.workflows.manager import WorkflowManager
import json

def main():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    print("==================================================")
    print("   AUTOMATED PROSPECTING SYSTEM - DEMO RUN")
    print("==================================================\n")
    
    # Initialize System
    client = MockApolloClient()
    workflow = WorkflowManager(client)
    
    # Define Target Criteria
    target_criteria = {
        "industry": "Software",
        "role": "CTO",
        "location": "US"
    }
    
    # Run Workflow
    results = workflow.process_lead_criteria(target_criteria)
    
    print("\n==================================================")
    print("   FINAL REPORT")
    print("==================================================")
    
    for lead in results:
        print(f"\nLead: {lead.first_name} {lead.last_name} | Company: {lead.company.name}")
        print(f"Status: {lead.status}")
        print(f"Score: {lead.score.total_score} (Demo: {lead.score.demographic_score}, Intent: {lead.score.intent_score})")
        
        if lead.status == "CONTACTED":
            print(f"--[ Draft Email ]-----------------------------")
            print(lead.details.get("draft_email"))
            print("----------------------------------------------")
        else:
            print("(No action taken)")

if __name__ == "__main__":
    main()
