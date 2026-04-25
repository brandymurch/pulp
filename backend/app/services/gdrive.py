"""Google Drive/Docs export service."""
from __future__ import annotations
import json
import logging
import re
from googleapiclient.errors import HttpError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]

_drive = None
_docs = None
_folder_cache: dict = {}


class GDriveExportError(Exception):
    """Raised when Drive export cannot complete due to configuration or API errors."""

    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


def _extract_google_error(exc: HttpError) -> str:
    try:
        payload = json.loads(exc.content.decode("utf-8"))
    except Exception:
        return str(exc)

    error = payload.get("error", {})
    message = error.get("message")
    errors = error.get("errors") or []
    reasons = [item.get("reason") for item in errors if item.get("reason")]
    if "storageQuotaExceeded" in reasons:
        return (
            f"{message or 'The service account cannot create Drive files because it has no storage quota.'} "
            "Service accounts cannot own Drive files. Set GOOGLE_DRIVE_FOLDER_ID to a folder inside "
            "a Google Shared Drive and add the service account as a Content manager, or use OAuth "
            "to create files as a human Google user."
        )
    if "teamDriveMembershipRequired" in reasons:
        return (
            f"{message or 'The service account is not a member of the target Shared Drive.'} "
            "Add the service account email to the Shared Drive with permission to add files."
        )
    if "insufficientFilePermissions" in reasons or "notFound" in reasons:
        return (
            f"{message or 'The service account cannot access the configured Drive folder.'} "
            "Check GOOGLE_DRIVE_FOLDER_ID and make sure the service account has write access."
        )
    if message and reasons:
        return f"{message} ({', '.join(reasons)})"
    if message:
        return message
    return str(exc)


def _get_services():
    global _drive, _docs
    if _drive is None:
        creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_KEY)
        creds = service_account.Credentials.from_service_account_info(
            creds_dict, scopes=SCOPES
        )
        _drive = build("drive", "v3", credentials=creds)
        _docs = build("docs", "v1", credentials=creds)
    return _drive, _docs


def _escape_drive_query(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _require_drive_folder_id() -> str:
    folder_id = GOOGLE_DRIVE_FOLDER_ID.strip()
    if not folder_id:
        raise GDriveExportError(
            "GOOGLE_DRIVE_FOLDER_ID is not configured. It must be the ID of a folder inside "
            "a Google Shared Drive that the service account can write to.",
            status_code=503,
        )
    return folder_id


def _get_file_metadata(drive, file_id: str) -> dict:
    return drive.files().get(
        fileId=file_id,
        fields="id,name,mimeType,parents,driveId,capabilities(canAddChildren)",
        supportsAllDrives=True,
    ).execute()


def _ensure_shared_drive_folder(drive, folder_id: str) -> dict:
    folder_id = folder_id.strip()
    if not folder_id:
        raise GDriveExportError(
            "GOOGLE_DRIVE_FOLDER_ID is not configured. It must be the ID of a folder inside "
            "a Google Shared Drive that the service account can write to.",
            status_code=503,
        )

    try:
        folder = _get_file_metadata(drive, folder_id)
    except HttpError as exc:
        raise GDriveExportError(
            f"Could not access GOOGLE_DRIVE_FOLDER_ID `{folder_id}`: {_extract_google_error(exc)}"
        ) from exc

    if folder.get("mimeType") != "application/vnd.google-apps.folder":
        raise GDriveExportError(
            "GOOGLE_DRIVE_FOLDER_ID must point to a Google Drive folder."
        )

    if not folder.get("driveId"):
        raise GDriveExportError(
            "Google Drive export requires GOOGLE_DRIVE_FOLDER_ID to be inside a Shared Drive. "
            "Regular shared folders still make the service account own the Doc, which triggers "
            "`storageQuotaExceeded`."
        )

    if folder.get("capabilities", {}).get("canAddChildren") is False:
        raise GDriveExportError(
            "The service account can see GOOGLE_DRIVE_FOLDER_ID but cannot add files there. "
            "Add it to the Shared Drive as a Content manager or higher."
        )

    return folder


def _find_or_create_folder(drive, name: str, parent_id: str) -> str:
    cache_key = f"{parent_id}/{name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    query = (
        f"name='{_escape_drive_query(name)}' and '{parent_id}' in parents "
        f"and mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    results = drive.files().list(
        q=query,
        fields="files(id)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    files = results.get("files", [])

    if files:
        folder_id = files[0]["id"]
    else:
        meta = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        folder = drive.files().create(
            body=meta,
            fields="id",
            supportsAllDrives=True,
        ).execute()
        folder_id = folder["id"]

    _folder_cache[cache_key] = folder_id
    return folder_id


def _title_case(text: str) -> str:
    """Title Case a heading - capitalize first letter of every word."""
    minor_words = {"a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
                   "in", "on", "at", "to", "by", "of", "up", "as", "is", "if"}
    words = text.split()
    result = []
    for i, word in enumerate(words):
        if i == 0 or word.lower() not in minor_words:
            result.append(word[0].upper() + word[1:] if word else word)
        else:
            result.append(word.lower())
    return " ".join(result)


def _markdown_to_docs_requests(markdown: str) -> list:
    """Convert markdown to Google Docs API batchUpdate requests.

    Handles: headings, bold, italic, bullet lists, numbered lists.
    """
    insert_requests = []
    style_requests = []
    index = 1

    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            insert_requests.append({
                "insertText": {"location": {"index": index}, "text": "\n"}
            })
            index += 1
            continue

        # Heading
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            raw_heading = heading_match.group(2)
            # Strip any inline markdown from heading text
            clean_heading = re.sub(r"\*{1,2}(.+?)\*{1,2}", r"\1", raw_heading)
            text = _title_case(clean_heading) + "\n"
            insert_requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            style_map = {
                1: "HEADING_1", 2: "HEADING_2", 3: "HEADING_3",
                4: "HEADING_4", 5: "HEADING_5", 6: "HEADING_6",
            }
            style_requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": index, "endIndex": index + len(text)},
                    "paragraphStyle": {"namedStyleType": style_map.get(level, "HEADING_3")},
                    "fields": "namedStyleType",
                }
            })
            index += len(text)
            continue

        # Bullet list
        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        if bullet_match:
            line_content = bullet_match.group(1)
            text, bold_ranges = _process_inline_formatting(line_content, index)
            text += "\n"
            insert_requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            style_requests.append({
                "createParagraphBullets": {
                    "range": {"startIndex": index, "endIndex": index + len(text)},
                    "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
                }
            })
            style_requests.extend(bold_ranges)
            index += len(text)
            continue

        # Numbered list
        num_match = re.match(r"^\d+[.)]\s+(.+)$", stripped)
        if num_match:
            line_content = num_match.group(1)
            text, bold_ranges = _process_inline_formatting(line_content, index)
            text += "\n"
            insert_requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            style_requests.append({
                "createParagraphBullets": {
                    "range": {"startIndex": index, "endIndex": index + len(text)},
                    "bulletPreset": "NUMBERED_DECIMAL_NESTED",
                }
            })
            style_requests.extend(bold_ranges)
            index += len(text)
            continue

        # Regular paragraph
        text, bold_ranges = _process_inline_formatting(stripped, index)
        text += "\n"
        insert_requests.append({
            "insertText": {"location": {"index": index}, "text": text}
        })
        style_requests.extend(bold_ranges)
        index += len(text)

    # Insert text first, then apply formatting
    return insert_requests + style_requests


