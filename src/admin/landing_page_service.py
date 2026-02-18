from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..core.db_models import DBLandingPage
from ..core.logging import get_logger

logger = get_logger(__name__)

def list_landing_pages(db: Session, skip: int = 0, limit: int = 100) -> list[DBLandingPage]:
    """List all landing pages."""
    return db.query(DBLandingPage).order_by(desc(DBLandingPage.updated_at)).offset(skip).limit(limit).all()

def get_landing_page(db: Session, page_id: str) -> Optional[DBLandingPage]:
    """Get a landing page by ID."""
    return db.query(DBLandingPage).filter(DBLandingPage.id == page_id).first()

def create_landing_page(
    db: Session,
    name: str,
    slug: str,
    title: str,
    description: Optional[str] = None,
    content: dict[str, Any] = {},
    theme: dict[str, Any] = {},
    is_published: bool = False
) -> DBLandingPage:
    """Create a new landing page."""
    page_id = str(uuid.uuid4())
    
    # Ensure unique slug if needed, but for now rely on DB constraint or catch error in caller
    db_page = DBLandingPage(
        id=page_id,
        name=name,
        slug=slug,
        title=title,
        description=description,
        content_json=content,
        theme_json=theme,
        is_published=is_published,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(db_page)
    db.commit()
    db.refresh(db_page)
    return db_page

def update_landing_page(
    db: Session,
    page_id: str,
    data: dict[str, Any]
) -> Optional[DBLandingPage]:
    """Update a landing page."""
    page = get_landing_page(db, page_id)
    if not page:
        return None
    
    for key, value in data.items():
        if hasattr(page, key):
            # Special handling for JSON fields if partial updates are needed?
            # For now, assume full replacement of JSON objects if provided
            if key == "content":
                page.content_json = value
            elif key == "theme":
                page.theme_json = value
            else:
                setattr(page, key, value)
    
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return page

def delete_landing_page(db: Session, page_id: str) -> bool:
    """Delete a landing page."""
    page = get_landing_page(db, page_id)
    if not page:
        return False
    
    db.delete(page)
    db.commit()
    return True
