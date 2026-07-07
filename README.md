# 🎓 CCA-F Study Course — a visual, beginner-friendly path to Claude Certified Architect (Foundations)

A complete, self-contained study site for Anthropic's **Claude Certified Architect – Foundations (CCA-F)** exam — built by a complete beginner (with an AI tutor) and designed to be **dyslexia-friendly**: diagram-first, plain words, big readable text.

> ⚠️ **Community project.** Not affiliated with or endorsed by Anthropic. Exam details shown in the course are community-reported — always verify with Anthropic (academy-support@anthropic.com) before booking anything.

## ✨ What's inside

- **⚛️ The Atomic Curriculum** — 16 units built like a system (Atoms → Molecules → Organisms → Templates → Pages + a Reliability thread), each with a diagram, plain words, chapters, videos, and a quiz
- **🛤️ Timeline** — the whole course as one visual path with ✓ done / ⭐ you-are-here tracking
- **▶️ Today page** — tells you exactly what to do next: your unit, your video, your 5 daily steps
- **🗺️ Visual Learning Map** + **3 engineering articles retold as ~30 diagrams** (Building Effective Agents, Multi-Agent Research System, Writing Tools for Agents — original links included)
- **🃏 5 flashcard decks** with two modes: flip-through *and* a Quizlet-style Learn mode that re-asks what you miss
- **🧪 Pre-test (30 Q) + 6 checkpoint quizzes** that track your score *and how much you guessed*
- **🏋️ Build exercises** you do right on the page, with an AI-checked grading loop (see below)
- **🩹 Repair guide** — the trickiest pre-test questions explained as pictures
- Progress is saved automatically — every tick, card and typed answer, the instant you make it; no account, no tracking. On the hosted site it lives in your browser (per-browser, per-address — with **Export/Import backup buttons** on the Home page). Run it locally with `serve.py` and it's **also written to a real file, `my-progress.json`**, which auto-restores if the browser's copy is ever cleared.

## 🚀 Run it — two ways

### 🌐 Option 1: just use the website (zero setup)
Open **https://zengdaniel7.github.io/claude-architect-study-course/** — everything works right there: lessons, diagrams, quizzes, flashcards, exercises, and **your progress saves automatically in your browser** (checkmarks, mastered cards, exercise answers — no account needed). One catch: that progress lives in *that* browser on *that* device, and the course content itself is fixed — you can't change it.

### 💻 Option 2: download it for FULL access (recommended)
```bash
git clone https://github.com/zengdaniel7/claude-architect-study-course.git
cd claude-architect-study-course
python3 serve.py
```
Open http://localhost:8000 — start at the **Home** page. Downloading unlocks what the website can't do:
- **Your progress becomes a real file** — `serve.py` mirrors every tick and typed answer into `my-progress.json` in the folder, automatically, and restores from it if browser data is ever cleared. (Plain `python3 -m http.server 8000` works too, but then saves stay browser-only.)
- **The course becomes YOURS to grow** — run an AI coding agent (like [Claude Code](https://claude.com/claude-code)) in the folder and the included [CLAUDE.md](CLAUDE.md) turns it into your personal tutor: it grades your exercise reports, keeps your mistake log, **adds new flashcards and exercises to the actual files** as you learn. The hosted site can never edit itself — a local copy can.
- Works offline, and you can edit any lesson to match how you learn.

| | 🌐 Website | 💻 Downloaded |
|---|---|---|
| Lessons, quizzes, flashcards, exercises | ✅ | ✅ |
| Progress auto-saves (in your browser) | ✅ | ✅ |
| Progress also saved to a real file on disk, with auto-restore | ❌ | ✅ |
| AI tutor that grades + upgrades the course files | ❌ | ✅ |
| Edit lessons / add your own content | ❌ | ✅ |
| Works offline | ❌ | ✅ |

## 🤖 Bring your own AI tutor

The course is model-agnostic. Every **"Ask my tutor"** and **"🧠 Check my answer"** button copies a ready-made prompt to your clipboard — paste it into **any** AI you use (Claude, ChatGPT, an AI browser like Comet, or a local model). The prompt includes everything the AI needs, including hidden grading rubrics for exercises.

**Power mode:** run an agentic coding CLI (like [Claude Code](https://claude.com/claude-code)) inside this folder. The included [CLAUDE.md](CLAUDE.md) briefing turns it into a full tutor that can grade your exercise reports, maintain a mistake log, add flashcards, and grow the course as you learn. It works with other agent CLIs too (point them at CLAUDE.md).

## 📖 How to study with it

1. Open **Home** → take the **Pre-Test** to set your baseline (watch your *guess count*, not just the score)
2. Every day, open **Today** — it tees up one unit and 5 small steps (watch → draw → build → explain → flashcards)
3. Mark units done on the **Curriculum**; the Timeline, Today, and Home pages all update themselves
4. Retake quizzes until you pass them **without guessing** — that's the real mastery signal

## 🙏 Credits

- Curriculum structure inspired by [Atomic Design](https://atomicdesign.bradfrost.com/) by Brad Frost
- Diagrams retell three Anthropic engineering articles (linked at the top of each article page)
- Font: [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) (Braille Institute, SIL OFL) — designed for low-vision and dyslexic readers
- Free prep courses: [Anthropic Academy](https://anthropic.skilljar.com/)

## 📄 License

Code and course text: [MIT](LICENSE). The Atkinson Hyperlegible fonts in `fonts/` are licensed separately under the [SIL Open Font License](fonts/OFL.txt) (not MIT). "Claude" and "Anthropic" are trademarks of Anthropic, PBC — this project is unaffiliated.
