from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.db import get_db
from app.models import ExportGDriveRequest, ExportGDriveResponse
from app.services.gdrive import export_to_drive
from app.config import GOOGLE_SERVICE_ACCOUNT_KEY

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/gdrive", response_model=ExportGDriveResponse)
async def export_gdrive(req: ExportGDriveRequest, _=Depends(require_auth)):
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    db = get_db()
    brand = db.table("brands").select("name").eq("id", req.brand_id).single().execute()
    brand_name = brand.data["name"]

    result = export_to_drive(
        title=req.title,
        content=req.content,
        brand_name=brand_name,
        city=req.city,
    )
    return ExportGDriveResponse(**result)
