"""Google Drive/Docs export service."""
from __future__ import annotations
import json
import logging
import re
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
]

_drive = None
_docs = None
_folder_cache: dict = {}


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


def _find_or_create_folder(drive, name: str, parent_id: str) -> str:
    cache_key = f"{parent_id}/{name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    query = (
        f"name='{name}' and '{parent_id}' in parents "
        f"and mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    results = drive.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])

    if files:
        folder_id = files[0]["id"]
    else:
        meta = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        folder = drive.files().create(body=meta, fields="id").execute()
        folder_id = folder["id"]

    _folder_cache[cache_key] = folder_id
    return folder_id


def _markdown_to_docs_requests(markdown: str) -> list:
    """Convert markdown to Google Docs API batchUpdate requests."""
    requests = []
    index = 1

    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            text = "\n"
            requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            index += len(text)
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2) + "\n"
            requests.append({
                "insertText": {"location": {"index": index}, "text": text}
            })
            style_map = {
                1: "HEADING_1", 2: "HEADING_2", 3: "HEADING_3",
                4: "HEADING_4", 5: "HEADING_5", 6: "HEADING_6",
            }
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": index, "endIndex": index + len(text)},
                    "paragraphStyle": {"namedStyleType": style_map.get(level, "HEADING_3")},
                    "fields": "namedStyleType",
                }
            })
            index += len(text)
            continue

        text = stripped + "\n"
        requests.append({
            "insertText": {"location": {"index": index}, "text": text}
        })
        index += len(text)

    return requests


def export_to_drive(
    title: str, content: str, brand_name: str, city: str
) -> dict:
    drive, docs = _get_services()

    # Try creating via Docs API (bypasses Drive file creation quota check)
    try:
        doc = docs.documents().create(body={"title": title}).execute()
        doc_id = doc["documentId"]

        # Insert content
        docs.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{"insertText": {"location": {"index": 1}, "text": content}}]},
        ).execute()

        # Move to shared folder
        if GOOGLE_DRIVE_FOLDER_ID:
            try:
                file_info = drive.files().get(
                    fileId=doc_id, fields="parents", supportsAllDrives=True,
                ).execute()
                previous_parents = ",".join(file_info.get("parents", []))
                drive.files().update(
                    fileId=doc_id,
                    addParents=GOOGLE_DRIVE_FOLDER_ID,
                    removeParents=previous_parents,
                    fields="id",
                    supportsAllDrives=True,
                ).execute()
            except Exception as move_err:
                logger.warning(f"Could not move doc to folder: {move_err}")

        doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
        return {"doc_url": doc_url, "doc_id": doc_id}

    except Exception as e:
        logger.warning(f"Docs API creation failed ({e}), trying HTML upload")

        # Fallback: upload as HTML file (converts to Google Doc in shared folder)
        import io
        from googleapiclient.http import MediaIoBaseUpload

        html = f"<html><body><h1>{title}</h1><pre>{content}</pre></body></html>"
        media = MediaIoBaseUpload(
            io.BytesIO(html.encode("utf-8")),
            mimetype="text/html",
        )
        file_meta = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [GOOGLE_DRIVE_FOLDER_ID] if GOOGLE_DRIVE_FOLDER_ID else [],
        }
        doc_file = drive.files().create(
            body=file_meta, media_body=media,
            fields="id", supportsAllDrives=True,
        ).execute()
        doc_id = doc_file["id"]
        doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
        return {"doc_url": doc_url, "doc_id": doc_id}
