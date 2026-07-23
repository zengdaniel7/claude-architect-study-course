# 🎓 CCA-F Study Course — a visual, beginner-friendly path to Claude Certified Architect (Foundations)

A complete, self-contained study site for Anthropic's **Claude Certified Architect – Foundations (CCA-F)** exam — built by a complete beginner (with an AI tutor) and designed to be **dyslexia-friendly**: diagram-first, plain words, big readable text.

> ⚠️ **Community project.** Not affiliated with or endorsed by Anthropic. Exam details shown in the course are community-reported — always verify with Anthropic (academy-support@anthropic.com) before booking anything.

## ✨ What's inside

- **⚛️ The Atomic Curriculum** — 23 prerequisite-aware units, starting with a five-lesson computer-skills Workbench and building through Claude foundations, agentic systems, reliability, and production scenarios
- **🛤️ Timeline** — the whole course as one visual path with ✓ done / ⭐ you-are-here tracking
- **▶️ Lesson page** — tells you exactly what to do next: your current lesson, its video, and its 5 steps (they stay with the lesson until you finish it)
- **🔊 Natural read-along** — the seven beginner Workbench lessons include local ElevenLabs narration, word highlighting, a seek bar, and remembered `0.75x`-`2x` speed control
- **🎥 Reviewed video library** — 22 recent community episodes catalogued, with 14 exact lesson clips, full-episode links, transcript provenance, and current-product warnings
- **🗺️ Prerequisite concept map** + **3 engineering articles retold as ~30 diagrams** (Building Effective Agents, Multi-Agent Research System, Writing Tools for Agents — original links included)
- **🃏 5 flashcard decks** with two modes: flip-through *and* a Quizlet-style Learn mode that re-asks what you miss
- **🧪 Pre-test (30 Q) + 6 checkpoint quizzes** that track your score *and how much you guessed*
- **🏋️ One fixed build per unit** with worked examples, independent redo, progressive hints, verification steps, and a four-part rubric
- **🗣️ Typed or spoken teach-back** + a simple spaced-review queue for concept and mistake cards
- **💬 Grounded tutor bridge** that copies the current lesson, prerequisite, rubric, and recent evidence into a focused tutor prompt
- **🧰 Applied Engineer path** for programming, APIs, databases, Git, testing, systems, security, architecture, and technical-cofounder judgment
- **🩹 Repair guide** — the trickiest pre-test questions explained as pictures
- **🎛️ NEW: CCA-F Study Studio** — a rebuilt guided app (React + a local Python server + a private SQLite database) that walks one unit at a time through **Learn → Draw → Build → Teach → Quiz → Review**, with server-side grading, verified backups, and an MCP connection for AI tutors ([FRONTIER-AI.md](FRONTIER-AI.md)). Unit **W1 is fully interactive** today; the other 22 units are in the protected manifest for staged migration, and the classic pages above stay available at `/legacy/`.
- Progress is saved automatically **when you run the course locally** — every tick, card and typed answer; no account, no tracking. The classic pages save to your browser and (with `serve.py`) to a real file, `my-progress.json`, which auto-restores if the browser's copy is ever cleared; Study Studio saves to a private local database with verified export/import backups. The hosted site is a **preview only and does not save progress**.

## 🚀 Run it — two ways

### 🌐 Option 1: peek at the live preview (zero setup)
Open **https://zengdaniel7.github.io/claude-architect-study-course/** — a **preview of the new Study Studio**. You can click through the first unit (W1) end to end: Learn → Draw → Build → Teach → Quiz → Review. It shows **"Preview only. Progress is not saved."** and means it — nothing persists between visits, and the AI tutor is switched off. Use it to *see* the course; download it to *study*.

