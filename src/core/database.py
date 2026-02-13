from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import sys
import socket
from urllib.parse import urlparse, urlunparse, quote_plus
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./prospect.db")

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

        except socket.gaierror:
            # Fallback for Supabase: If project-specific hostname has no IPv4, try the generic pooler (US-East-1 default)
            # This is common for newer Supabase projects or specific Render DNS issues.
            print(f"Warning: Failed to resolve {hostname} to IPv4. Switching to generic pooler.", flush=True)
            
            # Extract project ref from hostname (db.REF.supabase.co)
            # Hostname text: db.rykkphesilpsyzhvvest.supabase.co
            parts = hostname.split('.')
            if len(parts) >= 4 and parts[0] == 'db':
                project_ref = parts[1]
                
                # New generic host
                fallback_host = "aws-0-us-east-1.pooler.supabase.com"
                
                # Update username to user.project_ref if not already
                current_user = parsed.username
                if project_ref not in current_user:
                    new_user = f"{current_user}.{project_ref}"
                else:
                    new_user = current_user
                
                print(f"Rewriting DATABASE_URL to use generic pooler: {fallback_host} with user {new_user}", flush=True)
                
                # Reconstruct URL with new host and user
                port = parsed.port or 5432
                password = parsed.password
                
                # Use quote_plus to safely encode the password and user components
                safe_user = quote_plus(new_user)
                safe_password = quote_plus(password) if password else ""
                
                netloc = f"{safe_user}:{safe_password}@{fallback_host}:{port}"
                parsed = parsed._replace(netloc=netloc)
                DATABASE_URL = urlunparse(parsed)
                
                # Resolving the fallback host to IPv4 to be safe (though aws-0 usually has A records)
                try:
                    fallback_ipv4 = socket.getaddrinfo(fallback_host, None, socket.AF_INET)[0][4][0]
                     # Helper to ensure connect_args exists
                    if "connect_args" not in create_engine_kwargs:
                        create_engine_kwargs["connect_args"] = {}
                    create_engine_kwargs["connect_args"]["hostaddr"] = fallback_ipv4
                    print(f"Resolved fallback host {fallback_host} to IPv4: {fallback_ipv4}", flush=True)
                except Exception as e:
                     print(f"Warning: Could not resolve fallback host {fallback_host}: {e}", flush=True)

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
