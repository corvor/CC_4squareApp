# CC_4SquareApp: FutureProof Careers
**Diamondback Career Connections**

> **New here? Open `START-HERE.md`** to run the demo or the full app on your computer, with or without VS Code.

Students pick a career from the official O*NET list and get a four-square chart that shows each task on two axes: **AI Exposure** and **Human Comparative Advantage**.

- **Only O*NET careers can be searched.** Students choose from about 900 official occupations; anything else can't be submitted.
- **No student text reaches the AI.** The server receives only an O*NET code (like `29-1131.00`), then sends the AI the official O*NET task list for that code. That closes off prompt injection and inappropriate searches.
- **Your methodology stays private.** The research prompt lives in `lib/methodology.js` on the server. It is never sent to the browser.
- **No accounts and no personal data.** Nothing about students is collected or stored.

## Put it online (about 15 minutes)

You need a **GitHub** account, a **Vercel** account (free; sign up with GitHub), and an **Anthropic API key**.

### 1. Make a private GitHub repository
1. On github.com, click **New repository**. Name it `cc-4square-app` and choose **Private**. Keep it private: it contains your methodology.
2. Click **uploading an existing file**, then drag in **everything inside** the CC_4SquareApp folder (the `api`, `demo`, `lib`, `public`, `scripts` and `tests` folders plus the loose files). Don't upload `.env.local`, which holds your private key. Click **Commit changes**.
   - Check that `vercel.json` and `package.json` uploaded. Files whose names start with a dot (`.gitignore`, `.env.example`) sometimes get skipped; they're optional.

### 2. Get an API key and set a spending limit
1. Go to https://console.anthropic.com/, add billing, and create an API key. Copy it somewhere safe.
2. In the Console's **Limits** page, set a **monthly spend limit**. That is your real cost cap.

### 3. Deploy on Vercel
1. At https://vercel.com/new, choose **Import** next to your `cc-4square-app` repo.
2. Leave the build settings as they are; `vercel.json` handles them.
3. Open **Environment Variables** and add `ANTHROPIC_API_KEY` with your key as the value.
4. Click **Deploy**. During the build, Vercel downloads the official O*NET database and builds the career list. That takes about a minute.
5. Open the link Vercel gives you and try Veterinarian, Software Developer, and Corporate Communications.

Every time you change a file on GitHub, Vercel redeploys automatically.

## Settings (Vercel → Project → Settings → Environment Variables)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Your API key. Never put it in any file. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Which Claude model writes the analysis. |
| `ANALYSIS_ENABLED` | `true` | Set to `false` to pause new analyses. Careers already explored keep working from the cache. |
| `RATE_LIMIT_PER_HOUR` | `20` | New analyses allowed per student device per hour. |
| `DAILY_ANALYSIS_LIMIT` | `300` | Soft daily cap on new analyses. |
| `ONET_RELEASE` | `30.3` | O*NET database version. Update when O*NET publishes a new release (https://www.onetcenter.org/database.html), then redeploy. |

After changing a variable, redeploy it: **Deployments → ⋯ → Redeploy**.

## What it costs
- **Vercel:** the free Hobby plan is meant for personal, non-commercial use. Check whether your school's use fits Vercel's terms, or use a paid plan.
- **Anthropic API:** you pay per analysis (about 2,000 tokens in and 2,500 out). Each career is analyzed **once**, and Vercel's cache then serves the same chart to every student for 30 days. A class exploring 30 different careers costs 30 analyses, not one per student. See https://www.anthropic.com/pricing for current rates.
- **About the limits:** rate limits and the daily cap are counted per server instance, so they slow heavy use but are not exact. The Console spend limit is the only hard cap.

## Accuracy notes for teachers
- **Verified:** task text comes from the O*NET database (U.S. Department of Labor), with a link to O*NET OnLine.
- **Estimated:** each task's position on the chart is a qualitative AI judgment (Low / Moderate / High), not a measurement. The page labels it that way.
- High AI exposure does not mean a job will disappear, and the page says so.
- The same career returns the same chart until the cache expires (30 days) or you redeploy.

## Keeping your methodology private: what this does and doesn't do
The prompt is stored only on the server and is never sent to students' browsers. Tests check that it doesn't appear in any page file or API response. Someone studying many outputs could still **infer** the general approach. Server-side storage prevents direct access, not inference. Keep the GitHub repo **private** and give access only to people you trust.

## Changing the brand colors
The Diamondback Career Connections colors are the four `--brand-...` lines at the top of `public/styles.css`. To match an official brand guide, edit those hex values on GitHub (open the file, click the pencil icon, change the values, then click **Commit changes**). Vercel redeploys automatically. The four quadrant colors are separate on purpose, because they carry meaning on the chart.

## If something goes wrong
- **The Vercel build fails with "O*NET download failed":** O*NET may have moved to a new release. Check the version number at https://www.onetcenter.org/database.html, set `ONET_RELEASE` to it (for example `30.4`), and redeploy.
- **Students see "This app isn't set up yet":** `ANTHROPIC_API_KEY` is missing or wrong in Vercel. Fix it and redeploy.
- **"The AI service is busy":** wait a minute. If it keeps happening, check your spend limit in the Anthropic Console.

## Run it on your own computer
See `START-HERE.md`. In short, after installing Node.js:
```
npm run demo    # offline demo: 8 sample careers, no API key
npm start       # full app: all O*NET careers (key goes in .env.local)
npm test        # automated tests
```

## How it's built
No frameworks and no npm dependencies, so there's nothing to install or keep updated.

| Path | What it is |
|---|---|
| `START-HERE.md` | How to run the app on your computer |
| `Start-*.bat` / `Start-*.command` | Double-click launchers for Windows / Mac |
| `.vscode/` | VS Code tasks and Run buttons |
| `public/` | The student page (HTML, CSS, JS); `occupations.json` is generated on first full run |
| `demo/sample-reports.json` | The 8 sample careers used by the offline demo (edit to change the demo) |
| `lib/demo.js` | Serves the demo reports |
| `api/analyze.js` | The one server endpoint: `GET /api/analyze?code=29-1131.00` |
| `lib/methodology.js` | **Your private research prompt** and output schema |
| `lib/analyze.js` | Calls Claude, validates and cleans its output, caching, rate limits |
| `scripts/build-onet.mjs` | Downloads O*NET and builds the data files (on Vercel at deploy, locally on first full run) |
| `scripts/dev-server.mjs` | Runs the app on your computer (demo or full) |
| `tests/` | Automated tests (`npm test`) |

---
Includes information from the O*NET Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0 license. O*NET® is a trademark of USDOL/ETA.
