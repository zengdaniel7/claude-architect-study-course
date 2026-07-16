import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const files = fs.readdirSync(root)
  .filter((name) => name.endsWith(".js"))
  .concat(fs.readdirSync(path.join(root, "tests", "e2e")).filter((name) => name.endsWith(".js")).map((name) => `tests/e2e/${name}`));

for (const file of files) {
  new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}
console.log(`Syntax audit: ${files.length} JavaScript files passed.`);
