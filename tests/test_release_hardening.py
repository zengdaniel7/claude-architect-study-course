from __future__ import annotations

import shutil
import stat
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_legacy_archive  # noqa: E402
import release_identity  # noqa: E402
import start_studio  # noqa: E402
import run_studio_runtime  # noqa: E402


def make_dist(path: Path, label: str) -> dict[str, object]:
    path.mkdir(parents=True, exist_ok=True)
    (path / "index.html").write_text(f"<main>{label}</main>\n", encoding="utf-8")
    (path / "assets").mkdir()
    (path / "assets" / "main.js").write_text(f"console.log({label!r});\n", encoding="utf-8")
    return release_identity.write_release(path)


def test_release_rejects_stale_dist_and_hash_mismatch(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    document = make_dist(dist, "one")
    assert document["appId"] == "ccaf-study-studio"
    assert document["supportedSchemaMin"] == document["supportedSchemaMax"] == 3
    assert document["manifestHash"]
    assert document["backendContentSha256"]

    (dist / "assets" / "foreign.js").write_text("unexpected\n", encoding="utf-8")
    with pytest.raises(ValueError, match="file set mismatch"):
        release_identity.verify_release(dist)

    (dist / "assets" / "foreign.js").unlink()
    (dist / "assets" / "main.js").write_text("tampered\n", encoding="utf-8")
    with pytest.raises(ValueError, match="hash mismatch"):
        release_identity.verify_release(dist)


def test_release_id_includes_backend_and_manifest_identity() -> None:
    frontend = "frontend"
    assert release_identity.release_id(frontend, "backend-one", "manifest") != release_identity.release_id(
        frontend, "backend-two", "manifest"
    )
    assert release_identity.release_id(frontend, "backend-one", "manifest") != release_identity.release_id(
        frontend, "backend-one", "other-manifest"
    )


def test_backend_identity_covers_the_production_control_plane() -> None:
    relative = {path.relative_to(ROOT).as_posix() for path in release_identity._backend_files(ROOT)}
    assert {
        "scripts/build_legacy_archive.py",
        "scripts/release_identity.py",
        "scripts/run_frontier_mcp.py",
        "scripts/run_studio_runtime.py",
        "scripts/start_studio.py",
        "studio_server/app.py",
        "studio_server/legacy_assets.py",
        "studio_server/mcp_server.py",
    } <= relative


def test_interrupted_site_copy_keeps_previous_verified_release(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    source = tmp_path / "source"
    target = tmp_path / "site"
    make_dist(source, "new")
    old_release = make_dist(target, "old")
    cache = tmp_path / "cache"
    cache.mkdir()
    monkeypatch.setattr(start_studio, "CACHE", cache)
    original_copytree = start_studio.shutil.copytree

    def interrupted_copytree(source_path: Path, destination: Path, *args: object, **kwargs: object) -> Path:
        original_copytree(source_path, destination, *args, **kwargs)
        raise OSError("simulated interrupted copy")

    monkeypatch.setattr(start_studio.shutil, "copytree", interrupted_copytree)
    with pytest.raises(OSError, match="interrupted"):
        start_studio.sync_site(source, target)

    assert release_identity.verify_release(target)["releaseId"] == old_release["releaseId"]
    assert not (target.with_name("site.previous")).exists()
    assert not list(cache.glob("site-*.tmp"))

    monkeypatch.setattr(start_studio.shutil, "copytree", original_copytree)
    new_release = start_studio.sync_site(source, target)
    assert new_release["releaseId"] != old_release["releaseId"]
    assert release_identity.verify_release(target)["releaseId"] == new_release["releaseId"]
    assert release_identity.verify_release(target.with_name("site.previous"))["releaseId"] == old_release["releaseId"]


def test_tampered_cached_app_is_detected_and_rebuilt(tmp_path: Path) -> None:
    target = tmp_path / "app"
    cache = tmp_path / "cache"
    expected = release_identity.backend_content_hash(ROOT)
    start_studio.sync_app(ROOT, target, cache)
    assert start_studio.verify_app_cache(target, expected)["backendContentSha256"] == expected

    cached_app = target / "studio_server" / "app.py"
    cached_app.write_text(cached_app.read_text(encoding="utf-8") + "\n# tampered\n", encoding="utf-8")
    with pytest.raises(ValueError, match="file hash"):
        start_studio.verify_app_cache(target, expected)

    start_studio.sync_app(ROOT, target, cache)
    assert start_studio.verify_app_cache(target, expected)["backendContentSha256"] == expected
    assert "# tampered" not in cached_app.read_text(encoding="utf-8")


def test_archive_signature_uses_metadata_without_reading_contents(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    source = tmp_path / "source"
    archive = tmp_path / "archive"
    source.mkdir()
    archive.mkdir()
    relative = "lesson.html"
    (source / relative).write_text("lesson", encoding="utf-8")
    (archive / relative).write_text("lesson", encoding="utf-8")
    monkeypatch.setattr(start_studio, "LEGACY_ASSETS", frozenset({relative}))
    monkeypatch.setattr(start_studio, "verify_archive", lambda path: True)

    first = start_studio.archive_source_signature(source)
    assert start_studio.cached_archive_matches_source(source, archive) is True
    time.sleep(0.001)
    (source / relative).touch()
    assert start_studio.archive_source_signature(source) != first


def test_sync_archive_reuses_verified_matching_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "source"
    cache = tmp_path / "cache"
    archive = cache / "legacy"
    root.mkdir()
    archive.mkdir(parents=True)
    relative = "lesson.html"
    (root / relative).write_text("lesson", encoding="utf-8")
    (archive / relative).write_text("lesson", encoding="utf-8")
    marker = cache / ".legacy-source-signature"
    monkeypatch.setattr(start_studio, "ROOT", root)
    monkeypatch.setattr(start_studio, "CACHE", cache)
    monkeypatch.setattr(start_studio, "ARCHIVE", archive)
    monkeypatch.setattr(start_studio, "LEGACY_SIGNATURE", marker)
    monkeypatch.setattr(start_studio, "LEGACY_ASSETS", frozenset({relative}))
    monkeypatch.setattr(start_studio, "verify_archive", lambda path: True)
    monkeypatch.setattr(start_studio, "build_archive", lambda source, destination: pytest.fail("cache should be reused"))

    start_studio.sync_archive()
    assert marker.read_text(encoding="utf-8") == start_studio.archive_source_signature(root)


def test_legacy_archive_contains_only_allowlisted_generated_assets(tmp_path: Path) -> None:
    source = tmp_path / "source"
    archive = tmp_path / "archive"
    for relative in build_legacy_archive.LEGACY_ASSETS:
        source_path = ROOT / relative
        target = source / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target)
    (source / "studio_server").mkdir()
    (source / "studio_server" / "app.py").write_text("private support code", encoding="utf-8")
    (source / ".git").mkdir()
    (source / ".git" / "config").write_text("private metadata", encoding="utf-8")
    (source / "notes.md").write_text("not a legacy asset", encoding="utf-8")
    (source / "my-progress.backup.json").write_text("private progress", encoding="utf-8")
    (source / "my-progress.json").write_text('{"ts":1,"data":{}}', encoding="utf-8")

    build_legacy_archive.build_archive(source, archive)

    assert build_legacy_archive.verify_archive(archive)
    assert not (archive / "studio_server").exists()
    assert not (archive / ".git").exists()
    assert not (archive / "notes.md").exists()
    assert not (archive / "my-progress.backup.json").exists()
    assert (archive / "my-progress.json").is_file()
    assert stat.S_IMODE((archive / "my-progress.json").stat().st_mode) == 0o600
    assert stat.S_IMODE(archive.stat().st_mode) == 0o700


def test_long_setup_heartbeat_reports_before_thirty_seconds(capsys: pytest.CaptureFixture[str]) -> None:
    result = build_legacy_archive.run_with_heartbeat(
        "[test-setup]",
        lambda: time.sleep(0.035) or "done",
        interval_seconds=0.01,
    )

    assert result == "done"
    assert "[test-setup] Still working..." in capsys.readouterr().out


class FakeResponse:
    def __init__(self, payload: dict[str, object], status: int = 200) -> None:
        self.payload = payload
        self.status = status

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        import json

        return json.dumps(self.payload).encode("utf-8")


def test_launcher_rejects_foreign_health_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = "sha256:expected"

    def foreign_urlopen(url: str, timeout: float) -> FakeResponse:
        assert timeout == 0.5
        if url.endswith("/__health"):
            return FakeResponse({"ok": True, "sqlite": True, "save": True})
        return FakeResponse({"releaseId": "sha256:foreign"})

    monkeypatch.setattr(run_studio_runtime.urllib.request, "urlopen", foreign_urlopen)
    assert run_studio_runtime.health_ok(8765, expected) is False


def test_launcher_rejects_legacy_save_only_health(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        run_studio_runtime.urllib.request,
        "urlopen",
        lambda url, timeout: FakeResponse({"save": True}),
    )
    assert run_studio_runtime.health_ok(8765, "sha256:expected") is False


def test_locked_storage_uses_local_generic_recovery_app() -> None:
    app = run_studio_runtime.recovery_app("ccaf-study-studio", "sha256:release")
    client = TestClient(app, base_url="http://127.0.0.1")

    health = client.get("/__health")
    assert health.status_code == 200
    assert health.json() == {
        "ok": False,
        "appId": "ccaf-study-studio",
        "releaseId": "sha256:release",
        "status": "recovery_required",
    }
    screen = client.get("/")
    assert screen.status_code == 200
    assert "Recovery copies and backups were preserved" in screen.text
    assert client.get("/", headers={"Host": "example.com"}).status_code == 403
