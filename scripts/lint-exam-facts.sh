#!/usr/bin/env bash
# lint-exam-facts.sh — fail if exam specifications are presented as official.
#
# Context (2026-07-27 council decision D5): Anthropic has not published a public
# exam blueprint. The specific numbers (60 questions, 720/1000, ~$99, 6 scenarios)
# are community-reported study targets. A stale vault page once presented them as
# "confirmed against the official exam guide" and was served to the learner.
# This lint blocks that phrasing from re-entering learner-facing content.
#
# Usage: scripts/lint-exam-facts.sh [path ...]   (default: repo root content files)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$#" -gt 0 ]; then
  FILES="$@"
else
  FILES="$(find . -type f \( -name '*.html' -o -name '*.md' -o -name '*.js' -o -name '*.vtt' -o -name 'generated-media.json' \) \
    -not -path './.git/*' -not -path './studio/dist/*' -not -path './tests/*' \
    -not -path './node_modules/*' -not -name 'lint-exam-facts' | sort)"
fi

fail=0

# Rule 1: banned "confirmed/official" framing of exam facts.
if echo "$FILES" | xargs grep -l -i -E '(confirmed|verified)[^<.]{0,40}against the official exam guide|officially confirmed.*(60 questions|720|\$99)' 2>/dev/null | grep -v lint-exam-facts; then
  echo "LINT FAIL: exam facts presented as confirmed/official. Use 'reported' wording." >&2
  fail=1
fi

# Rule 2: any file containing the reported exam numbers must carry a
# "reported"-class qualifier somewhere in the same file.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if ! grep -q -i -E 'reported|📣|community|unofficial|not official|study target' "$file"; then
    echo "LINT FAIL: exam numbers without any 'reported' qualifier in $file" >&2
    fail=1
  fi
done < <(echo "$FILES" | xargs grep -l -i -E '60 questions|720 ?/ ?1000|720 scaled|\$99' 2>/dev/null \
  | grep -v lint-exam-facts || true)

if [ "$fail" -eq 0 ]; then
  echo "lint-exam-facts: OK"
fi
exit "$fail"
