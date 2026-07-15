import fs from "node:fs";
import vm from "node:vm";

const root = new URL("./", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root), "utf8");
const exists = (name) => fs.existsSync(new URL(name, root));
const context = vm.createContext({ window: {} });

vm.runInContext(read("course-data.js"), context, { filename: "course-data.js" });
vm.runInContext(read("video-data.js"), context, { filename: "video-data.js" });
vm.runInContext(read("notes-data.js"), context, { filename: "notes-data.js" });
vm.runInContext(read("notes-corrections.js"), context, { filename: "notes-corrections.js" });
vm.runInContext(read("units-data.js"), context, { filename: "units-data.js" });
vm.runInContext(read("exercises.js"), context, { filename: "exercises.js" });
vm.runInContext(read("exercise-library.js"), context, { filename: "exercise-library.js" });

const course = context.window.CCAF_COURSE;
const media = context.window.CCAF_MEDIA;
const notes = context.window.LESSON_NOTES;
const chapters = context.UNIT_CHAPTERS;
const exercises = context.EXERCISES;
const failures = [];
const pass = [];
const check = (condition, message) => (condition ? pass : failures).push(message);

check(course && Array.isArray(course.units), "shared course manifest loads");
check(course.units.length === 23, "course has the intended 23 required units");

const ids = course.units.map((unit) => unit.id);
check(new Set(ids).size === ids.length, "unit ids are unique");

