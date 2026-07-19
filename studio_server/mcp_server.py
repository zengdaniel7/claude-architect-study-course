from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from mcp.server.fastmcp import FastMCP


DEFAULT_SERVER_URL = "http://127.0.0.1:8765"
DEFAULT_DATA_DIR = Path.home() / "Library" / "Application Support" / "CCA-F Study Studio"
EXPECTED_APP_ID = "ccaf-study-studio"
REQUEST_TIMEOUT_SECONDS = 3.0
MAX_RESPONSE_BYTES = 2_000_000


class StudyStudioUnavailable(RuntimeError):
    """The local Study Studio cannot safely serve an MCP request."""


RequestFn = Callable[[str, str, dict[str, str], bytes | None, float], tuple[int, bytes]]


def _loopback_url(value: str) -> str:
    """Reject configured URLs that could exfiltrate the supervisor token."""
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
        raise ValueError("CCA_STUDIO_SERVER_URL must be an HTTP(S) loopback URL")
    host = parsed.hostname
    if host is None:
        raise ValueError("CCA_STUDIO_SERVER_URL must include a loopback host")
    try:
        is_loopback = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise ValueError("CCA_STUDIO_SERVER_URL must resolve to loopback") from error
    if not is_loopback or not all(address[4][0] in {"127.0.0.1", "::1"} for address in is_loopback):
        raise ValueError("CCA_STUDIO_SERVER_URL must resolve to loopback")
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}{path}"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request: urllib.request.Request, *_: Any) -> None:
        return None


def _default_request(method: str, url: str, headers: dict[str, str], body: bytes | None, timeout: float) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            payload = response.read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                raise StudyStudioUnavailable("Open Study Studio first: the local response was too large")
            return response.status, payload
    except urllib.error.HTTPError as error:
        payload = error.read(MAX_RESPONSE_BYTES + 1)
        if len(payload) > MAX_RESPONSE_BYTES:
            payload = b""
        return error.code, payload
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as error:
        raise StudyStudioUnavailable("Open Study Studio first: the local server is unavailable") from error


