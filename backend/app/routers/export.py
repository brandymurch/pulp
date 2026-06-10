import logging
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_auth
from app.db import get_db
from app.models import ExportGDriveRequest, ExportGDriveResponse
from app.services.gdrive import (
    GDriveExportError,
    export_to_drive,
    get_account_info,
    list_owned_files,
    _ensure_shared_drive_folder,
    _get_services,
)
from app.config import GOOGLE_DRIVE_FOLDER_ID, GOOGLE_SERVICE_ACCOUNT_KEY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])

CLEANUP_CONFIRM_PHRASE = "delete-all-files"


@router.post("/gdrive", response_model=ExportGDriveResponse)
def export_gdrive(req: ExportGDriveRequest, _=Depends(require_auth)):
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    try:
        db = get_db()
        brand = db.table("brands").select("name").eq("id", req.brand_id).limit(1).execute()
    except Exception as e:
        logger.error("Brand lookup failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=503, detail="Database error looking up brand")
    if not brand.data:
        raise HTTPException(status_code=404, detail="Brand not found")
    brand_name = brand.data[0]["name"]

    try:
        result = export_to_drive(
            title=req.title,
            content=req.content,
            brand_name=brand_name,
            city=req.city,
        )
        return ExportGDriveResponse(**result)
    except GDriveExportError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error("Drive export failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=502, detail=f"Drive export failed: {str(e)}")


@router.get("/drive-audit")
def drive_audit(_=Depends(require_auth)):
    """Diagnose service account's Drive quota and files."""
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    try:
        drive, _ = _get_services()
        root_folder = None
        shared_drive_ready = None
        try:
            root_folder = _ensure_shared_drive_folder(drive, GOOGLE_DRIVE_FOLDER_ID)
            shared_drive_ready = True
        except GDriveExportError as exc:
            root_folder = {"id": GOOGLE_DRIVE_FOLDER_ID, "error": str(exc)}
            shared_drive_ready = False

        # Check actual quota
        about = get_account_info(drive)
        quota = about.get("storageQuota", {})
        user_info = about.get("user", {})

        all_files = list_owned_files(
            drive, fields="id,name,mimeType,size,createdTime,trashed"
        )

        return {
            "service_account_email": user_info.get("emailAddress"),
            "root_folder": root_folder,
            "shared_drive_ready": shared_drive_ready,
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
    except GDriveExportError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error("Drive audit failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=502, detail=f"Drive audit failed: {str(e)}")


@router.delete("/drive-cleanup")
def drive_cleanup(
    confirm: str = "",
    dry_run: bool = True,
    _=Depends(require_auth),
):
    """Permanently delete ALL files owned by the service account to free quota.

    Destructive. Defaults to dry_run=true, which only lists what would be deleted.
    Actual deletion requires dry_run=false AND confirm=delete-all-files.
    """
    if not GOOGLE_SERVICE_ACCOUNT_KEY:
        raise HTTPException(status_code=503, detail="Google Drive not configured")

    if not dry_run and confirm != CLEANUP_CONFIRM_PHRASE:
        raise HTTPException(
            status_code=400,
            detail=(
                "This permanently deletes every file the service account owns. "
                f"To proceed, pass dry_run=false and confirm={CLEANUP_CONFIRM_PHRASE}. "
                "Run with dry_run=true first to see what would be deleted."
            ),
        )

    try:
        drive, _ = _get_services()
        all_files = list_owned_files(drive, fields="id,name")

        if dry_run:
            return {
                "dry_run": True,
                "total_found": len(all_files),
                "would_delete": [
                    {"id": f["id"], "name": f.get("name")} for f in all_files
                ],
                "note": (
                    "No files were deleted. To delete, call again with "
                    f"dry_run=false and confirm={CLEANUP_CONFIRM_PHRASE}."
                ),
            }

        deleted = 0
        errors = []
        for f in all_files:
            try:
                drive.files().delete(fileId=f["id"]).execute()
                deleted += 1
            except Exception as e:
                errors.append({"id": f["id"], "name": f.get("name"), "error": str(e)})

        return {
            "dry_run": False,
            "total_found": len(all_files),
            "deleted": deleted,
            "errors": errors,
        }
    except HTTPException:
        raise
    except GDriveExportError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error("Drive cleanup failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=502, detail=f"Drive cleanup failed: {str(e)}")
