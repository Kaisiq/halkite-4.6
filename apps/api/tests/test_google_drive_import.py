from __future__ import annotations

from nexus_api.ingestion.google_drive import extract_folder_id


def test_extract_folder_id_from_folders_url() -> None:
    value = "https://drive.google.com/drive/folders/abcDEF123_-xyz?usp=sharing"
    assert extract_folder_id(value) == "abcDEF123_-xyz"


def test_extract_folder_id_from_query_param() -> None:
    value = "https://drive.google.com/open?id=folder_12345ABCDE"
    assert extract_folder_id(value) == "folder_12345ABCDE"


def test_extract_folder_id_from_raw_id() -> None:
    assert extract_folder_id("folder_12345ABCDE") == "folder_12345ABCDE"
