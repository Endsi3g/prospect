import requests
import uuid

BASE_URL = "http://localhost:8000/admin"
# Ensure we use the correct basic auth if enabled in dev, but usually dev has loose settings or we can use the default.
# The `require_admin` dependency checks env vars ADMIN_USERNAME/PASSWORD. 
# Default is admin/admin if not set, or we can see from checks.
AUTH = ("admin", "admin") 

def test_delete_lead():
    print("Testing Single Lead Delete...")
    # 1. Create a lead
    email = f"delete_test_{uuid.uuid4()}@example.com"
    payload = {
        "first_name": "Delete",
        "last_name": "Test",
        "email": email,
        "company_name": "Delete Corp",
        "status": "NEW",
        "segment": "Test"
    }
    resp = requests.post(f"{BASE_URL}/leads", json=payload, auth=AUTH)
    if resp.status_code != 200:
        print(f"Failed to create lead: {resp.text}")
        return False
    
    lead_id = resp.json()["id"]
    print(f"Created lead {lead_id}")

    # 2. Delete the lead
    del_resp = requests.delete(f"{BASE_URL}/leads/{lead_id}", auth=AUTH)
    if del_resp.status_code != 200:
        print(f"Failed to delete lead: {del_resp.text}")
        return False
    
    print("Delete request successful")

    # 3. Verify it's gone
    get_resp = requests.get(f"{BASE_URL}/leads/{lead_id}", auth=AUTH)
    if get_resp.status_code != 404:
        print(f"Lead still exists after delete! Status: {get_resp.status_code}")
        return False
    
    print("Verified lead is gone.")
    return True

def test_bulk_delete_leads():
    print("\nTesting Bulk Lead Delete...")
    ids = []
    # 1. Create 3 leads
    for i in range(3):
        email = f"bulk_delete_{i}_{uuid.uuid4()}@example.com"
        payload = {
            "first_name": f"Bulk{i}",
            "last_name": "Test",
            "email": email,
            "company_name": "Bulk Corp",
            "status": "NEW",
            "segment": "Test"
        }
        resp = requests.post(f"{BASE_URL}/leads", json=payload, auth=AUTH)
        if resp.status_code == 200:
            ids.append(resp.json()["id"])
        else:
            print(f"Failed to create bulk lead {i}")

    print(f"Created {len(ids)} leads for bulk delete: {ids}")

    # 2. Bulk delete
    bulk_payload = {"ids": ids}
    # Note: verify the endpoint path in app.py
    del_resp = requests.post(f"{BASE_URL}/leads/bulk-delete", json=bulk_payload, auth=AUTH)
    if del_resp.status_code != 200:
        print(f"Failed to bulk delete: {del_resp.text}")
        return False
    
    print("Bulk delete request successful")

    # 3. Verify they are gone
    all_gone = True
    for lid in ids:
        get_resp = requests.get(f"{BASE_URL}/leads/{lid}", auth=AUTH)
        if get_resp.status_code != 404:
            print(f"Lead {lid} still exists!")
            all_gone = False
    
    if all_gone:
        print("Verified all leads are gone.")
    return all_gone

if __name__ == "__main__":
    try:
        if test_delete_lead() and test_bulk_delete_leads():
            print("\nSUCCESS: All delete tests passed.")
        else:
            print("\nFAILURE: Some tests failed.")
            exit(1)
    except Exception as e:
        print(f"\nEXCEPTION: {e}")
        exit(1)
