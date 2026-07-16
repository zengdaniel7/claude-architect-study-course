import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "course-data.js");
const outputPath = path.join(root, "studio", "src", "content", "course-manifest.json");
const source = fs.readFileSync(sourcePath, "utf8");
const sandbox = { window: {} };

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: sourcePath, timeout: 1_000 });

const course = sandbox.window.CCAF_COURSE;
if (!course || !Array.isArray(course.units) || course.units.length !== 23) {
  throw new Error("course-data.js did not expose the expected 23-unit manifest");
}

const manifest = {
  sourceVersion: course.version,
  generatedFrom: "course-data.js",
  units: course.units,
  lessons: course.lessons,
  banks: course.banks,
  cards: course.cards
};

const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== rendered) throw new Error("Studio manifest is stale. Run pnpm run studio:manifest.");
  console.log(`Studio manifest check: ${course.units.length} canonical units match.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered);
  console.log(`Studio manifest: ${course.units.length} units -> ${path.relative(root, outputPath)}`);
}