class SupervisorClient:
    """Small HTTP-only client for the authenticated local supervisor boundary."""

    def __init__(
        self,
        server_url: str | None = None,
        data_dir: Path | None = None,
        timeout: float = REQUEST_TIMEOUT_SECONDS,
        requester: RequestFn | None = None,
    ) -> None:
        configured_url = server_url or os.environ.get("CCA_STUDIO_SERVER_URL") or DEFAULT_SERVER_URL
        configured_data = data_dir or Path(os.environ.get("CCA_STUDIO_DATA_DIR") or DEFAULT_DATA_DIR)
        self.base_url = _loopback_url(configured_url)
        self.token_path = configured_data.expanduser() / "supervisor.token"
        self.timeout = max(0.1, min(float(timeout), 10.0))
        self._requester = requester or _default_request

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _token(self) -> str:
        try:
            token = self.token_path.read_text(encoding="ascii").strip()
        except (OSError, UnicodeError) as error:
            raise StudyStudioUnavailable("Open Study Studio first: its supervisor token is unavailable") from error
        if not token or len(token) > 4096:
            raise StudyStudioUnavailable("Open Study Studio first: its supervisor token is invalid")
        return token

    @staticmethod
    def _json(payload: bytes) -> dict[str, Any]:
        try:
            value = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise StudyStudioUnavailable("Open Study Studio first: the local server returned invalid data") from error
        if not isinstance(value, dict):
            raise StudyStudioUnavailable("Open Study Studio first: the local server returned invalid data")
        return value

    def _health(self) -> dict[str, Any]:
        try:
            status, payload = self._requester("GET", self._url("/__health"), {"Accept": "application/json"}, None, self.timeout)
        except StudyStudioUnavailable:
            raise
        except (OSError, TimeoutError, socket.timeout) as error:
            raise StudyStudioUnavailable("Open Study Studio first: the local server is unavailable") from error
        if status != 200:
            raise StudyStudioUnavailable("Open Study Studio first: the local server is unavailable")
        health = self._json(payload)
        if health.get("appId") != EXPECTED_APP_ID:
            raise StudyStudioUnavailable("Open Study Studio first: a foreign local service is using that port")
        if health.get("ok") is False:
            raise StudyStudioUnavailable("Open Study Studio first: Study Studio health checks are failing")
        return health

    def _call(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        self._health()
        headers = {"Accept": "application/json", "X-CCA-Supervisor": self._token()}
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
            headers["Content-Type"] = "application/json"
        try:
            status, payload = self._requester(method, self._url(path), headers, encoded, self.timeout)
        except StudyStudioUnavailable:
            raise
        except (OSError, TimeoutError, socket.timeout) as error:
            raise StudyStudioUnavailable("Open Study Studio first: the local server is unavailable") from error
        if status < 200 or status >= 300:
            detail = ""
            try:
                detail = str(self._json(payload).get("detail", ""))
            except StudyStudioUnavailable:
                pass
            if status in {401, 403, 404, 502, 503, 504}:
                raise StudyStudioUnavailable("Open Study Studio first: the supervisor service is unavailable")
            raise RuntimeError(detail or f"Study Studio supervisor request failed ({status})")
        return self._json(payload)

    def session(self) -> dict[str, Any]:
        return self._call("GET", "/api/supervisor/session").get("session", {})

    def review(self, review_id: str | None = None) -> dict[str, Any] | None:
        path = "/api/supervisor/reviews"
        if review_id:
            from urllib.parse import quote

            path += f"?review_id={quote(review_id, safe='')}"
        return self._call("GET", path).get("review")

    def submit_review(self, unit_id: str, notes: str, verdict: str, review_id: str | None = None) -> dict[str, Any]:
        result = self._call(
            "POST",
            "/api/supervisor/frontier-reviews",
            {"unitId": unit_id, "notes": notes[:4_000], "verdict": verdict[:500], "reviewId": review_id},
        )
        return result["review"]

    def proposal(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        result = self._call("POST", "/api/supervisor/proposals", {"kind": kind, "payload": payload})
        return result["proposal"]


MCP_INSTRUCTIONS = """
Act as an advisory tutor, grader, and reviewer for a dyslexic beginner studying
for CCA-F. Start with get_tutor_briefing and get_current_session. Teach in
short visual-first chunks: plain meaning, tiny example, simple sketch, learner
action, then a brief check. Correctness, mastery, prerequisites, and review
scheduling are deterministic and server-owned. Never claim that an advisory
review changed progress. Use proposals for plan or content changes and leave
their acceptance to the learner in Study Studio.
""".strip()

TUTOR_BRIEFING: dict[str, Any] = {
    "role": "Tutor, grader, quizmaster, and architecture reviewer",
    "learner": {
        "level": "Complete beginner to technology and AI",
        "accessibility": "Dyslexic; use short chunks, clear headings, bold key terms, and visual examples",
        "learningLoop": ["watch", "draw", "build", "explain aloud", "flashcard"],
    },
    "goal": "Pass CCA-F with real applied-engineering understanding",
    "gradingLevels": ["Beginner", "Developing", "Exam-ready", "Strong"],
    "masteryRule": "Correctness and guess count are separate; passing with guesses is not mastery",
    "authority": {
        "server": ["correctness", "progression", "prerequisites", "mastery", "review scheduling"],
        "frontierModel": ["advisory grading", "failure-mode analysis", "study-plan proposals", "content-gap reports"],
        "learner": ["accept or reject proposals"],
    },
    "release": {
        "interactiveUnits": ["w1"],
        "remainingUnits": "Present in the protected manifest for staged migration",
        "legacyTutor": "/legacy/",
    },
    "guardrails": [
        "Do not change exam facts, answer keys, mastery, or curriculum through MCP",
        "Do not treat local-model advice as authoritative",
        "Do not expose private notes, progress databases, credentials, or confidential PDFs",
    ],
}

mcp = FastMCP("CCA-F Study Studio", instructions=MCP_INSTRUCTIONS)
client = SupervisorClient()


@mcp.tool()
def get_tutor_briefing() -> dict[str, Any]:
    """Return the learner, teaching, authority, and safety contract for any frontier model."""
    return TUTOR_BRIEFING


@mcp.tool()
def get_current_session() -> dict[str, Any]:
    """Return the server-authoritative current W1 session."""
    return client.session()


@mcp.tool()
def get_review_packet(review_id: str | None = None) -> dict[str, Any] | None:
    """Return a pending review packet, optionally by id."""
    return client.review(review_id)


@mcp.tool()
def submit_frontier_review(unit_id: str, notes: str, verdict: str, review_id: str | None = None) -> dict[str, Any]:
    """Record an advisory frontier review; it cannot complete a learner stage."""
    if unit_id != "w1":
        raise ValueError("Only W1 is available in this Studio version")
    return client.submit_review(unit_id, notes, verdict, review_id)


@mcp.tool()
def propose_study_plan_update(summary: str, rationale: str, suggested_changes: list[str]) -> dict[str, Any]:
    """Create a pending plan proposal. Acceptance is advisory and cannot mutate curriculum."""
    return client.proposal("study_plan", {"summary": summary[:1_000], "rationale": rationale[:2_000], "suggestedChanges": suggested_changes[:20]})


@mcp.tool()
def report_content_gap(unit_id: str, gap: str, evidence: str) -> dict[str, Any]:
    """Record a curriculum-content gap proposal without changing course material."""
    return client.proposal("content_gap", {"unitId": unit_id, "gap": gap[:2_000], "evidence": evidence[:4_000]})


if __name__ == "__main__":
    mcp.run(transport="stdio")
