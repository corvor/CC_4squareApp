// GET /api/analyze?code=29-1131.00
// Only accepts official O*NET-SOC codes that exist in the deployed O*NET data.
// No free text from students ever reaches the model.

import {
  CODE_PATTERN, lookupOccupation, analyze, buildReport,
  MemoryCache, RateLimiter, DailyCounter, UpstreamError, InvalidOutputError,
} from "../lib/analyze.js";
import { demoReport } from "../lib/demo.js";

const cache = new MemoryCache();
const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
const daily = new DailyCounter();

function send(res, status, body, cacheable = false) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Cache-Control",
    cacheable ? "public, max-age=3600, s-maxage=2592000, stale-while-revalidate=86400" : "no-store"
  );
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

const fail = (res, status, code, message) => send(res, status, { error: code, message });

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "method", "Method not allowed.");
  }

  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code") || "";
  if (!CODE_PATTERN.test(code)) return fail(res, 400, "invalid_code", "Please pick a career from the list.");

  // Offline demo: sample reports only, no AI call.
  if (process.env.DEMO_MODE === "true") {
    const report = demoReport(code);
    if (!report) return fail(res, 404, "unknown_code", "The demo includes 8 sample careers. Please pick one from the list.");
    return send(res, 200, report, false);
  }

  let occ;
  try {
    occ = lookupOccupation(code);
  } catch {
    return fail(res, 500, "data_missing", "Career data isn't available right now. Please tell your teacher.");
  }
  if (!occ) return fail(res, 404, "unknown_code", "That career isn't in the O*NET list. Please pick one from the suggestions.");

  const cached = cache.get(code);
  if (cached) return send(res, 200, cached, true);

  if (process.env.ANALYSIS_ENABLED === "false") {
    return fail(res, 503, "paused", "New career analyses are paused right now. Careers other students already explored still work.");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(res, 500, "not_configured", "This app isn't set up yet (missing API key). Please tell your teacher.");
  }
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (!limiter.allow(ip)) {
    return fail(res, 429, "rate_limited", "You've explored a lot of careers! Please wait a bit and try again.");
  }
  if (!daily.take(Number(process.env.DAILY_ANALYSIS_LIMIT || 300))) {
    return fail(res, 503, "daily_limit", "Today's limit for new analyses has been reached. Please try again tomorrow.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  try {
    const result = await analyze(code, occ, { apiKey: process.env.ANTHROPIC_API_KEY, model });
    const report = buildReport(code, occ, result, { model, demo: false });
    cache.set(code, report);
    return send(res, 200, report, true);
  } catch (e) {
    // Log only the error category: never prompts, inputs, or IPs.
    if (e instanceof UpstreamError) {
      console.error(`analyze: upstream ${e.status}`);
      if (e.status === 429 || e.status === 529) return fail(res, 503, "busy", "The AI service is busy. Please try again in a minute.");
      if (e.status === 504) return fail(res, 504, "timeout", "That took too long. Please try again.");
      if (e.status === 401 || e.status === 403) return fail(res, 500, "not_configured", "This app's API key isn't working. Please tell your teacher.");
      return fail(res, 502, "upstream", "Something went wrong reaching the AI service. Please try again.");
    }
    if (e instanceof InvalidOutputError) {
      console.error("analyze: invalid model output");
      return fail(res, 502, "invalid_output", "We couldn't build a reliable chart for that career. Please try again.");
    }
    console.error("analyze: unexpected error");
    return fail(res, 500, "error", "Something went wrong. Please try again.");
  }
}
