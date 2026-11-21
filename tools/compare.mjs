// Diffs two probe recordings: node tools/compare.mjs <old.json> <new.json>
//
// Every difference is printed with its path, old value and new value, so each
// one can be explained in the hand-over. Only the clock the status line shows
// (the sync time, which differs between any two runs) is masked.

import { readFileSync } from "node:fs";

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) {
  console.error("usage: node tools/compare.mjs <old.json> <new.json>");
  process.exit(2);
}

const before = JSON.parse(readFileSync(oldPath, "utf8"));
const after = JSON.parse(readFileSync(newPath, "utf8"));

/** The one value that is different on every run: the minute the sync happened. */
const mask = (text) => (typeof text === "string" ? text.replace(/\b\d{1,2}:\d{2}\b/g, "HH:MM") : text);

const differences = [];
const diff = (path, a, b) => {
  if (a === b) return;
  if (typeof a === "string" || typeof b === "string") {
    if (mask(a) === mask(b)) return;
    differences.push({ path, before: a, after: b });
    return;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    differences.push({ path, before: a, after: b });
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) diff(`${path}.${key}`, a[key], b[key]);
};

const stepsBefore = new Map(before.steps.map((step) => [step.name, step]));
const stepsAfter = new Map(after.steps.map((step) => [step.name, step]));
let compared = 0;
for (const [name, step] of stepsBefore) {
  const other = stepsAfter.get(name);
  if (!other) {
    differences.push({ path: `step:${name}`, before: "present", after: "missing" });
    continue;
  }
  compared += 1;
  diff(`step:${name}`, step, other);
}

console.log(`steps compared: ${compared} (old ${before.steps.length}, new ${after.steps.length})`);
console.log(`differences: ${differences.length}`);
for (const difference of differences) {
  console.log(`\n- ${difference.path}`);
  console.log(`  old: ${JSON.stringify(difference.before)}`);
  console.log(`  new: ${JSON.stringify(difference.after)}`);
}
process.exit(differences.length === 0 ? 0 : 1);
