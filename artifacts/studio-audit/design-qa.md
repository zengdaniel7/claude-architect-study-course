# Studio Design QA

## Reviewed journey

Home -> Learn -> Draw -> Build bridge -> practice editor -> Mac file check -> Teach -> Quiz -> Review -> Complete -> Home -> empty Review -> scheduled Review -> Settings.

## Visible checks

- New stages begin at the heading instead of inheriting the prior scroll position.
- Action rows no longer cover lesson text, the file picker, the teach-back field, or quiz feedback.
- The first correct quiz answer immediately shows `1 correct so far`.
- Review has a visible sequence: Show answer -> rating -> Finish review.
- A mastered lesson shows `Review due`; `Again` repeats the card and `Hard` returns it in two days without lowering mastery.
- Completion changes the top bar to `Complete` and removes false Continue/Start review actions.
- The local tutor visibly reports when it is paused to protect memory.
- Atkinson Hyperlegible, 20px base text, semantic colors, visible focus, and 8px-or-less radii remain intact.

## Evidence

- `15-home-after.jpg` - fresh Home state.
- `16-learn-after.jpg` - corrected Learn layout.
- `17-quiz-feedback-after.jpg` - immediate score and unobscured explanation.
- `18-review-after.jpg` - reveal/rate/finish sequence.
- `19-review-comparison.jpg` - original reported review screen beside the repaired flow.

## Result

PASS for the W1 desktop journey at the in-app browser's current Mac viewport. Earlier split-view checks at 800px and 200% browser zoom found no horizontal overflow. The CI browser suite now repeats 800, 1024, 1440, and 1728px Mac window widths.