### 💻 Option 2: download it for FULL access (recommended)
```bash
git clone https://github.com/zengdaniel7/claude-architect-study-course.git
cd claude-architect-study-course
python3 serve.py
```
Open http://localhost:8000 — start at the **Home** page. Downloading unlocks what the hosted preview can't do:
- **Your progress becomes a real file** — `serve.py` mirrors every tick and typed answer into `my-progress.json` in the folder, automatically, and restores from it if browser data is ever cleared. (Plain `python3 -m http.server 8000` works too, but then saves stay browser-only.)
- **The course becomes YOURS to grow** — run an AI coding agent (like [Claude Code](https://claude.com/claude-code)) in the folder and the included [CLAUDE.md](CLAUDE.md) turns it into your personal tutor: it grades your exercise reports, keeps your mistake log, **adds new flashcards and exercises to the actual files** as you learn. The hosted site can never edit itself — a local copy can.
- Works offline, and you can edit any lesson to match how you learn.

**⭐ Want the new Study Studio app locally?** It ships as source. Build it once with Node 20+ and pnpm (`corepack enable && pnpm install && pnpm run studio:build`), then launch:
```bash
./Start\ CCA-F\ Study\ Studio.command
```
Open **http://127.0.0.1:8765/** — W1 fully guided with server-side grading, progress in a private local database (with verified export/import backups), the classic pages at `/legacy/`, and MCP hookup for AI tutors ([FRONTIER-AI.md](FRONTIER-AI.md)).

| | 🌐 Hosted preview | 💻 Downloaded |
|---|---|---|
| See the new Study Studio (W1 guided journey) | ✅ preview | ✅ (after one build) |
| Full classic course: lessons, quizzes, flashcards, exercises | ❌ | ✅ |
| Progress saves | ❌ never (preview only) | ✅ browser + `my-progress.json`, or the Studio database |
| AI tutor that grades + upgrades the course files | ❌ | ✅ |
| Edit lessons / add your own content | ❌ | ✅ |
| Works offline | ❌ | ✅ |

## 🤖 Bring your own AI tutor

The course is model-agnostic. Every **"Ask my tutor"** and **"🧠 Check my answer"** button copies a ready-made prompt to your clipboard — paste it into **any** AI you use (Claude, ChatGPT, an AI browser like Comet, or a local model). The prompt includes everything the AI needs, including hidden grading rubrics for exercises.

**Power mode:** run an agentic coding CLI (like [Claude Code](https://claude.com/claude-code)) inside this folder. The included [CLAUDE.md](CLAUDE.md) briefing turns it into a full tutor that can grade your exercise reports, maintain a mistake log, add flashcards, and grow the course as you learn. It works with other agent CLIs too (point them at CLAUDE.md).

## 📖 How to study with it

1. Open **Home** → take the **Pre-Test** to set your baseline (watch your *guess count*, not just the score)
2. Every day, open **Today** — watch the short assigned clip first, open the full episode when useful, then continue through notes → draw → build → explain → flashcards
3. Complete the unit's independent build and 60-second teach-back
4. Retake its quiz until you reach at least 80% with **zero guessing**
5. A unit is mastered only when all four evidence types are present: lesson steps, quiz, independent build, and teach-back

## 🙏 Credits

- Curriculum structure inspired by [Atomic Design](https://atomicdesign.bradfrost.com/) by Brad Frost
- Accessibility baseline documented in [DESIGN-STANDARD.md](DESIGN-STANDARD.md)
- Video choices and timestamps are documented in [VIDEO-CURRICULUM-MAP.md](VIDEO-CURRICULUM-MAP.md); community videos are clearly separated from official Anthropic sources
- Diagrams retell three Anthropic engineering articles (linked at the top of each article page)
- Font: [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) (Braille Institute, SIL OFL) — designed for low-vision and dyslexic readers
- Foundation narration: generated through Higgsfield using an ElevenLabs preset voice; audio is stored locally and no API key is shipped in the site
- Free prep courses: [Anthropic Academy](https://anthropic.skilljar.com/)

## 📄 License

Code and course text: [MIT](LICENSE). The Atkinson Hyperlegible fonts in `fonts/` are licensed separately under the [SIL Open Font License](fonts/OFL.txt) (not MIT). "Claude" and "Anthropic" are trademarks of Anthropic, PBC — this project is unaffiliated.
