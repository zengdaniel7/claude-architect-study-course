# CCA-F Tutor UX and Flow Review

Date: 2026-07-15

Branch: `codex/ux-flow-overhaul`

## Target Journey

Every lesson now follows one visible path:

`Learn -> Draw -> Build -> Teach -> Quiz -> Review`

Each stage has one primary action. Optional tools and alternate routes stay behind disclosures or in the Practice hub.

## Findings

### Critical - fixed

1. **The local tutor could stall on a blank page after rendering only the navigation shell.**
   - Reproduced in the in-app browser while opening Flashcards.
   - Plain `http.server` was receiving unsupported progress POSTs on page after page. Its terminal log could fill while course scripts were still loading.
   - Fixed with a one-time `/__health` capability check. Plain servers remain browser-only and issue no progress POSTs; `serve.py` stays quiet and keeps file backups.
   - Code: `nav.js`, `serve.py`.
   - Regression: `plain static-server mode never floods unsupported progress saves` and the server health tests.

### High - fixed

2. **The site did not behave like one course.**
   - Learn, Notes, Build, Teach-back, Quiz, and Review each had different exits and generic Back links.
   - Added one shared six-stage rail and a shared next-action component across the complete lesson journey.
   - Code: `nav.js`, `dashboard.html`, `today.html`, `foundation-lab.html`, `notes.html`, `draw.html`, `exercise.html`, `teachback.html`, `quiz.html`, `review.html`.

3. **Review cards had no visible Next-card step.**
   - The old flow auto-advanced after grading, and the large blank card made the control relationship unclear.
   - Review now uses: Reveal answer -> choose Again/Hard/Got it -> explicit Next card.
   - A card is not scheduled until Next card is pressed.
   - Code: `review.html`.

4. **Quiz and Pre-Test controls covered answer choices.**
   - Reproduced visually at desktop size: the sticky Previous/Next bar sat over the final answer and guessing checkbox.
   - Both assessments now show one question at a time, place navigation after the answers, retain progress, and move focus to the next question.
   - Code: `quiz.html`, `pretest.html`.
   - Regression: `quiz controls come after the answer choices instead of covering them`.

5. **Draw was a named stage without a real activity.**
   - The old Draw link returned to a checklist row.
   - Added a touch/mouse sketchpad with concept boxes, color swatches, pen size, undo, clear, autosave, a paper option, and a text alternative.
   - Completing it saves lesson evidence and hands off directly to Build.
   - Code: `draw.html`, `nav.js`, `today.html`.

### Medium - fixed

6. **Several pages competed with the primary action.**
   - Stale resume links, lesson browsers, tutor-copy controls, and optional practice appeared beside the required next step.
   - Resume and alternate actions now live in disclosures. Build and Teach-back end with one next-stage action.

7. **Two flashcard systems looked like the same requirement.**
   - The lesson Review queue and the optional Flashcard library used overlapping names and modes.
   - The Practice hub and library now state which is required. Library modes are named Browse and Quiz me.

8. **Normal navigation caused avoidable request and save churn.**
   - File restore is checked once per tab, static course files can revalidate, and long text inputs save on a short debounce instead of every keystroke.
   - Code: `nav.js`, `serve.py`, `exercise.html`, `teachback.html`.

9. **Keyboard and screen-reader names were incomplete.**
   - Weekly controls, daily checkboxes, exercise fields, filter controls, progress feedback, and disclosure state now expose names and state.
   - A global hidden rule prevents hidden controls from reappearing when a component sets its own display style.

10. **Mobile navigation carried the desktop information load.**
    - Phone navigation now keeps Home, Today, and Menu visible. Course, Practice, and Progress move into Menu.

## Protected Content

- Exam claims and reported/official labels were not changed.
- Unit order, lesson meaning, quiz answers, exercise prompts, and video mappings were not rewritten.
- Existing `ccaf-*` storage keys remain compatible.
- Personal progress files are excluded from the change set.

## Remaining Risks

1. **Content sequencing needs a separate curriculum decision.** The first file lesson's build asks for valid JSON before the following JSON lesson teaches the syntax. This review flags it but does not rewrite protected curriculum content.
2. **Speech features depend on browser support.** Typing, paper drawing, and text alternatives remain complete fallbacks.
3. **GitHub Pages remains browser-only storage.** Local `serve.py` is required for automatic `my-progress.json` backups.
4. **Older reference pages are denser than the primary lesson journey.** They remain optional and no longer interrupt the required path.

## Acceptance Matrix

- Fresh and established progress
- Home -> lesson -> Learn -> Draw -> Build -> Teach -> Quiz -> Review
- Explicit card progression and scheduling
- One-question Quiz and Pre-Test progression
- Export/import and malformed progress
- Plain server and file-saving server modes
- Desktop, phone, 200% zoom, reduced motion, keyboard operation, long text, and overflow
- No unintended curriculum or exam-fact edits
