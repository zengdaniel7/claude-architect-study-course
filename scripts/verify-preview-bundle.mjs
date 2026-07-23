import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "studio/dist");
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.isFile() && /\.(?:html|js|css)$/.test(entry.name)) files.push(full);
  }
}

if (!fs.existsSync(dist)) throw new Error(`Preview bundle is missing: ${dist}`);
collect(dist);
const bundle = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const required = "Preview only. Progress is not saved.";
const forbidden = [
  "/api/",
  "X-CCA-Instance",
  ".ccaf-backup",
  "Download backup",
  "Import legacy checks",
  "Loading your saved progress",
  "Completed work stays saved",
  "No progress was overwritten",
  "Review saved.",
  "The saved queue is complete.",
  "Your W1 completion is saved here",
  "Your saved evidence stays available"
];

if (!bundle.includes(required)) throw new Error("Preview notice is missing from the built bundle");
const leaked = forbidden.filter((value) => bundle.includes(value));
if (leaked.length) throw new Error(`Preview bundle contains local-only behavior: ${leaked.join(", ")}`);
console.log(`Preview bundle: PASS (${files.length} text assets, no local persistence surface)`);
