"""Notion template fetching and markdown conversion."""
from __future__ import annotations
import logging
import re
import uuid
from typing import Any, Optional
from notion_client import Client
from app.config import NOTION_API_KEY, NOTION_DATABASE_ID

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def _normalize_database_id(raw_id: str) -> str:
    """Ensure the database ID is in UUID format with hyphens."""
    clean = raw_id.replace("-", "")
    return str(uuid.UUID(clean))


def _get_client() -> Client:
    global _client
    if _client is None:
        if not NOTION_API_KEY:
            raise RuntimeError("NOTION_API_KEY not configured")
        _client = Client(auth=NOTION_API_KEY)
    return _client


def _extract_title(prop: dict) -> str:
    return "".join(t.get("plain_text", "") for t in (prop.get("title") or []))


def _extract_select(prop: dict) -> str:
    sel = prop.get("select")
    return sel.get("name", "") if sel else ""


def _extract_rich_text(prop: dict) -> str:
    return "".join(t.get("plain_text", "") for t in (prop.get("rich_text") or []))


def _page_to_summary(page: dict) -> dict[str, Any]:
    props = page.get("properties", {})
    return {
        "id": page["id"],
        "name": _extract_title(props.get("Page Name", props.get("Name", {}))),
        "brand": _extract_select(props.get("Brand", {})),
        "page_type": _extract_select(props.get("Page Type", {})),
        "status": _extract_select(props.get("Status", {})),
        "seo_title_format": _extract_rich_text(
            props.get("SEO Title - Use Format", props.get("SEO Title", {}))
        ),
        "meta_description_format": _extract_rich_text(
            props.get("Meta Description Format", props.get("Meta Description", {}))
        ),
        "url_format": _extract_rich_text(props.get("URL Format", {})),
        "source": "notion",
        "updated_at": page.get("last_edited_time", ""),
    }


def _blocks_to_markdown(blocks: list[dict]) -> str:
    lines: list[str] = []
    for block in blocks:
        btype = block.get("type", "")
        data = block.get(btype, {})
        rich_text = data.get("rich_text") or data.get("text") or []
        text = "".join(t.get("plain_text", "") for t in rich_text)

        if btype == "heading_1":
            lines.append(f"# {text}")
        elif btype == "heading_2":
            lines.append(f"## {text}")
        elif btype == "heading_3":
            lines.append(f"### {text}")
        elif btype == "paragraph":
            lines.append(text)
        elif btype == "bulleted_list_item":
            lines.append(f"- {text}")
        elif btype == "numbered_list_item":
            lines.append(f"1. {text}")
        elif btype == "code":
            lang = data.get("language", "")
            lines.append(f"```{lang}\n{text}\n```")
        elif btype == "quote":
            lines.append(f"> {text}")
        elif btype == "divider":
            lines.append("---")
        elif btype == "toggle":
            lines.append(f"**{text}**")

        if block.get("has_children"):
            child_blocks = (
                _get_client()
                .blocks.children.list(block_id=block["id"])
                .get("results", [])
            )
            child_md = _blocks_to_markdown(child_blocks)
            for cl in child_md.split("\n"):
                lines.append(f"  {cl}")

    return "\n\n".join(lines)


def list_templates(brand: Optional[str] = None) -> list[dict]:
    client = _get_client()
    body: dict[str, Any] = {}
    if brand:
        body["filter"] = {"property": "Brand", "select": {"equals": brand}}
    body["sorts"] = [
        {"property": "Brand", "direction": "ascending"},
        {"property": "Page Type", "direction": "ascending"},
    ]

    db_id = _normalize_database_id(NOTION_DATABASE_ID)
    result = client.request(
        path=f"databases/{db_id}/query",
        method="POST",
        body=body,
    )

    return [_page_to_summary(page) for page in result.get("results", [])]


def get_template(page_id: str) -> dict[str, Any]:
    client = _get_client()
    page = client.pages.retrieve(page_id=page_id)
    summary = _page_to_summary(page)

    blocks_resp = client.blocks.children.list(block_id=page_id)
    blocks = blocks_resp.get("results", [])
    content = _blocks_to_markdown(blocks)

    # Strip images
    content = re.sub(r"!\[.*?\]\(data:image/[^)]+\)", "", content)
    content = re.sub(r"!\[.*?\]\(https?://[^)]+\)", "<Image>", content)
    content = re.sub(r"\n{3,}", "\n\n", content).strip()

    return {**summary, "content": content}
