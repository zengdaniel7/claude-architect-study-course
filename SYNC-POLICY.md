# Sync Policy — Repo ↔ Obsidian Vault

Adopted 2026-07-27 (council decision D1). The vault once drifted from this repo:
its served legacy pages presented reported exam numbers as "confirmed", linked a
private local PDF that 404s in the served app, and personalized shared content
with local paths. This policy prevents silent recurrence.

## Ownership by artifact class

| Artifact | Authoritative source |
|---|---|
| App code, legacy pages, shared content, manifests | This repo (`main`) |
| Learner notes, private annotations, private PDFs | Obsidian vault |
| SQLite progress state | `~/Library/Application Support/CCA-F Study Studio/` (never iCloud) |
| Installed vault copies of repo files | Generated copies — **never hand-edited** |

## Rules

1. **One-way sync only: repo → vault.** Never copy vault files into this repo —
   the vault contains personal paths, private notes, and confidential references.
2. Vault copies of repo files are installed by `install-to-vault.sh` and treated
   as generated artifacts. If a served file needs a change, change it here,
   commit, and reinstall.
3. `AGENTS.md` / `CLAUDE.md` intentionally diverge: this repo holds the public
   brief; the vault holds a personalized brief for its own notes. Both must state
   the same teaching contract (dyslexic beginner, visual-first, server-owned
   mastery). If one side changes the contract, change the other in the same week.
4. Exam specifications stay labeled **reported** until Anthropic publishes them.
   `scripts/lint-exam-facts.sh` enforces this in CI and before release.
5. Private material (learner progress JSON, personal PDFs, Obsidian settings,
   local absolute paths) must never appear in this repo. The release audit and
   the legacy-archive allowlist (`studio_server/legacy_assets.py`) enforce this.

## Drift check

Before any install or release, compare the vault's shared files against `main`
(the vault is private, so this runs locally, not in hosted CI):

```bash
cd ~/ccaf-work
for f in $(git ls-files '*.html' '*.js' '*.css' | grep -v -e '^studio/dist/' -e tests); do
  diff -q "$f" "$VAULT/$f" || echo "DRIFT: $f"
done
```

Any drift means the vault copy is stale (reinstall) or was hand-edited
(revert from this repo). Drift is never resolved by editing the vault copy.
