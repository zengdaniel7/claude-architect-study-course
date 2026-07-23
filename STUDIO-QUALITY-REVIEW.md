# CCA-F Study Studio Quality Review

Date: 2026-07-16
Branch: `codex/study-studio-rebuild`

## Findings and repairs

### P1 - Bodyless requests could freeze the whole app

`BodyLimitMiddleware` waited for a request-body event even on `GET`. Uvicorn does not promise that event, so the page and every read API could stay blank indefinitely.

**Repair:** bypass body buffering for `GET`, `HEAD`, and `OPTIONS`; preserve streaming size enforcement for writes; add an exact regression test that fails if a `GET` touches `receive()`.

### P1 - Learner progress could be raced or self-scored

Stage changes, review creation, and frontier submissions were not fully atomic. Quiz payloads could also report their own score.

**Repair:** use `BEGIN IMMEDIATE` for transitions; enforce one pending review; derive quiz correctness and guess counts from the canonical manifest; require the real pending review ID; schedule Hard/Got it reviews deterministically; keep proposal decisions immutable; reject newer database schemas instead of silently downgrading them.

### P1 - Local/private files had weak boundaries

The legacy server could expose dot-prefixed paths such as `.studio-data`, and the Studio compatibility routes did not require the local instance token.

**Repair:** block all dot-prefixed paths, progress files, and temporary files; validate Host and exact Origin including port; require the instance header or HttpOnly same-site cookie for private reads and writes; return the real stale-save result.

### P1 - The learner journey had dead ends and overlays

Stage changes retained the old scroll position. The sticky action bar covered explanations and inputs. A completed review still looked active, Home still said Continue, and the Review hub offered a zero-card review.

**Repair:** focus and scroll each new scene to its heading; keep actions in normal document flow; add explicit mastered, empty-review, and completed-course states; update the top bar and Home state; replace completed weekly goals with a calm next-review message.

### P2 - Several interactions could become stale or silently fail

Strict Mode could initialize twice; failed saves had no learner-facing recovery; Stop tutor could leave a spinner; resetting CodeMirror did not reliably update the editor; microphone and speech resources could survive the screen.

**Repair:** share one API initialization promise, show save failures without discarding on-screen work, make tutor waits abortable, synchronize CodeMirror from props, and clean up recorder, blob URL, speech, and tutor tasks.

### P2 - A local startup failure could masquerade as preview mode

If the local progress API failed during initialization, the app silently switched to the unsaved public demo. A learner could continue without realizing the work was temporary.

**Repair:** localhost now shows a clear recovery screen and never enters demo mode after an API failure. AI-disabled preview remains available only when the static public site has no local API.

### P2 - Development I/O looked like application lag

The production bundle is modest, but Node and thousands of development files were being read from the synced Documents folder while an 8 GB Mac was under memory compression.

**Repair:** daily launch now uses a cached Python environment, cached built site, cached server source, and SQLite in macOS Application Support. No Vite, Node, test worker, or model starts during study. The Ollama guard keeps the model off below 35% free memory on a low-memory Mac.

### P2 - Public preview and CI did not cover Studio

The Vite build used root-relative assets, the Pages flow was missing, and the quality workflow did not run Studio type, unit, server, or build checks.

**Repair:** use a relative Vite base; add an AI-disabled GitHub Pages preview; expand CI; explicitly allow only the pinned `esbuild` install script under pnpm 11; add an isolated Studio browser server and a full W1 journey test.

## Measured results

- Warm production page: 16-22 ms local response time.
- Warm launcher: server announces within about 1 second; no dependency install on later launches.
- Initial JavaScript: 330.35 kB raw, 103.70 kB gzip.
- CodeMirror workbench: lazy 293.94 kB raw, 95.56 kB gzip; it loads only during Build.
- CSS: 22.95 kB raw, 5.35 kB gzip.
- Production build: PASS, 130 modules, 2m 15s under current synced-folder pressure.
- Curriculum audit: PASS, 825 checks.
- Protected curriculum baseline: PASS, 4 files unchanged.
- Typed manifest check: PASS, 23 canonical units match.
- TypeScript: PASS.
- Frontend unit suite: PASS, 6 files and 10 tests from the local test cache.
- Studio server: PASS, 17 tests.
- Legacy save server: PASS, 9 tests.
- In-app browser: PASS through Learn, Draw, Build boundary, Teach, zero-guess Quiz, Review, mastery, empty queue, scheduled review, Again/Hard spacing, and low-memory Settings state.

## Remaining risks

- Vitest workers cannot start within their fixed timeout when launched directly from the synced folder. The identical cached worktree passes all 10 tests in 1.93 seconds; CI remains the clean repository gate.
- The in-app browser driver cannot synthesize a local file selection. The live file UI was inspected, the server transition was tested separately, and the committed Playwright journey uses `setInputFiles` in CI.
- Only W1 is wired into the interactive engine in this release. The full course remains in the protected typed manifest for staged migration.
- FastAPI's current TestClient emits a deprecation warning about its HTTPX adapter; behavior is covered, but the adapter should be updated when the upstream replacement is stable.

No exam claim, quiz answer, video mapping, or protected curriculum file changed in this repair.
