// Server-only analysis logic: validation, the Claude call, output checking,
// caching, rate limiting. Imported only by /api functions.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_PROMPT, OUTPUT_TOOL, buildUserMessage, METHODOLOGY_VERSION, CATEGORIES } from "./methodology.js";

export const CODE_PATTERN = /^\d{2}-\d{4}\.\d{2}$/;
const LEVELS = ["Low", "Moderate", "High"];
const LEANS = ["lower", "higher"];

// ---------- O*NET data ----------
let onetCache = null;
export function loadOnet(path = process.env.ONET_DATA_PATH || join(process.cwd(), "data", "onet.json")) {
  if (!onetCache) onetCache = JSON.parse(readFileSync(path, "utf8"));
  return onetCache;
}
export function _setOnetForTests(data) { onetCache = data; }

export function lookupOccupation(code) {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return null;
  const onet = loadOnet();
  return Object.prototype.hasOwnProperty.call(onet.occupations, code) ? onet.occupations[code] : null;
}

// ---------- Output validation ----------
// Profanity/slur backstop. Deliberately excludes clinical words (e.g. "suicide prevention",
// "substance use") that legitimately appear in counselor or nurse task analyses.
const BLOCKED = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|nigg\w*|fagg?ot\w*|porn\w*|retard\w*)\b/i;

export function cleanText(s, max) {
  if (typeof s !== "string") return null;
  let t = s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return t;
}

export class InvalidOutputError extends Error {}

export function validateOutput(raw, taskCount) {
  const fail = (m) => { throw new InvalidOutputError(m); };
  if (!raw || typeof raw !== "object") fail("not an object");
  const summary = cleanText(raw.summary, 500) || fail("summary");
  const list = (key, max, count) => {
    if (!Array.isArray(raw[key])) fail(key);
    const out = raw[key].map((s) => cleanText(s, 150)).filter(Boolean).slice(0, max);
    if (out.length < count) fail(key);
    return out;
  };
  const takeaways = list("takeaways", 3, 2);
  const nextSteps = list("nextSteps", 4, 3);
  if (!Array.isArray(raw.tasks)) fail("tasks");

  const seen = new Set();
  const tasks = [];
  for (const t of raw.tasks) {
    if (!t || typeof t !== "object") continue;
    const n = t.n;
    if (!Number.isInteger(n) || n < 1 || n > taskCount || seen.has(n)) continue;
    if (!LEVELS.includes(t.exposure) || !LEVELS.includes(t.humanAdvantage) || !LEVELS.includes(t.uncertainty)) continue;
    if (!LEANS.includes(t.exposureLean) || !LEANS.includes(t.humanAdvantageLean)) continue;
    const label = cleanText(t.label, 70);
    const rationale = cleanText(t.rationale, 320);
    const uncertaintyReason = cleanText(t.uncertaintyReason, 180);
    if (!label || !rationale || !uncertaintyReason) continue;
    const category = CATEGORIES.includes(t.category) ? t.category : "analysis";
    seen.add(n);
    tasks.push({
      n, label, category, rationale, uncertaintyReason,
      exposure: t.exposure, exposureLean: t.exposureLean,
      humanAdvantage: t.humanAdvantage, humanAdvantageLean: t.humanAdvantageLean,
      uncertainty: t.uncertainty,
    });
  }
  if (tasks.length < Math.min(6, taskCount)) fail(`only ${tasks.length} valid tasks`);

  const allText = [summary, ...takeaways, ...nextSteps, ...tasks.flatMap((t) => [t.label, t.rationale, t.uncertaintyReason])].join(" ");
  if (BLOCKED.test(allText)) fail("content filter");
  if (/system prompt|FutureProof AI Exposure x Human|submit_four_square|<onet_occupation>/i.test(allText)) fail("prompt leakage");

  tasks.sort((a, b) => a.n - b.n);
  return { summary, takeaways, nextSteps, tasks };
}

// ---------- Quadrant mapping (ordinal, for display) ----------
// Low=1, Moderate=2, High=3; Moderate is split by its lean so it never sits on the midline.
export function ordinal(level, lean) {
  if (level === "Low") return lean === "higher" ? 0.25 : 0.12;
  if (level === "High") return lean === "lower" ? 0.75 : 0.88;
  return lean === "higher" ? 0.62 : 0.38;
}
export function quadrantOf(t) {
  const highExp = ordinal(t.exposure, t.exposureLean) > 0.5;
  const highHum = ordinal(t.humanAdvantage, t.humanAdvantageLean) > 0.5;
  if (highExp && !highHum) return "substitution";
  if (highExp && highHum) return "collaboration";
  if (!highExp && highHum) return "human";
  return "lower";
}

// ---------- Claude call ----------
export class UpstreamError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function callClaude(code, occ, { apiKey, model, fetchImpl = fetch, timeoutMs = 55000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [OUTPUT_TOOL],
        tool_choice: { type: "tool", name: OUTPUT_TOOL.name },
        messages: [{ role: "user", content: buildUserMessage(code, occ) }],
      }),
    });
    if (!res.ok) throw new UpstreamError(`Anthropic API HTTP ${res.status}`, res.status);
    const body = await res.json();
    const block = (body.content || []).find((b) => b.type === "tool_use" && b.name === OUTPUT_TOOL.name);
    if (!block) throw new InvalidOutputError("no tool_use block");
    return block.input;
  } catch (e) {
    if (e.name === "AbortError") throw new UpstreamError("timeout", 504);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyze(code, occ, opts) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callClaude(code, occ, opts);
      return validateOutput(raw, occ.tasks.length);
    } catch (e) {
      lastErr = e;
      if (!(e instanceof InvalidOutputError)) throw e; // only retry malformed output
    }
  }
  throw lastErr;
}

export function buildReport(code, occ, result, { model, demo }) {
  const onet = loadOnet();
  return {
    occupation: { code, title: occ.title, description: occ.description },
    summary: result.summary,
    takeaways: result.takeaways,
    nextSteps: result.nextSteps,
    tasks: result.tasks.map((t) => ({
      ...t,
      task: occ.tasks[t.n - 1].text,
      core: occ.tasks[t.n - 1].core,
      x: ordinal(t.humanAdvantage, t.humanAdvantageLean),
      y: ordinal(t.exposure, t.exposureLean),
      quadrant: quadrantOf(t),
    })),
    provenance: {
      tasks: { type: "verified", source: `O*NET ${onet.release} Database`, url: `https://www.onetonline.org/link/summary/${code}` },
      placements: { type: demo ? "demo" : "estimate", note: demo ? "Placeholder positions for layout preview only." : "AI-generated qualitative estimates, not measurements." },
    },
    demo: !!demo,
    model: demo ? null : model,
    method: METHODOLOGY_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

// ---------- Cache + rate limit (per server instance) ----------
// Vercel's CDN caches successful GET responses across all instances (see Cache-Control in the handler);
// this in-memory layer just avoids duplicate calls within one warm instance.
export class MemoryCache {
  constructor(max = 300) { this.max = max; this.map = new Map(); }
  get(k) { return this.map.get(k); }
  set(k, v) { if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value); this.map.set(k, v); }
}

export class RateLimiter {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  allow(key, now = Date.now()) {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.delete(this.hits.keys().next().value);
    return true;
  }
}

export class DailyCounter {
  constructor() { this.day = ""; this.count = 0; }
  take(limit, now = new Date()) {
    const d = now.toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.count = 0; }
    if (this.count >= limit) return false;
    this.count++; return true;
  }
}