for (const [index, unit] of course.units.entries()) {
  check(unit.title && unit.one && unit.ask, `${unit.id}: title, goal, and tutor prompt exist`);
  check(Array.isArray(unit.watch) && unit.watch.length > 0, `${unit.id}: at least one watch/listen resource exists`);
  for (const resource of unit.watch || []) {
    check(resource.length >= 3 && String(resource[2]).startsWith("Focus:"), `${unit.id}: every resource has a one-line focus`);
    if (!/^https?:/.test(resource[0])) {
      const file = String(resource[0]).split(/[?#]/)[0];
      check(exists(file), `${unit.id}: internal resource exists (${file})`);
    }
  }
  for (const prereq of unit.prereq || []) {
    check(ids.includes(prereq), `${unit.id}: prerequisite ${prereq} exists`);
    check(ids.indexOf(prereq) < index, `${unit.id}: prerequisite ${prereq} appears earlier`);
  }
  check(Array.isArray(course.cards[unit.id]) && course.cards[unit.id].length >= 3, `${unit.id}: at least three review cards exist`);
}

check(media && media.lessons && media.clips && media.episodes, "reviewed video manifest loads");
check(media.reviewedAt === "2026-07-15", "video manifest records its transcript review date");
check(Object.values(media.episodes).filter((episode) => episode.status !== "unavailable").length === 22, "playlist records 22 available episodes");

const assignedClips = new Set();
for (const unit of course.units) {
  const lesson = media.lessons[unit.id];
  check(Boolean(lesson), `${unit.id}: media lesson entry exists`);
  check(Boolean(lesson && lesson.primary), `${unit.id}: primary watch source exists`);
  check(!lesson || lesson.optional == null || lesson.optional.type === "clip", `${unit.id}: optional slot contains at most one reviewed clip`);
  for (const item of lesson ? [lesson.primary, lesson.optional].filter(Boolean) : []) {
    if (item.type !== "clip") continue;
    const resolved = media.resolve(item);
    assignedClips.add(item.clip);
    check(Boolean(resolved), `${unit.id}: reviewed clip resolves`);
    if (!resolved) continue;
    check(resolved.startSec < resolved.endSec, `${unit.id}: clip has a valid time range`);
    check(resolved.endSec - resolved.startSec <= 600, `${unit.id}: clip stays under ten minutes`);
    check(resolved.endSec <= media.episodes[resolved.episodeKey].durationSec, `${unit.id}: clip ends inside the full episode`);
    check(/[?&]t=\d+s/.test(resolved.url), `${unit.id}: clip URL includes its exact start time`);
    check(!/[?&]t=\d+s/.test(resolved.fullUrl), `${unit.id}: full-episode URL starts at the beginning`);
    check(resolved.captionSource && resolved.reviewedAt, `${unit.id}: clip records caption source and review date`);
  }
}
check(assignedClips.size === Object.keys(media.clips).length, "every selected playlist clip is assigned to a lesson");
for (const [key, clip] of Object.entries(media.clips)) {
  check(assignedClips.has(key), `${key}: selected clip appears in the course`);
  check(media.episodes[clip.episode].status !== "unavailable", `${key}: selected clip does not use an unavailable episode`);
}
for (const [key, episode] of Object.entries(media.episodes)) {
  if (episode.status !== "used") continue;
  check(Object.values(media.clips).some((clip) => clip.episode === key), `${key}: assigned episode has an exact lesson clip`);
}

const correctedTeachingText = JSON.stringify({
  chapters,
  notes:Object.fromEntries(Object.entries(notes).map(([id,note]) => [id,{title:note.title,html:note.html}]))
});
for (const stale of [
  "short-term memory",
  "re-reads every request",
  "tools from every connected MCP server are all available at once",
  "scratchpad + memory files let agents resume after context loss",
  "tool_use = continue, end_turn = done",
  "The 6 exam scenarios",
  "The shape is guaranteed, not left to luck",
  "a feature that guarantees valid JSON via constrained decoding",
  "so JSON is always valid",
  "so it is always valid JSON",
  "reliable way to guarantee the JSON is valid"
]) check(!correctedTeachingText.includes(stale), `rendered teaching text removes stale phrase: ${stale}`);

const requiredExercises = course.units.map((unit) => unit.exercise);
check(new Set(requiredExercises).size === requiredExercises.length, "every required unit has a unique fixed build");
const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
for (const unit of course.units) {
  const exercise = exerciseMap.get(unit.exercise);
  check(Boolean(exercise), `${unit.id}: fixed build ${unit.exercise} exists`);
  if (!exercise) continue;
  check(exercise.units.includes(unit.id), `${unit.id}: fixed build is attributed to the correct unit`);
  check(exercise.steps.length >= 4, `${unit.id}: build includes example, independent work, verification, and explanation`);
  check(exercise.rubric.length >= 4, `${unit.id}: build has a four-part rubric`);
}

for (const id of ["w1", "w2", "w3", "w4", "w5", "d1", "d2"]) {
  check(course.banks[id] && course.banks[id].questions.length >= 5, `${id}: beginner checkpoint bank has at least five questions`);
}

for (const page of ["dashboard.html", "today.html", "notes.html", "curriculum.html", "timeline.html", "quiz.html", "pretest.html", "video-library.html"]) {
  const html = read(page);
  check(html.indexOf("course-data.js") < html.indexOf("nav.js"), `${page}: loads the manifest before navigation`);
  check(!/0 \/ 16 units|\/16 units|All 16 units/.test(html), `${page}: no stale 16-unit progress label`);
}

for (const page of ["today.html", "notes.html", "curriculum.html", "video-library.html"]) {
  const html = read(page);
  const courseIndex = html.indexOf("course-data.js");
  const dataIndex = html.indexOf("video-data.js");
  const uiIndex = html.indexOf("video-ui.js");
  const navIndex = html.indexOf("nav.js");
  check(courseIndex >= 0 && courseIndex < dataIndex && dataIndex < uiIndex && uiIndex < navIndex, `${page}: loads course, video data, media UI, then navigation`);
}

const videoLibrary = read("video-library.html");
check(videoLibrary.includes("Full episode") && videoLibrary.includes("Watch "), "video library exposes exact clips and full episodes");
check(videoLibrary.includes("notes.html?unit=") && videoLibrary.includes("review.html?unit="), "video library connects watch, notes, and review");
check(!/<iframe|autoplay/i.test(videoLibrary), "video library does not autoplay or embed heavy players");
check(videoLibrary.includes(".episode[hidden]{display:none}"), "video library truly hides nonmatching filtered episodes");

const css = read("study.css");
check(css.includes('font-family:"Atkinson Hyperlegible"'), "shared UI uses Atkinson Hyperlegible");
check(/font-size:20px;line-height:1\.7;letter-spacing:0/.test(css), "shared UI uses the dyslexia-friendly reading baseline");
check(css.includes("prefers-reduced-motion:reduce"), "shared UI respects reduced-motion preferences");
check(css.includes("focus-visible"), "shared UI provides visible keyboard focus");
check(!/text-transform\s*:\s*uppercase/.test(read("review.html")), "review cards do not force all-capital labels");

const foundation = read("foundation-lab.html");
check(foundation.includes('role="img"'), "visual foundation lessons expose the scene as an image");
check(foundation.includes("Concept model, not a product screenshot"), "drawn interface scenes are not presented as real screenshots");
check(foundation.includes('id="speak"'), "visual foundation lessons provide read-aloud");

const visualPipelineName = exists("Visual Media Pipeline.md") ? "Visual Media Pipeline.md" : "VISUAL-MEDIA-PIPELINE.md";
const designStandardName = exists("Dyslexia UI Standard.md") ? "Dyslexia UI Standard.md" : "DESIGN-STANDARD.md";
const visualPipeline = read(visualPipelineName);
const designStandard = read(designStandardName);
check(visualPipeline.includes("Higgsfield images"), "visual pipeline includes Higgsfield instructional stills");
check(designStandard.includes("Atomic Design"), "UI standard includes the Atomic Design structure");
check(exists(designStandardName), "combined dyslexia and human-polish UI standard exists");

for (const name of fs.readdirSync(root).filter((file) => file.endsWith(".html"))) {
  const html = read(name);
  const localTargets = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((target) => target && !/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(target))
    .map((target) => decodeURIComponent(target.split(/[?#]/)[0]))
    .filter(Boolean);
  for (const target of new Set(localTargets)) {
    check(exists(target), `${name}: internal target exists (${target})`);
  }
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of scripts.entries()) {
    try {
      new vm.Script(match[1], { filename: `${name}:inline-${index + 1}` });
      check(true, `${name}: inline script ${index + 1} parses`);
    } catch (error) {
      check(false, `${name}: inline script ${index + 1} parses (${error.message})`);
    }
  }
}

console.log(`Course audit: ${pass.length} checks passed.`);
if (failures.length) {
  console.error(`Course audit: ${failures.length} checks failed:`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("Course audit: PASS");
}
