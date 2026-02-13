from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import socket
from urllib.parse import urlparse
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
            print(f"Resolved database host {hostname} to IPv4: {ipv4}")
            
            # Helper to ensure connect_args exists
            if "connect_args" not in create_engine_kwargs:
                create_engine_kwargs["connect_args"] = {}
            
            # Pass hostaddr to libpq to force connection to this IP
            create_engine_kwargs["connect_args"]["hostaddr"] = ipv4

        except socket.gaierror:
            # Fallback for Supabase: If project-specific hostname has no IPv4, try the generic pooler (US-East-1 default)
            # This is common for newer Supabase projects or specific Render DNS issues.
            print(f"Warning: Failed to resolve {hostname} to IPv4. Switching to generic pooler.")
            
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
                
                print(f"Rewriting DATABASE_URL to use generic pooler: {fallback_host} with user {new_user}")
                
                # Reconstruct URL with new host and user
                # Note: We must be careful with password special chars, urlunparse might not handle mixed components perfectly if we just replace attributes.
                # Safer to replace using _replace but that doesn't handle user/pass split easily in standard urlparse in older python? 
                # Actually _replace works on parsed result but username is property.
                
                # Let's construct netloc manually: user:pass@host:port
                port = parsed.port or 5432
                password = parsed.password
                
                # Handle password escaping if needed, but parsed.password is already decoded? 
                # Wait, parsed.password is unquoted usually. 
                # We need to reconstruct.
                
                # Easiest way: Use string replacement on the netloc? 
                # Only if we are sure about the structure.
                
                # Alternative: Just set the connect_args hostaddr to the generic pooler IP?
                # But we NEED to change the username for Supavisor to route correctly.
                # Changing username in connect_args is: connect_args={"user": new_user}
                # Changing host in connect_args is NOT enough for SNI if we want to valid certs for aws-0...
                
                # Let's force the URL rewrite so SQLAlchemy sees the new host/user.
                netloc = f"{new_user}:{password}@{fallback_host}:{port}"
                parsed = parsed._replace(netloc=netloc)
                DATABASE_URL = urlunparse(parsed)
                
                # Resolving the fallback host to IPv4 to be safe (though aws-0 usually has A records)
                try:
                    fallback_ipv4 = socket.getaddrinfo(fallback_host, None, socket.AF_INET)[0][4][0]
                     # Helper to ensure connect_args exists
                    if "connect_args" not in create_engine_kwargs:
                        create_engine_kwargs["connect_args"] = {}
                    create_engine_kwargs["connect_args"]["hostaddr"] = fallback_ipv4
                    print(f"Resolved fallback host {fallback_host} to IPv4: {fallback_ipv4}")
                except Exception as e:
                     print(f"Warning: Could not resolve fallback host {fallback_host}: {e}")

            else:
                 print("Warning: Could not parse project ref from hostname. Fallback might fail.")

    except Exception as e:
        print(f"Warning: Error during database connection setup: {e}")

if DATABASE_URL.startswith("sqlite"):
    create_engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # For PostgreSQL: recover from stale connections automatically
    create_engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **create_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
