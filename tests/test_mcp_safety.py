from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path
from typing import Any

import pytest


ROOT = Path(__file__).resolve().parents[1]


class FakeFastMCP:
    def __init__(self, *_: Any, **__: Any) -> None:
        pass

    def tool(self):
        return lambda function: function

    def run(self, **_: Any) -> None:
        pass


@pytest.fixture
def mcp_module(monkeypatch: pytest.MonkeyPatch):
    """Load the bridge with a tiny MCP stub; no MCP runtime or database is needed."""
    mcp_package = types.ModuleType("mcp")
    mcp_server = types.ModuleType("mcp.server")
    mcp_fastmcp = types.ModuleType("mcp.server.fastmcp")
    mcp_fastmcp.FastMCP = FakeFastMCP
    monkeypatch.setitem(sys.modules, "mcp", mcp_package)
    monkeypatch.setitem(sys.modules, "mcp.server", mcp_server)
    monkeypatch.setitem(sys.modules, "mcp.server.fastmcp", mcp_fastmcp)

    name = "mcp_safety_target"
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, ROOT / "studio_server" / "mcp_server.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FakeTransport:
    def __init__(self, responses: list[tuple[int, bytes]]) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, str, dict[str, str], bytes | None, float]] = []

    def __call__(self, method: str, url: str, headers: dict[str, str], body: bytes | None, timeout: float) -> tuple[int, bytes]:
        self.calls.append((method, url, headers, body, timeout))
        if not self.responses:
            raise AssertionError("unexpected HTTP request")
        return self.responses.pop(0)


def json_bytes(value: dict[str, Any]) -> bytes:
    import json

    return json.dumps(value).encode("utf-8")


def make_client(module: Any, tmp_path: Path, transport: FakeTransport) -> Any:
    token_path = tmp_path / "supervisor.token"
    token_path.write_text("test-supervisor-token-0123456789abcdef", encoding="ascii")
    return module.SupervisorClient(
        server_url="http://127.0.0.1:8765",
        data_dir=tmp_path,
        timeout=99,
        requester=transport,
    )


def health() -> tuple[int, bytes]:
    return 200, json_bytes({
        "ok": True,
        "sqlite": True,
        "save": True,
        "appId": "ccaf-study-studio",
        "releaseId": f'sha256:{"1" * 64}',
        "schemaVersion": 3,
        "manifestHash": "2" * 64,
        "backendContentSha256": "3" * 64,
        "databaseId": "test-database",
    })


def test_mcp_module_has_no_database_store_dependency() -> None:
    source = (ROOT / "studio_server" / "mcp_server.py").read_text(encoding="utf-8")
    assert "StudioStore" not in source
    assert "sqlite3" not in source


def test_mcp_rejects_foreign_service_with_open_studio_message(mcp_module: Any, tmp_path: Path) -> None:
    transport = FakeTransport([(200, json_bytes({"ok": True, "appId": "some-other-app"}))])
    client = make_client(mcp_module, tmp_path, transport)

    with pytest.raises(mcp_module.StudyStudioUnavailable, match="Open Study Studio first"):
        client.session()

    assert len(transport.calls) == 1
    assert "X-CCA-Supervisor" not in transport.calls[0][2]


def test_mcp_unavailable_health_is_clear_and_bounded(mcp_module: Any, tmp_path: Path) -> None:
    transport = FakeTransport([(503, b"service unavailable")])
    client = make_client(mcp_module, tmp_path, transport)

    with pytest.raises(mcp_module.StudyStudioUnavailable, match="Open Study Studio first"):
        client.session()

    assert transport.calls[0][4] == 10.0


def test_mcp_reads_session_through_authenticated_supervisor(mcp_module: Any, tmp_path: Path) -> None:
    transport = FakeTransport([
        health(),
        (200, json_bytes({"session": {"stage": "build", "mastery": "practiced"}, "release": {}})),
    ])
    client = make_client(mcp_module, tmp_path, transport)

    assert client.session() == {"stage": "build", "mastery": "practiced"}
    assert transport.calls[0][0:2] == ("GET", "http://127.0.0.1:8765/__health")
    assert transport.calls[1][0:2] == ("GET", "http://127.0.0.1:8765/api/supervisor/session")
    assert "X-CCA-Supervisor" not in transport.calls[0][2]
    assert transport.calls[1][2]["X-CCA-Supervisor"] == "test-supervisor-token-0123456789abcdef"


def test_mcp_review_and_proposal_preserve_advisory_shapes(mcp_module: Any, tmp_path: Path) -> None:
    transport = FakeTransport([
        health(),
        (200, json_bytes({"review": {"id": "r1", "advisoryOnly": True}})),
        health(),
        (200, json_bytes({"proposal": {"id": "p1", "status": "pending"}})),
    ])
    client = make_client(mcp_module, tmp_path, transport)

    assert client.review("r1") == {"id": "r1", "advisoryOnly": True}
    assert client.proposal("content_gap", {"unitId": "w1", "gap": "needs a diagram"}) == {"id": "p1", "status": "pending"}
    assert transport.calls[1][3] is None
    assert b'"kind":"content_gap"' in (transport.calls[3][3] or b"")


def test_mcp_tools_route_to_supervisor_without_local_store(mcp_module: Any, tmp_path: Path) -> None:
    transport = FakeTransport([
        health(),
        (200, json_bytes({"review": {"id": "r1", "advisoryOnly": True}})),
    ])
    client = make_client(mcp_module, tmp_path, transport)
    mcp_module.client = client

    result = mcp_module.submit_frontier_review("w1", "Needs a visual.", "revise", "r1")
    assert result["advisoryOnly"] is True
    assert transport.calls[1][0] == "POST"

    with pytest.raises(ValueError, match="Only W1"):
        mcp_module.submit_frontier_review("w2", "x", "revise")


def test_mcp_rejects_non_loopback_server_before_token_use(mcp_module: Any) -> None:
    with pytest.raises(ValueError, match="loopback"):
        mcp_module.SupervisorClient(server_url="http://192.0.2.1:8765")
    with pytest.raises(ValueError, match="loopback"):
        mcp_module.SupervisorClient(server_url="http://loopback.example:8765")


def test_mcp_rejects_incomplete_health_identity(mcp_module: Any, tmp_path: Path) -> None:
    transport = FakeTransport([(200, json_bytes({"ok": True, "appId": "ccaf-study-studio"}))])
    client = make_client(mcp_module, tmp_path, transport)
    with pytest.raises(mcp_module.StudyStudioUnavailable, match="Open Study Studio first"):
        client.session()
    assert len(transport.calls) == 1
