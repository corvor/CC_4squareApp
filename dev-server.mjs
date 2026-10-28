// Runs FutureProof Careers on your own computer.
//   npm run demo   -> offline demo with 8 sample careers (no internet, no API key)
//   npm start      -> full app: any O*NET career, real AI analysis (needs internet + API key)
// Opens your web browser automatically. Press Ctrl+C in this window to stop.

import { createServer } from "node:http";
import { readFile, existsSync, readFileSync, copyFileSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT); // so data/ and demo/ are found no matter where this is started from
const PUB = join(ROOT, "public");
const args = process.argv.slice(2);
const DEMO = args.includes("--demo") || process.env.DEMO_MODE === "true";
const OPEN = !args.includes("--no-open");

const say = (msg = "") => console.log(msg);
const line = () => say("─".repeat(64));

// ---------- Settings from .env.local ----------
const envFile = join(ROOT, ".env.local");
function loadEnv() {
  if (!existsSync(envFile)) return;
  for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (DEMO) {
  process.env.DEMO_MODE = "true";
} else {
  if (!existsSync(envFile)) copyFileSync(join(ROOT, ".env.example"), envFile);
  loadEnv();
  process.env.DEMO_MODE = "false";

  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key || key.includes("paste")) {
    line();
    say("The full app needs your Anthropic API key.");
    say("");
    say("  1. Open the file  .env.local  in this folder (in VS Code, it's in the file list).");
    say("  2. Paste your key after  ANTHROPIC_API_KEY=  and save the file.");
    say("     Get a key at https://console.anthropic.com/");
    say("  3. Run the full app again.");
    say("");
    say("Want to look around first? Run the demo instead: npm run demo");
    line();
    process.exit(1);
  }

  // First run: download and prepare the official O*NET career list.
  if (!existsSync(join(ROOT, "data", "onet.json")) || !existsSync(join(PUB, "occupations.json"))) {
    line();
    say("First run: downloading the official O*NET career list (about 1 minute)…");
    line();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", "build-onet.mjs")], { stdio: "inherit", cwd: ROOT });
    if (r.status !== 0) {
      say("");
      say("The O*NET download didn't finish. Check your internet connection and try again.");
      say("You can still run the demo offline: npm run demo");
      process.exit(1);
    }
  }
}

const { default: analyze } = await import("../api/analyze.js");
const demoList = DEMO ? (await import("../lib/demo.js")).demoOccupationList() : null;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path === "/api/analyze") return analyze(req, res);
  if (path === "/occupations.json" && demoList) {
    res.setHeader("Content-Type", TYPES[".json"]);
    return res.end(JSON.stringify(demoList));
  }
  const file = normalize(join(PUB, path === "/" ? "index.html" : path));
  if (!file.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
  readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.end(data);
  });
});

function openBrowser(url) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch { /* ignore */ }
}

let port = Number(process.env.PORT || 3000);
const lastPort = port + 10;
server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && port < lastPort) { port++; server.listen(port); }
  else { say(`Couldn't start the server: ${e.message}`); process.exit(1); }
});
server.on("listening", () => {
  const url = `http://localhost:${port}`;
  line();
  say(DEMO ? "FutureProof Careers — DEMO (8 sample careers, works offline)" : "FutureProof Careers — FULL APP (all O*NET careers, live AI analysis)");
  say(`Open this in your browser:  ${url}`);
  say("To stop: click in this window and press Ctrl+C");
  line();
  if (OPEN) openBrowser(url);
});
server.listen(port);
