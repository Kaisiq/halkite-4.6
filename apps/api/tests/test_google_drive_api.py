from __future__ import annotations

import os
from types import SimpleNamespace

from httpx import ASGITransport, AsyncClient

os.environ.setdefault("GEMINI_API_KEY", "test-key")

from nexus_api.main import app


async def test_google_drive_import_persists_standard(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("HALKANTIR_DATA_DIR", str(tmp_path))

    graph_result = SimpleNamespace(
        files_parsed=[],
        graph=SimpleNamespace(
            nodes=[],
            edges=[],
            layers=[],
            network_health=lambda: 1.0,
        ),
        r_unit="days",
        confidence=0.9,
        gaps=[],
        follow_up_questions=[],
        standard=SimpleNamespace(company="Acme"),
    )
    drive_bundle = SimpleNamespace(
        files=[("org.json", b"{}")],
        folder=SimpleNamespace(
            to_dict=lambda: {
                "id": "folder123",
                "name": "Ops",
                "file_count": 1,
                "files_skipped": 0,
            }
        ),
    )

    async def fake_ingest(files, description):
        assert files == drive_bundle.files
        assert description == "desc"
        return graph_result

    monkeypatch.setattr("nexus_api.ingestion.extractor.ingest", fake_ingest)
    monkeypatch.setattr(
        "nexus_api.ingestion.google_drive.import_drive_folder",
        lambda access_token, folder_id: drive_bundle,
    )
    monkeypatch.setattr(
        "nexus_api.ingestion.google_drive.extract_folder_id",
        lambda folder_id: folder_id,
    )

    saved = {}

    def fake_save_standard(session_id, standard):
        saved["session_id"] = session_id
        saved["standard"] = standard

    monkeypatch.setattr("nexus_api.ingestion.standard.save_standard", fake_save_standard)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/google-drive/import",
            json={
                "access_token": "token",
                "folder_id": "folder123",
                "description": "desc",
            },
        )

    assert response.status_code == 200
    assert saved["standard"] is graph_result.standard
