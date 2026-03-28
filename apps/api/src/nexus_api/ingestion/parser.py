"""Module 1, Step 1 -- File Parsing.

Accepts raw uploaded bytes for each supported file type and extracts text
content (or stores raw bytes for images).  Returns a list of ``ParsedFile``
objects that downstream stages concatenate into an AI extraction context.

Supported types:
    .pdf, .docx, .xlsx, .csv, .tsv, .json, .xml, .txt, .md, .png, .jpg/.jpeg

References: docs/01_DATA_INGESTION.md
"""

from __future__ import annotations

import csv
import io
import json
import logging
import xml.etree.ElementTree as ET
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# File-type classification
# ---------------------------------------------------------------------------

_TEXT_TYPES = frozenset({".txt", ".md"})
_IMAGE_TYPES = frozenset({".png", ".jpg", ".jpeg"})

_TYPE_MAP: dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".csv": "csv",
    ".tsv": "tsv",
    ".json": "json",
    ".xml": "xml",
    ".txt": "txt",
    ".md": "md",
    ".png": "png",
    ".jpg": "jpg",
    ".jpeg": "jpg",
}


def _suffix(filename: str) -> str:
    """Return the lower-cased file extension including the leading dot."""
    dot = filename.rfind(".")
    if dot == -1:
        return ""
    return filename[dot:].lower()


# ---------------------------------------------------------------------------
# ParsedFile
# ---------------------------------------------------------------------------

class ParsedFile:
    """Result of parsing a single uploaded file.

    Attributes
    ----------
    filename : str
        Original filename as provided by the uploader.
    file_type : str
        Normalised short type string (``"pdf"``, ``"xlsx"``, ``"jpg"``, ...).
    content : str
        Extracted text content.  For images this is a placeholder noting that
        the image will be sent to Gemini vision.  If parsing failed, this
        contains an error description.
    raw_bytes : bytes | None
        Raw image bytes (only populated for image types).  ``None`` for all
        text-based formats.
    """

    __slots__ = ("content", "file_type", "filename", "raw_bytes")

    def __init__(
        self,
        filename: str,
        file_type: str,
        content: str,
        raw_bytes: bytes | None = None,
    ) -> None:
        self.filename: str = filename
        self.file_type: str = file_type
        self.content: str = content
        self.raw_bytes: bytes | None = raw_bytes

    def __repr__(self) -> str:
        chars = len(self.content)
        img = ", has_image=True" if self.raw_bytes else ""
        return (
            f"ParsedFile({self.filename!r}, type={self.file_type!r}, "
            f"chars={chars}{img})"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "type": self.file_type,
            "chars_extracted": len(self.content),
        }


# ---------------------------------------------------------------------------
# Per-type parsers
# ---------------------------------------------------------------------------

def _parse_pdf(data: bytes) -> str:
    """Extract text from a PDF using PyPDF2."""
    from PyPDF2 import PdfReader  # type: ignore[import-untyped]

    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages.append(f"--- Page {i + 1} ---\n{text}")
    if not pages:
        return "[PDF contained no extractable text -- may be scanned/image-only]"
    return "\n\n".join(pages)


def _parse_docx(data: bytes) -> str:
    """Extract paragraphs and tables from a DOCX."""
    from docx import Document  # type: ignore[import-untyped]

    doc = Document(io.BytesIO(data))
    parts: list[str] = []

    # Paragraphs
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            parts.append(text)

    # Tables -- format as tab-separated rows
    for t_idx, table in enumerate(doc.tables):
        rows: list[str] = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            rows.append("\t".join(cells))
        if rows:
            parts.append(f"\n--- Table {t_idx + 1} ---\n" + "\n".join(rows))

    return "\n".join(parts) if parts else "[DOCX contained no extractable content]"


def _parse_xlsx(data: bytes) -> str:
    """Extract all sheets from an XLSX workbook."""
    from openpyxl import load_workbook  # type: ignore[import-untyped]

    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    parts: list[str] = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows: list[list[str]] = []
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            # Skip completely empty rows
            if any(cells):
                rows.append(cells)

        if not rows:
            continue

        section = f"--- Sheet: {sheet_name} ---\n"

        # First non-empty row is treated as the header
        header = rows[0]
        section += "Headers: " + " | ".join(header) + "\n"

        for row_cells in rows[1:]:
            # Pair header with value where possible for richer context
            pairs: list[str] = []
            for idx, val in enumerate(row_cells):
                if val:
                    col_name = header[idx] if idx < len(header) else f"col{idx}"
                    pairs.append(f"{col_name}: {val}")
            if pairs:
                section += ", ".join(pairs) + "\n"

        parts.append(section)

    wb.close()
    return "\n".join(parts) if parts else "[XLSX contained no data]"


def _parse_csv(data: bytes, delimiter: str = ",") -> str:
    """Parse CSV or TSV content."""
    text = data.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)

    rows: list[list[str]] = []
    for row in reader:
        if any(cell.strip() for cell in row):
            rows.append(row)

    if not rows:
        return "[CSV/TSV contained no data]"

    header = rows[0]
    parts: list[str] = ["Headers: " + " | ".join(header)]

    for row in rows[1:]:
        pairs: list[str] = []
        for idx, val in enumerate(row):
            val = val.strip()
            if val:
                col_name = header[idx].strip() if idx < len(header) else f"col{idx}"
                pairs.append(f"{col_name}: {val}")
        if pairs:
            parts.append(", ".join(pairs))

    return "\n".join(parts)


