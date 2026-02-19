from fastapi import APIRouter, Depends, HTTPException
from src.ai_engine.rag_service import rag_service

router = APIRouter(prefix="/api/v1/admin/rag", tags=["RAG"])

@router.post("/ingest")
def ingest_rag_documents():
    """Trigger the RAG ingestion process."""
    try:
        result = rag_service.ingest_documents()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG Ingestion failed: {str(e)}")

@router.get("/status")
def get_rag_status():
    """Get the current status of the RAG vector store."""
    return {
        "items_count": len(rag_service.vector_store),
        "last_updated": "unknown" # Could be enhanced if store had a timestamp
    }
