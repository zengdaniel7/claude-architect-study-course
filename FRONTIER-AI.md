# Frontier AI Handoff

This repository contains two tutor surfaces:

- **CCA-F Study Studio** at `http://127.0.0.1:8765/` is the current local tutor.
- **Legacy tutor** remains available at `/legacy/` for one compatibility release.

Start the local app with:

```bash
./Start\ CCA-F\ Study\ Studio.command
```

## Connect through MCP

Study Studio exposes a local **stdio MCP server**. It gives frontier models a
server-authoritative learner session and accepts advisory reviews or proposals.
It cannot directly change mastery or curriculum.

Universal command:

```bash
/usr/bin/python3 scripts/run_frontier_mcp.py
```

The launcher reuses the cached Study Studio runtime and the same SQLite data in
`~/Library/Application Support/CCA-F Study Studio/`. Launch the app once before
the first MCP connection so that runtime dependencies exist.

Available tools:

- `get_tutor_briefing`
- `get_current_session`
- `get_review_packet`
- `submit_frontier_review`
- `propose_study_plan_update`
- `report_content_gap`

Frontier workflow:

```text
learner work -> deterministic server -> review packet -> frontier review
                                                |
                                                v
                                      advisory proposal only
                                                |
                                                v
                                      learner accepts or rejects
```

## Authority boundaries

- The server owns correctness, progression, prerequisites, mastery, and review timing.
- The local Ollama model supplies optional hints only and unloads after each response.
- A frontier model may grade, diagnose, and propose changes.
- Only the learner can accept a plan proposal.
- Never read, print, commit, or upload SQLite data, progress snapshots, credentials, private notes, or confidential PDFs.

Read `AGENTS.md` before tutoring or changing code. Run `npm test` before publishing a code change.