def _parse_json(data: bytes) -> str:
    """Convert JSON content into a readable text representation.

    Arrays of objects are formatted as ``Header: value`` pairs (similar to
    CSV output) so the AI extraction prompt sees a consistent format.
    Nested objects are flattened with dotted keys.
    """
    text = data.decode("utf-8", errors="replace")
    parsed = json.loads(text)

    # Unwrap a single top-level key that holds the array
    # e.g. {"employees": [{...}, ...]}
    if (
        isinstance(parsed, dict)
        and len(parsed) == 1
        and isinstance(next(iter(parsed.values())), list)
    ):
        parsed = next(iter(parsed.values()))

    # Array of objects → tabular header/value format (like CSV)
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
        return _json_records_to_text(parsed)

    # Fallback: indented JSON with a hint that it's structured data
    return "Structured JSON data:\n" + json.dumps(parsed, indent=2, ensure_ascii=False)


def _flatten_obj(obj: Any, prefix: str = "") -> list[tuple[str, str]]:
    """Flatten a nested dict into ``(dotted_key, value)`` pairs."""
    pairs: list[tuple[str, str]] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            full_key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, dict):
                pairs.extend(_flatten_obj(v, full_key))
            elif isinstance(v, list):
                pairs.append((full_key, ", ".join(str(i) for i in v)))
            else:
                pairs.append((full_key, str(v) if v is not None else ""))
    else:
        pairs.append((prefix or "value", str(obj)))
    return pairs


def _json_records_to_text(records: list[dict[str, Any]]) -> str:
    """Format a list of JSON objects as header/value rows."""
    # Collect all keys across records to build a stable header
    all_keys: list[str] = []
    seen: set[str] = set()
    for record in records:
        for k, _ in _flatten_obj(record):
            if k not in seen:
                all_keys.append(k)
                seen.add(k)

    parts: list[str] = ["Headers: " + " | ".join(all_keys)]

    for record in records:
        flat = dict(_flatten_obj(record))
        pairs: list[str] = []
        for key in all_keys:
            val = flat.get(key, "")
            if val:
                pairs.append(f"{key}: {val}")
        if pairs:
            parts.append(", ".join(pairs))

    return "\n".join(parts)


def _parse_xml(data: bytes) -> str:
    """Extract all text content from an XML document."""
    root = ET.fromstring(data)  # noqa: S314  -- trusted input from user upload
    parts: list[str] = []

    def _walk(elem: ET.Element, depth: int = 0) -> None:
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        text = (elem.text or "").strip()
        tail = (elem.tail or "").strip()
        indent = "  " * depth
        if text:
            parts.append(f"{indent}{tag}: {text}")
        elif any(True for _ in elem):
            # Has children -- just emit the tag for hierarchy
            parts.append(f"{indent}{tag}:")
        if tail:
            parts.append(f"{indent}{tail}")
        for child in elem:
            _walk(child, depth + 1)

    _walk(root)
    return "\n".join(parts) if parts else "[XML contained no text content]"


def _parse_text(data: bytes) -> str:
    """Read plain text / markdown content."""
    return data.decode("utf-8", errors="replace")


def _store_image(filename: str, data: bytes) -> ParsedFile:
    """Store image bytes for later Gemini API call."""
    return ParsedFile(
        filename=filename,
        file_type=_TYPE_MAP.get(_suffix(filename), "image"),
        content=f"[Image: {filename} — {len(data)} bytes, will be processed via Gemini vision]",
        raw_bytes=data,
    )


# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------

_PARSERS: dict[str, Any] = {
    "pdf": _parse_pdf,
    "docx": _parse_docx,
    "xlsx": _parse_xlsx,
    "csv": lambda d: _parse_csv(d, delimiter=","),
    "tsv": lambda d: _parse_csv(d, delimiter="\t"),
    "json": _parse_json,
    "xml": _parse_xml,
    "txt": _parse_text,
    "md": _parse_text,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_file(filename: str, content: bytes) -> ParsedFile:
    """Parse a single uploaded file and return a :class:`ParsedFile`.

    Parameters
    ----------
    filename:
        Original filename including extension.
    content:
        Raw file bytes.

    Returns
    -------
    ParsedFile
        Always returns a result.  If parsing fails the ``content`` field will
        contain an error message rather than raising an exception.
    """
    ext = _suffix(filename)
    file_type = _TYPE_MAP.get(ext, "unknown")

    # Images -- store raw bytes, no text extraction here
    if ext in _IMAGE_TYPES:
        return _store_image(filename, content)

    parser = _PARSERS.get(file_type)
    if parser is None:
        return ParsedFile(
            filename=filename,
            file_type=file_type,
            content=f"[Unsupported file type: {ext!r}]",
        )

    try:
        text: str = parser(content)
    except Exception as exc:
        logger.warning("Failed to parse %s: %s", filename, exc, exc_info=True)
        return ParsedFile(
            filename=filename,
            file_type=file_type,
            content=f"[Error parsing {filename}: {exc}]",
        )

    return ParsedFile(
        filename=filename,
        file_type=file_type,
        content=text,
    )


def parse_files(files: list[tuple[str, bytes]]) -> list[ParsedFile]:
    """Parse multiple files.

    Parameters
    ----------
    files:
        List of ``(filename, raw_bytes)`` tuples.

    Returns
    -------
    list[ParsedFile]
        One ``ParsedFile`` per input, in the same order.
    """
    return [parse_file(name, data) for name, data in files]
