This project is a lightweight, ATS-first resume generator built for developers and technical professionals who want **full control** over their resume without relying on paid resume builders or restrictive visual editors.

You edit a single structured JSON file, and the system generates:

- a clean, ATS-friendly HTML resume
- a printable PDF with clickable links

No subscriptions. No watermarks. No hidden limitations.

🔗 Community Discord: https://discord.gg/4JcxJfXQ

---

## Why this project exists

Many resume builders:

- charge to unlock basic features
- limit formatting unless you pay
- store your data on third-party platforms
- generate PDFs that break ATS parsing

This project takes a different approach:

- **Content-first**: your resume lives in a JSON file
- **ATS-first**: single column, clean text, no icons or tables
- **Reproducible**: same input always generates the same output
- **Offline & open-source**: no account, no tracking, no lock-in

If you can edit a JSON file, you can generate a professional ATS-compatible resume.

---

## How it works

1. You edit `data/resume.example.json`
2. The project renders it into a clean HTML resume
3. The HTML is exported to PDF using a headless browser
4. The final PDF preserves:
   - layout consistency
   - text structure for ATS
   - clickable links (`<a href>`)

---

## Project Structure

📦 cv-ats-html<br>
├─ 📁 templates<br>
│ ├─ 📄 ats.html # ATS-first HTML template (single column)<br>
│ └─ 📄 style.css # Print-safe, ATS-safe styles<br>
│<br>
├─ 📁 data<br>
│ └─ 📄 resume.example.json # Structured resume data (edit this file)<br>
│<br>
├─ 📁 lib # Shared logic (used by CLI, local server and Vercel API)<br>
│ ├─ 📄 render.mjs # JSON → HTML (pure function)<br>
│ ├─ 📄 job-sources.mjs # Job sources (company career sites, aggregators, communities)<br>
│ ├─ 📄 job-quality.mjs # Ghost-job filter, location and role rules<br>
│ ├─ 📄 skill-gap.mjs # Jobs x resume technology gap analysis<br>
│ ├─ 📄 project-ideas.mjs # Portfolio project ideas (AI + curated catalog)<br>
│ ├─ 📄 talent.mjs # Talent platforms tracker<br>
│ ├─ 📄 jobs-filter.mjs # Job search filter<br>
│ ├─ 📄 gemini.mjs # AI resume tailoring (prompt + model fallback)<br>
│ └─ 📄 runtime.mjs # Serverless detection / CRON_SECRET auth<br>
│<br>
├─ 📁 api # Vercel serverless functions<br>
├─ 📁 web # Web app (editor, preview, job matcher)<br>
├─ 📁 tests # node:test suite (`npm test`)<br>
│<br>
├─ 📁 scripts<br>
│ ├─ 📄 render.mjs # Renders JSON → HTML<br>
│ ├─ 📄 export-pdf.mjs # Exports HTML → PDF (Playwright)<br>
│ ├─ 📄 optimize.mjs # Tailors the resume to data/job-description.txt (Gemini)<br>
│ ├─ 📄 fetch-jobs.mjs # Collects job listings into data/jobs-cache.json<br>
│ ├─ 📄 sync-portfolio.mjs # Rebuilds data/resume.json from the portfolio repo<br>
│ └─ 📄 server.mjs # Local web server (Express)<br>
│<br>
├─ 📁 dist # Generated output (gitignored)<br>
│ ├─ 📄 cv.html<br>
│ └─ 📄 cv.pdf<br>
│<br>
├─ 📄 package.json # Project scripts and dependencies<br>
├─ 📄 package-lock.json # Dependency lockfile<br>
├─ 📄 .gitignore # Ignores node_modules, dist, PDFs<br>
└─ 📄 README.md # Documentation and usage guide<br>

---

## Installation

Requirements:

- Node.js **20+**
- npm

Clone the repository and install dependencies:

```bash
npm install
```

Install Playwright browsers (required for PDF export):

```bash
npx playwright install
```

---

## Usage

1. Edit your resume data

Open and edit:
data/resume.example.json
This is the only file you need to change.

