import psycopg2
import sys

# Configuration
PROJECT_REF = "rykkphesilpsyzhvvest"
PASSWORD = "Endsieg25$"
USER_MD = f"postgres.{PROJECT_REF}"
DB_NAME = "postgres"

REGIONS = [
    "us-east-1",
    "eu-central-1",  # Frankfurt
    "eu-west-1",     # Ireland
    "eu-west-2",     # London
    "eu-west-3",     # Paris
    "us-west-1",
    "ap-southeast-1",
    "sa-east-1",
]

print(f"Detecting Supabase region for project {PROJECT_REF}...")

for region in REGIONS:
    host = f"aws-0-{region}.pooler.supabase.com"
    dsn = f"postgresql://{USER_MD}:{PASSWORD}@{host}:6543/{DB_NAME}"
    
    print(f"Trying region: {region} ({host})...", end=" ")
    try:
        conn = psycopg2.connect(dsn, connect_timeout=3)
        conn.close()
        print("SUCCESS! 🎉")
        print(f"\n>>> THE CORRECT REGION IS: {region} <<<")
        sys.exit(0)
    except psycopg2.OperationalError as e:
        msg = str(e).strip()
        if "Tenant or user not found" in msg:
            print("Failed (Tenant/User not found)")
        elif "timeout" in msg.lower():
            print("Failed (Timeout)")
        else:
            print(f"Failed ({msg})")
    except Exception as e:
        print(f"Failed ({e})")

print("\nCould not detect region. Please check credentials or project status.")
sys.exit(1)
