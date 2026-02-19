from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
from datetime import datetime
from supabase import create_client, Client
import shutil

from src.core.database import SessionLocal
from src.core.db_models import DBDocument
from src.core.models import LibraryDoc

router = APIRouter(prefix="/api/v1/admin/library", tags=["library"])

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Supabase Client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")

@router.get("/documents", response_model=List[LibraryDoc])
def get_documents(db: Session = Depends(get_db)):
    docs = db.query(DBDocument).order_by(DBDocument.created_at.desc()).all()
    return [
        LibraryDoc(
            id=doc.id,
            title=doc.title,
            filename=doc.filename,
            file_type=doc.file_type,
            size_bytes=doc.size_bytes,
            mime_type=doc.mime_type,
            metadata=doc.metadata_json,
            created_at=doc.created_at,
            updated_at=doc.updated_at
        ) for doc in docs
    ]

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Storage service unavailable (Check credentials)")

    # 1. Read file
    content = await file.read()
    file_size = len(content)
    file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else "dat"
    doc_id = str(uuid.uuid4())
    storage_path = f"{doc_id}.{file_ext}"
    
    # 2. Upload to Supabase Storage
    try:
        # Check if bucket exists, if not try to create (or fail if not allowed)
        # Usually buckets are pre-created. We assume 'library' bucket exists.
        # If not, we might fall back to 'documents' or throw error.
        bucket_name = "library"
        
        # Simple upload
        res = supabase.storage.from_(bucket_name).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type}
        )
    except Exception as e:
        # Try creating bucket? Or just report error
        print(f"Storage upload error: {e}")
        # Improve error handling: maybe bucket doesn't exist?
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    # 3. Create DB Record
    doc_title = title if title else file.filename
    
    db_doc = DBDocument(
        id=doc_id,
        title=doc_title,
        filename=file.filename,
        file_path=storage_path, # Path in bucket
        file_type=file_ext,
        size_bytes=file_size,
        mime_type=file.content_type,
        metadata_json={},
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    return {"status": "success", "id": doc_id}

@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    if not supabase:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    db_doc = db.query(DBDocument).filter(DBDocument.id == doc_id).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 1. Remove from Storage
    try:
        bucket_name = "library"
        supabase.storage.from_(bucket_name).remove([db_doc.file_path])
    except Exception as e:
        print(f"Storage delete warning: {e}")
        # Continue to delete DB record even if storage fails (orphaned file)

    # 2. Remove from DB
    db.delete(db_doc)
    db.commit()

    return {"status": "success"}

@router.get("/documents/{doc_id}/file")
def get_document_file(doc_id: str, db: Session = Depends(get_db)):
    if not supabase:
        raise HTTPException(status_code=503, detail="Storage service unavailable")

    db_doc = db.query(DBDocument).filter(DBDocument.id == doc_id).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Generate signed URL
    try:
        bucket_name = "library"
        # 1 hour expiry
        res = supabase.storage.from_(bucket_name).create_signed_url(db_doc.file_path, 3600)
        return {"url": res["signedURL"]} 
        # Ideally redirect? Frontend expects a window.open, but maybe we redirect here?
        # The frontend uses `window.open(..., "_blank")`. If this endpoint returns JSON, frontend needs to handle it.
        # Looking at `LibraryPage.tsx`: `window.open(\`/api/v1/admin/library/documents/\${id}/file\`, "_blank")`
        # This implies the browser opens this URL directly. So I should RedirectResponse.
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate access link: {str(e)}")

from fastapi.responses import RedirectResponse

@router.get("/documents/{doc_id}/download", include_in_schema=False)
def download_document_redirect(doc_id: str, db: Session = Depends(get_db)):
    if not supabase:
         raise HTTPException(status_code=503, detail="Storage service unavailable")

    db_doc = db.query(DBDocument).filter(DBDocument.id == doc_id).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    try:
        bucket_name = "library"
        res = supabase.storage.from_(bucket_name).create_signed_url(db_doc.file_path, 3600)
        # Return actual redirect
        return RedirectResponse(url=res["signedURL"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
