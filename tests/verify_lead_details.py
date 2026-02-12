import requests
import sys

BASE_URL = "http://localhost:8000"

def verify_lead_details():
    print("Verifying Lead Details API...")
    
    # 1. Get all leads to find an ID
    response = requests.get(f"{BASE_URL}/api/v1/admin/leads", auth=("admin", "change-me"))
    if response.status_code != 200:
        print(f"FAILED: Could not fetch leads. Status: {response.status_code}")
        print(response.text)
        sys.exit(1)
        
    data = response.json()
    if isinstance(data, dict) and "items" in data:
        leads = data["items"]
    else:
        leads = data
        
    if not leads:
        print("WARNING: No leads found. Creating a test lead...")
        # Create a dummy lead
        new_lead = {
            "id": "test.lead@example.com",
            "first_name": "Test",
            "last_name": "Lead",
            "email": "test.lead@example.com",
            "company": {"name": "Test Corp"},
            "status": "NEW"
        }
        res = requests.post(f"{BASE_URL}/api/v1/admin/leads", json=new_lead, auth=("admin", "change-me"))
        if res.status_code != 200:
             print(f"FAILED: Could not create test lead. Status: {res.status_code}")
             print(res.text)
             sys.exit(1)
        lead_id = new_lead["id"]
    else:
        lead_id = leads[0]["id"]
        
    print(f"Testing with Lead ID: {lead_id}")
    
    # 2. Get Lead Details
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads/{lead_id}", auth=("admin", "change-me"))
    if res.status_code == 200:
        print(f"SUCCESS: Fetched lead details for {lead_id}")
        data = res.json()
        if data["email"] == lead_id:
            print("  - Data matches ID")
        else:
            print(f"  - WARNING: ID/Email mismatch? {data['email']} vs {lead_id}")
    else:
        print(f"FAILED: Could not fetch lead details. Status: {res.status_code}")
        print(res.text)
        
    # 3. Get Lead Tasks
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads/{lead_id}/tasks", auth=("admin", "change-me"))
    if res.status_code == 200:
        print(f"SUCCESS: Fetched lead tasks. Count: {len(res.json())}")
    else:
        print(f"FAILED: Could not fetch lead tasks. Status: {res.status_code}")

    # 4. Get Lead Projects
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads/{lead_id}/projects", auth=("admin", "change-me"))
    if res.status_code == 200:
        print(f"SUCCESS: Fetched lead projects. Count: {len(res.json())}")
    else:
        print(f"FAILED: Could not fetch lead projects. Status: {res.status_code}")

    # 5. Patch Lead (Test update)
    update_data = {"status": "ENRICHED"}
    res = requests.patch(f"{BASE_URL}/api/v1/admin/leads/{lead_id}", json=update_data, auth=("admin", "change-me"))
    if res.status_code == 200 and res.json()["status"] == "ENRICHED":
         print(f"SUCCESS: Updated lead status to ENRICHED")
    else:
         print(f"FAILED: Could not update lead. Status: {res.status_code}")
         print(res.text)

if __name__ == "__main__":
    verify_lead_details()
