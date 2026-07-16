# CCA-F Tutor Quality Review

Date: 2026-07-15

Branch: `codex/site-quality-review`

## Findings

### High - fixed

1. **An older delayed save could replace newer learner progress.**
   - Reproduced with out-of-order POST requests.
   - Fixed with monotonic client revisions plus locked, timestamp-aware atomic writes.
   - Code: `nav.js:65`, `serve.py:59`, `serve.py:77`.
   - Regression: `tests/test_serve.py::test_older_delayed_save_cannot_replace_newer_progress`.

2. **The wrong build could satisfy a lesson's required evidence.**
   - An optional legacy exercise could be credited to a different unit.
   - Fixed by requiring the manifest's exact exercise ID and clearing matching evidence when a build is unmarked.
   - Code: `nav.js:199`, `exercise.html:209`, `exercise.html:234`.
   - Regression: `tests/e2e/learner-journey.spec.js` covers canonical, optional, and unmark flows.

### Medium - fixed

3. **Progress imports and resume links trusted malformed or unsafe input.**
   - Fixed with a shared size/type/key validator, same-origin HTML resume links, and import confirmation.
   - Code: `nav.js:6-43`, `dashboard.html:287-300`, `serve.py:36-57`.

4. **A weaker quiz retake could erase a previously earned zero-guess pass.**
   - Fixed by preserving qualified mastery separately from the latest practice attempt.
   - Code: `nav.js:192-216`, `quiz.html:210-214`, `pretest.html`.

5. **Several pages could silently fall back to an older partial course path.**
   - Fixed by using the shared 23-unit manifest and showing a visible load failure when it is absent.
   - Code: `today.html:188-196`, plus the shared order in Dashboard, Notes, and Quiz.

6. **Curriculum summaries had drifted from the shared course manifest.**
   - Fixed after explicit learner approval by hydrating title, goal, tutor prompt, and quiz URL from the manifest.
   - Rich words, chapters, preparation, diagrams, and videos remain unchanged.
   - Code: `curriculum.html:273-305`.

7. **Core interactions were mouse-first or did not announce state changes.**
   - Fixed native buttons, menu keyboard behavior, focus return, visible focus, live feedback, flashcard state, and read-aloud semantics.
   - Code: `nav.js:298-325`, `timeline.html:122`, `flashcards.html:58`, `read-aloud.js`, `review.html`, `teachback.html`.

8. **Long lesson examples could push the Notes page sideways on a phone.**
   - Reproduced at 390 px with the file-path example.
   - Fixed with safe wrapping and retained diagnostic overflow reporting.
   - Code: `notes.html:16`.

### Low - fixed

9. **Shared navigation had patchwork Back/Home behavior.**
   - The old Back action could leave the course; its first repair duplicated Home.
   - The later UX pass replaced it with stable Home, Today, Course, Practice, Progress, and Menu destinations.
   - See `UX-FLOW-REVIEW.md` for the current journey contract.

## Verification

- Course integrity: **825 checks passed**.
- JavaScript syntax: **15 files passed**.
- Server safety: **9 tests passed**.
- Browser journeys: **20 desktop flows and 1 phone flow passed**.
- Phone reflow: **passed** across Dashboard, Today, Timeline, Curriculum, Notes, Quiz, Build, Teach-back, and Review.
- Manual browser pass: Dashboard, Today, Notes, and Quiz rendered without console errors; quiz keyboard focus was visibly clear.
- Protected content: no diff in exam facts, course data, unit data, lesson notes, quiz answers, exercises, or video mappings.

## Remaining Risks

1. `notes-corrections.js` still applies targeted string corrections. The audit now fails if a target disappears, but a later data-model cleanup would be safer than expanding this patch system.
2. GitHub Pages remains browser-only storage by design. Cross-browser file restore requires the local `serve.py` tutor.
3. Automated checks and manual keyboard testing do not equal a complete screen-reader or WCAG conformance audit.
4. A plaintext MCP credential was detected in the local Codex configuration. Rotate it outside this repository; it was never printed or committed.
