# Course Audit and Repair Plan

Updated: 2026-07-14

## Goal

Keep CCA-F as the near-term milestone while building enough practical breadth to become an applied engineer and evaluate technical leadership intelligently.

The learner is a complete beginner and dyslexic. The required loop is:

`watch/listen -> draw -> build -> explain aloud -> flashcard`

Visual-first is a requirement: use real interface screenshots, Canva learning graphics, short captioned HeyGen/Higgsfield motion lessons, or an interactive local diagram before sustained text. Every external visual keeps a local fallback.

## What broke

The `tiny-order.json` task exposed a prerequisite inversion. The course asked for a tool request before teaching:

- file vs folder vs path vs extension
- plain text vs rich text
- JSON punctuation and validation
- program, function, input, output, and error
- API request vs response
- who requests a tool and who actually runs it

That confusion was a course-design failure, not a learner failure.

## Other gaps found

1. The old path entered at the Agent Loop before the learner could inspect a file or JSON object.
2. Only two units had an in-site build, and both pointed to the same generic exercise.
3. A completion checkbox could overstate mastery.
4. Quiz scores did not consistently treat guessed-correct answers as insecure.
5. Review was not scheduled; wrong and guessed answers could disappear after grading.
6. Tutor prompts were useful but not grounded in prerequisites, current evidence, and a fixed rubric.
7. The concept map described content but did not show the learner's current state.
8. Course order was copied into many files, which allowed old 16-unit assumptions to drift.
9. The plan ended at exam preparation and did not serve the broader applied-engineer/cofounder goal.

## Repaired course architecture

### Foundation Workbench

`W1 files -> W2 JSON -> W3 programs/functions/errors -> W4 API request/response -> W5 safe Terminal`

### CCA-F path

Core language -> prompting -> structured output -> tool call -> Agent Loop -> model economics -> Developer Bridge -> built-in tools -> MCP -> Claude Code -> orchestration -> Reliability -> production templates -> scenarios -> capstone.

### Developer Bridge

`D1 repository/tree/diff -> D2 branch/commit/PR/CI`

### Deterministic mastery

A new unit is proficient only when all four are true:

- all five lesson-loop steps are complete
- latest quiz is at least 80% with zero guesses
- the fixed build was completed in independent mode
- the teach-back rubric is complete

Old completed units remain grandfathered. No earned progress is taken away.

## Patterns adopted from the tutor projects

### DeepTutor

Adopted: one connected learner context, inspectable evidence, multiple learning modes, grounded tutoring, and mastery practice.

Implemented here: `course-data.js`, evidence states, tutor bridge, review queue, visual lessons, and deterministic mastery.

Deferred: a full RAG knowledge base, multi-user accounts, autonomous research, and persistent AI memory. They add operational weight before this single learner needs it.

### Studyield

Adopted: concept organization, adaptive practice, flashcards, and teach-back as an assessment rather than passive reading.

Implemented here: curated prerequisite map, confidence-aware quizzes, scheduled mistake cards, and a four-part teach-back rubric.

Deferred: exam cloning and multi-agent problem solving. The reported exam specification is not an official question bank, and AI-generated grading is not allowed to decide readiness.

### E-learning platform with AI tutors

Adopted: modular learning surfaces and a clear separation between content, tutor interaction, and progress.

Implemented here: small linked pages that share one manifest and one learner-evidence model.

## Patterns adopted from the course libraries

- **OSSU Computer Science:** prerequisites, staged depth, and a final artifact. Used as the long-term academic backbone, not a CCA-F prerequisite.
- **CS Video Courses:** a second visual explanation when the assigned resource does not click.
- **30 Seconds of Code:** tiny concept plus example. Link only; do not copy restricted text or site assets.
- **Project Based Learning:** choose a real project only after its prerequisites have been taught.
- **AI Engineering From Scratch:** consistent lesson structure, runnable checks, and one kept artifact per lesson.

## Broader Applied Engineer lane

Until the CCA-F milestone:

- about 16 hours/week on the exam path
- about 4 hours/week on applied-engineer breadth

The broad lane covers programming, web/networking, data, Git/testing/delivery, systems/cloud/security, architecture/reliability, applied AI engineering, and technical-cofounder diligence. Every module must produce an artifact.

## Release safeguards

- `course-data.js` is the single editing source for order, prerequisites, resources, builds, concepts, quiz destinations, and tutor prompts; the Study Studio's protected `studio/src/content/course-manifest.json` is generated from it (plus `video-data.js`) by `scripts/export-studio-manifest.mjs` and checked in CI.
- `course-audit.mjs` validates prerequisites, unique builds, review cards, beginner quiz banks, internal resources, and stale old-unit labels.
- Private PDFs, personal progress JSON, Obsidian settings, and personal notes are never included in the public release.
- Exam facts remain separately labeled **official** or **reported** and were not rewritten during this repair.

## Deferred roadmap

1. Integrated local chat can replace copy/paste only after the deterministic tutor bridge is stable.
2. Voice input remains optional; typed teach-back must always work.
3. RAG becomes useful when the learner has a larger approved document library and needs source-grounded retrieval.
4. Multi-agent tutoring is only justified for distinct parallel jobs with inspectable outputs.