def _process_inline_formatting(text: str, base_index: int) -> tuple:
    """Strip markdown bold/italic markers, return clean text + formatting requests."""
    formatting_requests = []
    clean = ""
    i = 0
    chars = list(text)

    while i < len(chars):
        # Bold: **text**
        if i < len(chars) - 1 and chars[i] == "*" and chars[i + 1] == "*":
            end = text.find("**", i + 2)
            if end != -1:
                bold_text = text[i + 2:end]
                start_idx = base_index + len(clean)
                clean += bold_text
                formatting_requests.append({
                    "updateTextStyle": {
                        "range": {"startIndex": start_idx, "endIndex": start_idx + len(bold_text)},
                        "textStyle": {"bold": True},
                        "fields": "bold",
                    }
                })
                i = end + 2
                continue
        # Italic: *text* (single)
        if chars[i] == "*" and (i == 0 or chars[i - 1] != "*"):
            end = text.find("*", i + 1)
            if end != -1 and (end + 1 >= len(chars) or chars[end + 1] != "*"):
                italic_text = text[i + 1:end]
                start_idx = base_index + len(clean)
                clean += italic_text
                formatting_requests.append({
                    "updateTextStyle": {
                        "range": {"startIndex": start_idx, "endIndex": start_idx + len(italic_text)},
                        "textStyle": {"italic": True},
                        "fields": "italic",
                    }
                })
                i = end + 1
                continue
        clean += chars[i]
        i += 1

    return clean, formatting_requests


def export_to_drive(
    title: str, content: str, brand_name: str, city: str
) -> dict:
    drive, docs = _get_services()
    try:
        root_folder_id = _require_drive_folder_id()
        _ensure_shared_drive_folder(drive, root_folder_id)
        brand_folder = _find_or_create_folder(
            drive, (brand_name or "Uncategorized").strip(), root_folder_id
        )
        target_folder = brand_folder
        cleaned_city = (city or "").strip()
        if cleaned_city:
            target_folder = _find_or_create_folder(drive, cleaned_city, brand_folder)

        file_meta = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [target_folder],
        }
        doc_file = drive.files().create(
            body=file_meta,
            fields="id,webViewLink",
            supportsAllDrives=True,
        ).execute()
        doc_id = doc_file["id"]

        doc_requests = _markdown_to_docs_requests(content)
        if doc_requests:
            docs.documents().batchUpdate(
                documentId=doc_id,
                body={"requests": doc_requests},
            ).execute()

        doc_url = doc_file.get("webViewLink") or f"https://docs.google.com/document/d/{doc_id}/edit"
        return {"doc_url": doc_url, "doc_id": doc_id}
    except GDriveExportError:
        raise
    except HttpError as exc:
        message = _extract_google_error(exc)
        logger.error("Drive export Google API error: %s", message)
        raise GDriveExportError(message) from exc
    except Exception as exc:
        logger.error("Drive export unexpected error: %s", exc)
        raise
