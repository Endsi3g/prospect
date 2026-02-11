import sys
import os
from src.config import Config
from src.workflows.manager import WorkflowManager

def create_sample_csv(path):
    if not os.path.exists(path):
        print(f"Creating sample CSV at {path}...")
        with open(path, "w") as f:
            f.write("first_name,last_name,email,title,company_name,company_domain,location\n")
            f.write("John,Doe,john@example.com,CTO,TechCorp,techcorp.com,San Francisco\n")
            f.write("Jane,Smith,jane@example.com,VP Engineering,HealthPlus,healthplus.com,New York\n")

def interactive_setup():
    print("\n--- Setup Mode ---")

    # Sourcing
    print("Choose Sourcing Method:")
    print("1: Mock Apollo (Paid Simulation)")
    print("2: CSV Import (Free)")
    sourcing = input("Selection [2]: ").strip() or "2"

    if sourcing == "1":
        Config.SOURCING_PROVIDER = "apollo"
    else:
        Config.SOURCING_PROVIDER = "csv"
        csv_path = input(f"Path to CSV file [{Config.CSV_PATH}]: ").strip()
        if csv_path:
            Config.CSV_PATH = csv_path

        # Check if CSV exists, if not ask to create
        if not os.path.exists(Config.CSV_PATH):
            create = input(f"CSV file '{Config.CSV_PATH}' not found. Create sample? (y/n) [y]: ").strip().lower() or "y"
            if create == "y":
                create_sample_csv(Config.CSV_PATH)

    # AI Provider
    print("\nChoose AI Provider:")
    print("1: OpenAI (Paid - Requires API Key)")
    print("2: Ollama (Free - Local)")
    print("3: HuggingFace (Free - Cloud)")
    print("4: Mock (No AI)")
    ai = input("Selection [2]: ").strip() or "2"

    if ai == "1":
        Config.AI_PROVIDER = "openai"
    elif ai == "3":
        Config.AI_PROVIDER = "huggingface"
    elif ai == "4":
        Config.AI_PROVIDER = "mock"
    else:
        Config.AI_PROVIDER = "ollama"

def main():
    print("==================================================")
    print("   AUTOMATED PROSPECTING SYSTEM")
    print("==================================================\n")
    
    # Simple interactive logic
    if "--no-interactive" not in sys.argv:
        print(f"Current Config: Sourcing={Config.SOURCING_PROVIDER}, AI={Config.AI_PROVIDER}")
        choice = input("Press Enter to run, or type 's' to setup options: ").strip().lower()
        if choice == 's':
            interactive_setup()

    # Initialize System
    sourcing_client = Config.get_sourcing_client()
    llm_provider = Config.get_llm_provider()

    workflow = WorkflowManager(sourcing_client, llm_provider)
    
    # Define Target Criteria (used for sourcing only if not CSV)
    target_criteria = {
        "industry": "Software",
        "role": "CTO",
        "location": "US"
    }
    
    # Run Workflow
    try:
        results = workflow.process_lead_criteria(target_criteria)
    except Exception as e:
        print(f"Error executing workflow: {e}")
        import traceback
        traceback.print_exc()
        return
    
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
            print(f"(No action taken. Score too low)")

if __name__ == "__main__":
    main()
