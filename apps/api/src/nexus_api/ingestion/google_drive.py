"""Google Drive folder import for Module 1 ingestion.

Fetches supported files from a Drive folder recursively, exporting Google
Workspace documents into parseable formats before handing them to the
existing ingestion pipeline.

References: docs/01_DATA_INGESTION.md, docs/05_API.md
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, cast

logger = logging.getLogger(__name__)

_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
_ALLOWED_NETLOCS = frozenset({"www.googleapis.com", "googleapis.com"})

_SUPPORTED_EXTENSIONS = frozenset(
    {
        ".pdf",
        ".docx",
        ".xlsx",
        ".csv",
        ".tsv",
        ".json",
        ".xml",
        ".txt",
        ".md",
        ".png",
        ".jpg",
        ".jpeg",
    }
)

_DOWNLOADABLE_MIME_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/csv": ".csv",
    "text/tab-separated-values": ".tsv",
    "application/json": ".json",
    "application/xml": ".xml",
    "text/xml": ".xml",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}

_GOOGLE_EXPORTS: dict[str, tuple[str, str]] = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.drawing": ("image/png", ".png"),
}


class GoogleDriveImportError(RuntimeError):
    """Raised when Google Drive import fails."""


@dataclass(slots=True)
class DriveFolderSummary:
    id: str
    name: str
    file_count: int
    files_skipped: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "file_count": self.file_count,
            "files_skipped": self.files_skipped,
        }


@dataclass(slots=True)
class DriveImportBundle:
    folder: DriveFolderSummary
    files: list[tuple[str, bytes]]


def extract_folder_id(value: str) -> str:
    """Parse a Google Drive folder id from a raw id or URL."""
    candidate = value.strip()
    if not candidate:
        raise GoogleDriveImportError("Google Drive folder id is required.")

    patterns = [
        r"/folders/([a-zA-Z0-9_-]+)",
        r"[?&]id=([a-zA-Z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, candidate)
        if match:
            return match.group(1)

    if re.fullmatch(r"[a-zA-Z0-9_-]{10,}", candidate):
        return candidate

    raise GoogleDriveImportError("Could not determine the Google Drive folder id.")


def _authorized_get_json(url: str, access_token: str) -> dict[str, Any]:
    _validate_google_url(url)
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("Google Drive API request failed: %s", body)
        raise GoogleDriveImportError(_google_error_message(body, exc.code)) from exc
    except urllib.error.URLError as exc:
        raise GoogleDriveImportError(f"Google Drive request failed: {exc.reason}") from exc

    return cast("dict[str, Any]", json.loads(payload))


def _authorized_get_bytes(url: str, access_token: str) -> bytes:
    _validate_google_url(url)
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return cast("bytes", response.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("Google Drive download failed: %s", body)
        raise GoogleDriveImportError(_google_error_message(body, exc.code)) from exc
    except urllib.error.URLError as exc:
        raise GoogleDriveImportError(f"Google Drive download failed: {exc.reason}") from exc


def _google_error_message(body: str, status: int) -> str:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return f"Google Drive API error ({status})."

    error = parsed.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message.strip():
            return f"Google Drive API error: {message}"

    return f"Google Drive API error ({status})."


def _validate_google_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise GoogleDriveImportError("Google Drive requests must use HTTPS.")
    if parsed.netloc not in _ALLOWED_NETLOCS:
        raise GoogleDriveImportError("Unsupported Google Drive API host.")


def _drive_url(path: str, **query: str) -> str:
    encoded = urllib.parse.urlencode(query)
    return f"{_DRIVE_API_BASE}{path}?{encoded}"


def _list_children(access_token: str, folder_id: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page_token = ""

    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": (
                "nextPageToken,files("
                "id,name,mimeType,size,"
                "shortcutDetails(targetId,targetMimeType)"
                ")"
            ),
            "pageSize": "1000",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        if page_token:
            params["pageToken"] = page_token

        payload = _authorized_get_json(_drive_url("/files", **params), access_token)
        files = payload.get("files", [])
        if isinstance(files, list):
            items.extend(file for file in files if isinstance(file, dict))

        page_token = str(payload.get("nextPageToken", "")).strip()
        if not page_token:
            break

    return items


def _get_file_metadata(access_token: str, file_id: str) -> dict[str, Any]:
    return _authorized_get_json(
        _drive_url(
            f"/files/{urllib.parse.quote(file_id)}",
            fields="id,name,mimeType",
            supportsAllDrives="true",
        ),
        access_token,
    )


def _resolve_shortcut(item: dict[str, Any]) -> dict[str, Any]:
    details = item.get("shortcutDetails")
    if not isinstance(details, dict):
        return item

    target_id = details.get("targetId")
    target_mime = details.get("targetMimeType")
    if not isinstance(target_id, str) or not isinstance(target_mime, str):
        return item

    return {
        **item,
        "id": target_id,
        "mimeType": target_mime,
        "name": str(item.get("name", "shortcut")),
    }


def _extension_for_item(item: dict[str, Any]) -> str:
    name = str(item.get("name", ""))
    dot = name.rfind(".")
    if dot != -1:
        return name[dot:].lower()

    mime_type = str(item.get("mimeType", ""))
    return _DOWNLOADABLE_MIME_TYPES.get(mime_type, "")


def _download_drive_file(access_token: str, item: dict[str, Any]) -> tuple[str, bytes] | None:
    file_id = str(item.get("id", ""))
    name = str(item.get("name", "file"))
    mime_type = str(item.get("mimeType", ""))

    if mime_type in _GOOGLE_EXPORTS:
        export_mime, extension = _GOOGLE_EXPORTS[mime_type]
        filename = name if name.lower().endswith(extension) else f"{name}{extension}"
        content = _authorized_get_bytes(
            _drive_url(
                f"/files/{urllib.parse.quote(file_id)}/export",
                mimeType=export_mime,
                supportsAllDrives="true",
            ),
            access_token,
        )
        return (filename, content)

    extension = _extension_for_item(item)
    if extension not in _SUPPORTED_EXTENSIONS:
        return None

    filename = name if name.lower().endswith(extension) else f"{name}{extension}"
    content = _authorized_get_bytes(
        _drive_url(
            f"/files/{urllib.parse.quote(file_id)}",
            alt="media",
            supportsAllDrives="true",
        ),
        access_token,
    )
    return (filename, content)


def import_drive_folder(access_token: str, folder_id: str) -> DriveImportBundle:
    """Recursively fetch supported files from a Drive folder."""
    folder = _get_file_metadata(access_token, folder_id)
    folder_name = str(folder.get("name", "Google Drive folder"))

    stack = [folder_id]
    seen_folders: set[str] = set()
    files: list[tuple[str, bytes]] = []
    skipped = 0

    while stack:
        current_folder_id = stack.pop()
        if current_folder_id in seen_folders:
            continue
        seen_folders.add(current_folder_id)

        for raw_item in _list_children(access_token, current_folder_id):
            item = _resolve_shortcut(raw_item)
            mime_type = str(item.get("mimeType", ""))
            item_id = str(item.get("id", ""))

            if mime_type == "application/vnd.google-apps.folder":
                if item_id:
                    stack.append(item_id)
                continue

            try:
                downloaded = _download_drive_file(access_token, item)
            except GoogleDriveImportError:
                raise
            except Exception as exc:
                logger.warning("Skipping Drive file %s after error: %s", item, exc, exc_info=True)
                skipped += 1
                continue

            if downloaded is None:
                skipped += 1
                continue

            files.append(downloaded)

    if not files:
        raise GoogleDriveImportError("No supported files were found in that Google Drive folder.")

    return DriveImportBundle(
        folder=DriveFolderSummary(
            id=folder_id,
            name=folder_name,
            file_count=len(files),
            files_skipped=skipped,
        ),
        files=files,
    )