2. Generate HTML resume

```bash
npm run build
```

Output:

`dist/cv.html`

3. Generate PDF resume

```
npm run pdf
```

Output:
`dist/cv.pdf`

4. Web app (editor + live preview + AI tailoring + job matcher)

```bash
npm run server   # http://localhost:3000
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run optimize` | Tailors `data/resume.json` to `data/job-description.txt` with Gemini |
| `npm run jobs` | Refreshes `data/jobs-cache.json` |
| `npm run sync` | Rebuilds `data/resume.json` from the portfolio repository |
| `npm test` | Runs the test suite |

## Job search: real jobs only

`npm run jobs` (and the daily GitHub Action) collects jobs from three kinds of sources:

| Source type | Where | Why it's trustworthy |
| --- | --- | --- |
| **Company career sites** | Greenhouse, Lever, Ashby and Gupy boards listed in `data/job-sources.json` (Banco Inter, Stone, Nubank, CI&T, Rede D'Or, Afya, Cogna, Localiza…) | Read straight from the company's official applicant tracking system: a job is listed only while it is open |
| Aggregators | Himalayas (Brazil-eligible search), Remotive, Jobicy, Remote OK | Publication date required; link checked on every run |
| Communities | GitHub issues in `backend-br/vagas`, `frontendbr/vagas`, `react-brasil/vagas` | Open issues only, no "closed/filled" labels |

Ghost-job filter (`lib/job-quality.mjs`), applied to every job:

- published more than `JOBS_MAX_AGE_DAYS` (default 30) days ago → dropped
- talent pools / general applications ("banco de talentos", "talent community"…) → dropped
- application deadline passed, or Gupy status not `published` → dropped
- aggregator link returns 404/410 or redirects to the generic careers page → dropped
- duplicates across sources → merged, keeping the company-site version
- only software roles; on-site/hybrid only in Greater Belo Horizonte; remote in Brazil; international remote only when it accepts Brazil (no visa)

If a source is down during a run, its jobs from the previous run are reused (still subject to the filter).
To add a company, put its board token in `data/job-sources.json`.

## Project ideas

The **Ideias de Projetos** tab counts the technologies requested by active jobs and compares them with the resume:
missing technologies, and technologies listed in skills but **not proven by any project**. It then suggests portfolio
projects that cover those gaps: generated by Gemini when a key is available, otherwise from a curated catalog (`lib/project-ideas.mjs`).

## Talent platforms tracker

The **Cadastros** tab lists 27 sites where companies look for candidates (`data/talent-platforms.json`). Check each one after
signing up. When the portfolio repository changes (last commit in `src/locales`), every profile updated before that
turns orange (**outdated**) until you click "Atualizei". No database needed: locally the state is saved in
`data/talent-status.json` (versioned in git, so it follows you across machines); on Vercel it is kept in the browser.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | `.env` / Vercel | Default key for AI tailoring (users can also paste their own key in the UI) |
| `GEMINI_MODELS` | optional | Comma-separated model fallback list, e.g. `gemini-3.6-flash,gemini-flash-lite-latest` |
| `JOBS_MAX_AGE_DAYS` | optional | Maximum job age in days (default `30`) |
| `GITHUB_TOKEN` | optional | Higher GitHub API rate limit for community jobs / portfolio checks (set automatically in GitHub Actions) |
| `CRON_SECRET` | Vercel, optional | Required (as `Authorization: Bearer …`) to force a live job refresh with `/api/jobs?refresh=true` in production |

## Deploy (Vercel)

The Vercel filesystem is read-only, so in production:

- job listings come from `data/jobs-cache.json`, refreshed daily by the GitHub Action (`.github/workflows/daily-jobs-sync.yml`);
- "save base resume" stores the resume in the browser (localStorage) instead of the server;
- portfolio sync returns the rebuilt resume to the browser without writing files.

## The PDF:

- is A4-ready
- keeps links clickable
- is safe for ATS parsing
- is suitable for direct job applications

## Output Example

![Screenshot](data/cv-example.png)

