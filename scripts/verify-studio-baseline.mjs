import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "studio", "curriculum-baseline.json"), "utf8"));
const failures = [];

for (const [relativePath, expected] of Object.entries(baseline.sha256)) {
  const absolutePath = path.join(root, relativePath);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
  if (actual !== expected) failures.push(`${relativePath}: expected ${expected}, received ${actual}`);
}

if (failures.length) {
  throw new Error(`Protected curriculum content changed:\n${failures.join("\n")}`);
}

console.log(`Curriculum baseline: ${Object.keys(baseline.sha256).length} protected files unchanged.`);
