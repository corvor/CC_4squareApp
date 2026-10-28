# CC_4SquareApp (Diamondback Career Connections · FutureProof Careers) — guide for Claude Code

Four-square career explorer for high school students (ages 14–18). The student picks an official O*NET occupation, the server sends that occupation's O*NET task list to Claude, and the page plots each task by **AI Exposure** (Y) × **Human Comparative Advantage** (X). Hosted on Vercel from a private GitHub repo. See `README.md` for setup.

## Architecture (zero dependencies, by design)
- `public/`: static page (vanilla HTML/CSS/JS, SVG chart). Contains no prompts or secrets.
- `api/analyze.js`: Vercel Node function, `GET /api/analyze?code=NN-NNNN.NN`
- `lib/methodology.js`: **proprietary** system prompt and tool schema (server-only)
- `lib/analyze.js`: Claude call (raw `fetch`, forced tool use), output validation, ordinal mapping, cache, rate limits
- `scripts/build-onet.mjs`: runs on deploy; downloads the O*NET CSV zip and writes `public/occupations.json` (titles only) and `data/onet.json` (server-only tasks)
- `scripts/dev-server.mjs`: local server mimicking Vercel. `npm run demo` (offline, sample reports from `demo/sample-reports.json` via `lib/demo.js`) or `npm start` (full: auto-runs the O*NET build, reads key from `.env.local`)
- `START-HERE.md`, `Start-*.bat` / `Start-*.command`, `.vscode/`: local run instructions and launchers
- Tests: `npm test` (node:test). Keep them passing.

Do not add npm dependencies or a framework without the user's approval.

## Non-negotiable rules
1. **Only O*NET codes reach the server.** Never accept free text from students in the API or forward it to the model.
2. **Methodology stays server-side.** Never import `lib/` from `public/`, never return or log prompt text. The browser-file tests must keep passing.
3. **Never fabricate research.** O*NET task text is `verified`; placements are AI `estimate`s and are labeled that way. No invented percentages, wages, or statistics. AI exposure ≠ job loss.
4. **Validate all model output** (`validateOutput`): enums only, length caps, HTML/URL stripping, content and leakage checks. The browser renders with `textContent` only, never `innerHTML`.
5. **Classroom safety:** no accounts, no personal data, no logging of IPs with inputs.
6. **Cost:** CDN caching (`s-maxage`) is the main control. Rate limits and the daily cap are per instance and soft. The Anthropic Console spend limit is the only hard cap; never claim otherwise.

## How to work
- Run `npm test` after every change. Preview offline with `npm run demo`; the full app with `npm start`.
- Demo data is hand-written sample content and must stay labeled as demo in the UI.
- Ask before pushing to GitHub, deploying, or anything irreversible.
