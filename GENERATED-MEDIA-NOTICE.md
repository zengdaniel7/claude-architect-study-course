# Generated study media — provenance and license notice

This course includes optional study media generated with **Google NotebookLM**
(Gemini Notebook) **exclusively from this repository's own verified course
sources** at commit `890b294`. No confidential, third-party, or personal
material was used as input.

## What this means

- **These are AI-generated study aids, not course canon.** If anything in a
  generated video, audio track, transcript, or image conflicts with the lesson
  notes in this repository, **the lesson notes win**.
- Every generated item is listed in `media/manifest.json` with its type,
  duration, SHA-256 checksum, source commit, generation date, and review state.
  Items marked `reviewState: "pending"` have **not** passed human transcript
  review and are not installed as course content.
- Exam specifics mentioned anywhere in generated media are **community-reported
  targets, never Anthropic-confirmed facts** — the same standard
  `scripts/lint-exam-facts.sh` enforces for the rest of the course.

## Files and distribution

- **Media binaries (video/audio) are not stored in this repository.** The app
  reads them from a local media folder; when a file is absent the Library shows
  a "media not installed" placeholder and everything else keeps working.
- Small text/image derivatives (transcripts, WebVTT captions, thumbnails, the
  mind-map outline) are tracked in the repository because they are reviewable,
  lintable text.
- **License:** the generated media files and their direct derivatives are
  **excluded from this repository's MIT license grant**. They are provided for
  personal study use only, with no warranty of accuracy. This project is not
  endorsed by or affiliated with Google or Anthropic.
- Public redistribution of the binaries (e.g. as release assets) is withheld
  until a documented review of NotebookLM's current terms of service permits it.

## Accessibility

Generated media ships only with a human-checked transcript; video additionally
requires captions (WebVTT). Transcripts are readable without the media file
installed. This is a hard requirement of the course's dyslexia-first design
standard, not a nice-to-have.
