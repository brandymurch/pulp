import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.db import get_db
from app.models import ExportGDriveRequest, ExportGDriveResponse
from app.services.gdrive import export_to_drive, _get_services
from app.config import GOOGLE_SERVICE_ACCOUNT_KEY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/gdrive", response_model=ExportGDriveResponse)
async def export_gdrive(req: ExportGDriveRequest, _=Depends(require_auth)):
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    try:
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
    except Exception as e:
        logger.error(f"Drive export failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Drive export failed: {str(e)}")


@router.get("/drive-audit")
async def drive_audit(_=Depends(require_auth)):
    """Diagnose service account's Drive quota and files."""
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    try:
        drive, _ = _get_services()

        # Check actual quota
        about = drive.about().get(fields="storageQuota,user").execute()
        quota = about.get("storageQuota", {})
        user_info = about.get("user", {})

        # List files
        all_files = []
        page_token = None
        while True:
            resp = drive.files().list(
                q="'me' in owners",
                fields="nextPageToken,files(id,name,mimeType,size,createdTime,trashed)",
                pageSize=1000,
                pageToken=page_token,
            ).execute()
            all_files.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        return {
            "service_account_email": user_info.get("emailAddress"),
            "quota": {
                "limit_bytes": int(quota.get("limit", 0)),
                "limit_gb": round(int(quota.get("limit", 0)) / (1024**3), 2),
                "usage_bytes": int(quota.get("usage", 0)),
                "usage_gb": round(int(quota.get("usage", 0)) / (1024**3), 2),
                "usage_in_drive_bytes": int(quota.get("usageInDrive", 0)),
                "usage_in_drive_trash_bytes": int(quota.get("usageInDriveTrash", 0)),
            },
            "total_files": len(all_files),
            "files": [
                {
                    "id": f["id"],
                    "name": f.get("name"),
                    "type": f.get("mimeType"),
                    "size_bytes": int(f.get("size", 0)),
                    "trashed": f.get("trashed", False),
                }
                for f in all_files
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drive audit failed: {str(e)}")


@router.delete("/drive-cleanup")
async def drive_cleanup(_=Depends(require_auth)):
    """Permanently delete ALL files owned by the service account to free quota."""
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    try:
        drive, _ = _get_services()
        all_files = []
        page_token = None

        while True:
            resp = drive.files().list(
                q="'me' in owners",
                fields="nextPageToken,files(id,name)",
                pageSize=1000,
                pageToken=page_token,
            ).execute()
            all_files.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        deleted = 0
        errors = []
        for f in all_files:
            try:
                drive.files().delete(fileId=f["id"]).execute()
                deleted += 1
            except Exception as e:
                errors.append({"id": f["id"], "name": f.get("name"), "error": str(e)})

        return {
            "total_found": len(all_files),
            "deleted": deleted,
            "errors": errors,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drive cleanup failed: {str(e)}")
