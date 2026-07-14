# Dyslexia-Friendly Learning Interface Standard

This course combines dyslexia-friendly reading guidance, Atomic Design, and a manual human-polish checklist.

## Learning order

`visual -> short narration -> tiny example -> learner action -> optional detail`

Each screen should make one next action obvious.

## Reading baseline

- Atkinson Hyperlegible for the learning interface
- `20px` body text, `1.7` line height, and `0` letter spacing
- One normal interface font; monospace only for code or terminal text
- Short sentences, short paragraphs, bullets, and numbered steps
- Bold key terms; avoid sustained capitals, italics, and underlining
- Define abbreviations and technical terms on first use
- Keep reading lines near `65ch` or shorter

## Visual and interaction baseline

- One teaching idea per scene
- Real screenshots for real interface recognition
- Generated media for concepts, analogies, and invisible processes, never as fake product evidence
- Color supports meaning but is never the only signal
- Captions, transcript, alt text, and a typed fallback where media is used
- Visible keyboard focus and reduced-motion behavior
- Progressive hints instead of an immediate full answer
- Voice and typed routes for teach-back

## Atomic Design map

| Level | Course example |
|---|---|
| Atom | button, field, heading, progress state |
| Molecule | quiz option, hint row, lesson action |
| Organism | visual lesson, build panel, quiz card |
| Template | lesson, build, quiz, review layout |
| Page | template filled with real lesson content and learner state |

## Human-polish checklist

- Importance is obvious: primary action, support, then optional detail
- Headlines state the real outcome
- Motion teaches sequence, feedback, or state instead of decorating the page
- Unnecessary pills, labels, lines, dots, and icons are removed
- Empty space is allowed
- Cards use an `8px` radius or less
- Long labels and phone layouts do not overlap or clip
- Finished pages are tested with real, empty, and completed learner states
