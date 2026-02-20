from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import sys
import socket
from urllib.parse import urlparse, urlunparse, quote_plus
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./uprising_hunter.db")

# Render.com gives postgres:// but SQLAlchemy 2.x requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

create_engine_kwargs: dict = {}

# Force IPv4 resolution for PostgreSQL to avoid Render/Supabase IPv6 issues
# We use 'hostaddr' in connect_args to force the IP connection while keeping the hostname in the URL for SSL verification.
if DATABASE_URL.startswith("postgresql://"):
    try:
        parsed = urlparse(DATABASE_URL)
        hostname = parsed.hostname
        ipv4 = None
        
        # Try resolving the hostname directly first
        try:
            ipv4 = socket.getaddrinfo(hostname, None, socket.AF_INET)[0][4][0]
            print(f"Resolved database host {hostname} to IPv4: {ipv4}", flush=True)
            
            # Helper to ensure connect_args exists
            if "connect_args" not in create_engine_kwargs:
                create_engine_kwargs["connect_args"] = {}
            
            # Pass hostaddr to libpq to force connection to this IP
            create_engine_kwargs["connect_args"]["hostaddr"] = ipv4

        except (socket.gaierror, IndexError):
            # Fallback for Supabase: If project-specific hostname has no IPv4, try the generic pooler
            # This is common for newer Supabase projects or specific Render DNS issues.
            print(f"Warning: Failed to resolve {hostname} to IPv4. Switching to generic pooler logic.", flush=True)
            
            # Extract project ref from hostname (db.REF.supabase.co)
            # Hostname text: db.rykkphesilpsyzhvvest.supabase.co
            parts = hostname.split('.')
            if len(parts) >= 4 and parts[0] == 'db':
                project_ref = parts[1]
                
                # List of regions to try. Priority based on likely location (EU/US) or default.
                regions_to_try = [
                    "us-east-1",     # Default US
                    "eu-central-1",  # Frankfurt (Common EU)
                    "eu-west-1",     # Ireland
                    "eu-west-2",     # London
                    "eu-west-3",     # Paris
                    "ap-southeast-1", # Singapore
                    "sa-east-1",     # Sao Paulo
                    "us-west-1",     # California
                    "ap-northeast-1", # Tokyo
                    "ap-south-1",    # Mumbai
                    "ca-central-1",  # Canada
                ]
                
                # If explicit region is set in env, prioritize it
                env_region = os.getenv("SUPABASE_REGION")
                if env_region:
                     regions_to_try.insert(0, env_region)

                found_working_url = False
                
                # Update username to user.project_ref if not already (required for transaction pooler)
                current_user = parsed.username
                if project_ref not in current_user:
                    new_user = f"{current_user}.{project_ref}"
                else:
                    new_user = current_user
                    
                port = parsed.port or 5432
                password = parsed.password
                
                # Use quote_plus to safely encode the password and user components
                safe_user = quote_plus(new_user)
                safe_password = quote_plus(password) if password else ""
                
                # Helper function to test a connection URL
                def test_connection(test_url):
                    try:
                        # Create a temp engine just for testing with short timeout
                        t_engine = create_engine(test_url, connect_args={"connect_timeout": 3})
                        with t_engine.connect() as conn:
                            return True
                    except Exception as e:
                        err_str = str(e).lower()
                        if "tenant or user not found" in err_str:
                            return False 
                        if "timeout" in err_str:
                             return False
                        return False
                    finally:
                        try:
                            if 't_engine' in locals():
                                t_engine.dispose()
                        except Exception:
                            pass

                print(f"Attempting to auto-detect Supabase region pooler for project {project_ref}...", flush=True)

                for region in regions_to_try:
                    pooler_host = f"aws-0-{region}.pooler.supabase.com"
                    # Use port 6543 strictly for pooler fallback
                    pooler_port = 6543 
                    
                    netloc = f"{safe_user}:{safe_password}@{pooler_host}:{pooler_port}"
                    test_parsed = parsed._replace(netloc=netloc)
                    candidate_url = urlunparse(test_parsed)
                    
                    if test_connection(candidate_url):
                        print(f"SUCCESS: Connected to Supabase via region {region} ({pooler_host})", flush=True)
                        DATABASE_URL = candidate_url
                        found_working_url = True
                        break
                
                if not found_working_url:
                    print("CRITICAL: Failed to connect to any Supabase region pooler. Defaulting to us-east-1 but expect failure.", flush=True)
                    # Fallback to default construction if check fails
                    fallback_host = "aws-0-us-east-1.pooler.supabase.com"
                    netloc = f"{safe_user}:{safe_password}@{fallback_host}:6543"
                    parsed = parsed._replace(netloc=netloc)
                    DATABASE_URL = urlunparse(parsed)
                    
                    # Resolving the fallback host to IPv4 to be safe
                    try:
                        fallback_ipv4 = socket.getaddrinfo(fallback_host, None, socket.AF_INET)[0][4][0]
                        if "connect_args" not in create_engine_kwargs:
                            create_engine_kwargs["connect_args"] = {}
                        create_engine_kwargs["connect_args"]["hostaddr"] = fallback_ipv4
                    except Exception:
                        pass

            else:
                 print("Warning: Could not parse project ref from hostname. Fallback might fail.", flush=True)

    except Exception as e:
        print(f"Warning: Error during database connection setup: {e}", file=sys.stderr, flush=True)

if DATABASE_URL.startswith("sqlite"):
    create_engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # For PostgreSQL: recover from stale connections automatically
    create_engine_kwargs["pool_pre_ping"] = True

try:
    engine = create_engine(DATABASE_URL, **create_engine_kwargs)
except Exception as e:
    print(f"CRITICAL: Failed to create database engine: {e}", file=sys.stderr, flush=True)
    raise
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
