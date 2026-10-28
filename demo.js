// Offline demo: serves hand-written sample reports for 8 careers.
// No internet, no API key, no O*NET download needed. Clearly labeled as demo data in the page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ordinal, quadrantOf } from "./analyze.js";

const LEVEL = { L: "Low", M: "Moderate", H: "High" };
const LEAN = { "+": "higher", "-": "lower" };

let cache = null;
function load() {
  if (!cache) {
    const path = process.env.DEMO_DATA_PATH || join(process.cwd(), "demo", "sample-reports.json");
    cache = JSON.parse(readFileSync(path, "utf8"));
  }
  return cache;
}

function rating(code) {
  const level = LEVEL[code[0]], lean = LEAN[code[1]];
  if (!level || !lean) throw new Error(`Bad rating "${code}" in demo/sample-reports.json`);
  return [level, lean];
}

export function demoOccupationList() {
  return {
    release: "demo",
    demo: true,
    occupations: load().careers.map((c) => ({ c: c.code, t: c.title, a: c.alsoCalled || [] })),
  };
}

export function demoReport(code) {
  const c = load().careers.find((x) => x.code === code);
  if (!c) return null;
  const tasks = c.tasks.map((row, i) => {
    const [label, category, exp, hum, task, rationale] = row;
    const [exposure, exposureLean] = rating(exp);
    const [humanAdvantage, humanAdvantageLean] = rating(hum);
    const t = {
      n: i + 1, label, category, task, rationale,
      exposure, exposureLean, humanAdvantage, humanAdvantageLean,
      uncertainty: "Moderate", uncertaintyReason: "Sample placement for the demo; AI tools in this area are changing quickly.",
      core: i < 9,
    };
    // Same mapping as live reports: x = human advantage, y = AI exposure.
    return { ...t, x: ordinal(humanAdvantage, humanAdvantageLean), y: ordinal(exposure, exposureLean), quadrant: quadrantOf(t) };
  });
  return {
    occupation: { code: c.code, title: c.title, description: "" },
    summary: c.summary,
    takeaways: c.takeaways,
    nextSteps: c.nextSteps,
    tasks,
    provenance: {
      tasks: { type: "demo", source: "sample task list written for the demo (simplified wording)", url: `https://www.onetonline.org/link/summary/${c.code}` },
      placements: { type: "demo", note: "Sample placements written to preview the app, not an AI analysis." },
    },
    demo: true,
    model: null,
    method: "demo",
    generatedAt: null,
  };
}
