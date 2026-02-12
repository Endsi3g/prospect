import requests
import sys
import uuid
import time

BASE_URL = "http://localhost:8000"
AUTH = ("admin", "change-me")

def check(response, description):
    if response.status_code >= 200 and response.status_code < 300:
        print(f"✓ {description}")
        return response.json()
    else:
        print(f"✗ {description} failed ({response.status_code}): {response.text}")
        sys.exit(1)

def verify_account():
    print("\n--- Testing Account API ---")
    # Get Account
    res = requests.get(f"{BASE_URL}/api/v1/admin/account", auth=AUTH)
    data = check(res, "Get Account Profile")
    
    # Update Account
    payload = {
        "full_name": "Test Admin",
        "email": "admin@test.com",
        "title": "Tester",
        "locale": "en-US",
        "timezone": "UTC"
    }
    res = requests.put(f"{BASE_URL}/api/v1/admin/account", json=payload, auth=AUTH)
    data = check(res, "Update Account Profile")
    if data["full_name"] != "Test Admin":
        print("✗ Account update mismatch")
        sys.exit(1)

def verify_billing():
    print("\n--- Testing Billing API ---")
    # Get Billing
    res = requests.get(f"{BASE_URL}/api/v1/admin/billing", auth=AUTH)
    data = check(res, "Get Billing Profile")
    
    # Update Billing Profile
    payload = {
        "plan_name": "Enterprise",
        "billing_email": "billing@test.com",
        "company_name": "Test Corp",
        "amount_cents": 19900
    }
    res = requests.put(f"{BASE_URL}/api/v1/admin/billing", json=payload, auth=AUTH)
    data = check(res, "Update Billing Profile")
    if data["profile"]["plan_name"] != "Enterprise":
        print("✗ Billing update mismatch")
        sys.exit(1)

    # Create Invoice
    invoice_num = f"INV-{str(uuid.uuid4())[:8]}"
    payload = {
        "invoice_number": invoice_num,
        "amount_cents": 5000,
        "status": "issued"
    }
    res = requests.post(f"{BASE_URL}/api/v1/admin/billing/invoices", json=payload, auth=AUTH)
    check(res, "Create Invoice")

def verify_notifications():
    print("\n--- Testing Notifications API ---")
    # Create Notification
    payload = {
        "event_key": "task_created",
        "title": "Test Notification",
        "message": "This is a test",
        "channel": "in_app"
    }
    res = requests.post(f"{BASE_URL}/api/v1/admin/notifications", json=payload, auth=AUTH)
    data = check(res, "Create Notification")
    notif_id = data["items"][0]["id"]
    
    # List Notifications
    res = requests.get(f"{BASE_URL}/api/v1/admin/notifications", auth=AUTH)
    data = check(res, "List Notifications")
    if not any(n["id"] == notif_id for n in data["items"]):
        print("✗ Created notification not found in list")
        sys.exit(1)

    # Mark Read
    res = requests.post(f"{BASE_URL}/api/v1/admin/notifications/mark-read", json={"ids": [notif_id]}, auth=AUTH)
    check(res, "Mark Notification Read")

def verify_reports():
    print("\n--- Testing Reports API ---")
    # Create Schedule
    payload = {
        "name": "Test Report",
        "frequency": "weekly",
        "hour_local": 9,
        "minute_local": 0,
        "recipients": ["test@example.com"]
    }
    res = requests.post(f"{BASE_URL}/api/v1/admin/reports/schedules", json=payload, auth=AUTH)
    data = check(res, "Create Report Schedule")
    schedule_id = data["id"]
    
    # Run Due (simulate)
    # We can't easily force run pending without hacking time, but we can call the endpoint
    res = requests.post(f"{BASE_URL}/api/v1/admin/reports/schedules/run-due", auth=AUTH)
    check(res, "Run Due Schedules")
    
    # Delete Schedule
    res = requests.delete(f"{BASE_URL}/api/v1/admin/reports/schedules/{schedule_id}", auth=AUTH)
    check(res, "Delete Report Schedule")

if __name__ == "__main__":
    try:
        verify_account()
        verify_billing()
        verify_notifications()
        verify_reports()
        print("\nALL NEW BACKEND FEATURES PASSED")
    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
