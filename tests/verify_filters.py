import requests
import sys
import uuid

BASE_URL = "http://localhost:8000"
AUTH = ("admin", "change-me")

def create_lead(name, status, score):
    unique_id = str(uuid.uuid4())[:8]
    data = {
        "id": f"test-{unique_id}@example.com",
        "email": f"test-{unique_id}@example.com",
        "first_name": name,
        "last_name": "Test",
        "company": {"name": f"Company {name}"},
        "status": status,
        "total_score": score
    }
    res = requests.post(f"{BASE_URL}/api/v1/admin/leads", json=data, auth=AUTH)
    if res.status_code != 200:
        print(f"Failed to create lead {name}: {res.text}")
        sys.exit(1)
    return data

def verify_filters():
    print("Creating test data...")
    l1 = create_lead("Alpha", "NEW", 10)
    l2 = create_lead("Beta", "CONTACTED", 50)
    l3 = create_lead("Gamma", "NEW", 90)

    print("Verifying Search (q=Alpha)...")
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads?q=Alpha", auth=AUTH)
    data = res.json()["items"]
    if len(data) != 1 or data[0]["first_name"] != "Alpha":
        print(f"FAILED: Search q=Alpha returned {len(data)} items")
        sys.exit(1)
    print("PASSED")

    print("Verifying Status Filter (status=CONTACTED)...")
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads?status=CONTACTED", auth=AUTH)
    data = res.json()["items"]
    if not any(l["first_name"] == "Beta" for l in data):
        print("FAILED: Status filter missed Beta")
        sys.exit(1)
    # Check if we accidentally got NEW leads
    if any(l["status"] != "CONTACTED" for l in data):
        print("FAILED: Status filter returned non-CONTACTED leads")
        sys.exit(1)
    print("PASSED")

    print("Verifying Sorting (sort=total_score, order=desc)...")
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads?sort=total_score&order=desc", auth=AUTH)
    data = res.json()["items"]
    scores = [l["total_score"] for l in data]
    # Check if sorted descending
    if scores != sorted(scores, reverse=True):
        print(f"FAILED: Sorting. Got {scores[:5]}...")
        sys.exit(1)
    print("PASSED")

    print("Verifying Pagination (page_size=1)...")
    res = requests.get(f"{BASE_URL}/api/v1/admin/leads?page=1&page_size=1", auth=AUTH)
    data = res.json()
    if len(data["items"]) != 1:
        print(f"FAILED: Page size 1 returned {len(data['items'])} items")
        sys.exit(1)
    print("PASSED")

if __name__ == "__main__":
    try:
        verify_filters()
        print("ALL TESTS PASSED")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
