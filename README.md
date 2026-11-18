# Career Studio — ATS-First Resume Generator & Job Search Workspace

A lightweight, **ATS-first resume generator and career management platform** built for software engineers who want full control over their resume, applications, and market positioning — without paid builders, watermarks, or black-box templates.

Edit a single structured JSON (or use the visual editor) and generate:

- **ATS-safe HTML & printable A4 PDF** with clickable links
- **ATS-safe Word (`.docx`)** generated natively in Node.js (zero external dependencies) — single column, Arial, clean section headings, dates alongside roles, ready for **Gupy, Greenhouse, Lever, and Workday**
- **AI-tailored versions** powered by Gemini without ever inventing experiences or altering contacts

Live app: https://ats-resume-generator-html-virid.vercel.app

---

## Key Features

### 1. ATS-First Resume Studio (`Adaptar com IA`, `Editar currículo`, `JSON`)
- **Experience-first structure (1–2 pages)**: focuses on **Professional Experience**, with **LinkedIn, GitHub, and Portfolio** links in the header and standalone `Projects` omitted by default (`projects: []`, while `portfolio_projects` stays indexed behind the scenes for gap analysis).
- **3 Strategic CV Versions** (1-click switching using the same real career history):
  - **CV 01 — Full Stack Engineer (Primary)**: React, TypeScript, Node.js, PHP, REST APIs, PostgreSQL, and architecture
  - **CV 02 — Cloud / DevOps Engineer**: AWS (`EC2, S3, ECS, EKS, RDS, Lambda, SQS, IAM`), Docker, Kubernetes, Terraform, CI/CD, and observability
  - **CV 03 — Software Engineer**: System Design, architecture, corporate integrations, backend, and software quality
- **Live A4 Preview & Fullscreen Mode**: proportional 794px A4 preview with explainable **ATS Score** breakdown, page-count estimator, HTML copy, browser print, **DOCX download**, and **PDF export**.
- **AI Resume Tailoring (Gemini)**: adapts keywords naturally into real bullets, expands acronyms on first use (e.g., *Continuous Integration and Continuous Delivery (CI/CD)*, *Infrastructure as Code (IaC)*), avoids buzzwords/inflated seniority, and locks contact/link fields via `PROTECTED_FIELDS`.

### 2. Pre-Application ATS Toolkit (Gupy & International)
- **Instant Pre-Apply Fit Check**: paste a job description to see real stack match %, matched skills, honest gaps, and an early warning for low-alignment roles.
- **Ready-to-Copy Application Kit**: auto-tailored **Gupy *"Apresente-se"*** pitch, **LinkedIn recruiter message** (auto-switches between English and Portuguese), and **ATS-optimized LinkedIn Headline**.
- **Interactive 10-Point Pre-Apply Checklist**: persisted locally with progress bar and reset button.
- **Official ATS Resources**: quick links to Jobscan, Teal, Resume Worded, Gupy's official guidelines, and the U.S. Department of Labor *Resume Essentials*.

### 3. Real Jobs Only (`Vagas`)
Collected daily via GitHub Actions (`.github/workflows/daily-jobs-sync.yml`) from:
- **Company career sites**: Greenhouse, Lever, Ashby, and Gupy boards (`data/job-sources.json`)
- **Aggregators**: Himalayas (Brazil-eligible), Remotive, Jobicy, Remote OK
- **Communities**: GitHub issues (`backend-br/vagas`, `frontendbr/vagas`, `react-brasil/vagas`)

Every listing passes through `lib/job-quality.mjs`:
- Drops jobs older than `JOBS_MAX_AGE_DAYS` (default `30`), talent pools, expired deadlines, and broken links
- Deduplicates across sources, keeping the official company-site listing
- Filters for software engineering roles (on-site/hybrid in Greater Belo Horizonte, Brazil remote, or international remote accepting Brazil without visa sponsorship)

### 4. Applications Tracker & Funnel Diagnosis (`Candidaturas`)
- Tracks every application from submission to offer with stage history, next-step reminders, **CV version used**, and CSV export (UTF-8 BOM, `;` separator).
- **Automatic Funnel Diagnosis**: surfaces actionable hypotheses based on your real conversion stages (low interview rate, pre-technical drop-off, technical stage, final round, or offer negotiation).

### 5. Tech Events & Technical Articles (`Eventos`, `Artigos`)
- **Tech Events (`Eventos`)**: daily curated upcoming meetups, workshops, and conferences — **in-person/hybrid in Belo Horizonte** and **100% online (Brazil & Global)** from Sympla, GDG BH/Virtual, CNCF, Agenda Tech Brasil, Confs.tech, and Dev.events, with 1-click **Google Calendar** export.
- **Technical Articles (`Artigos`)**: daily engineering reading feed across 2027 pillars (Architecture/System Design, Applied AI, AWS/Cloud/DevOps, Full Stack, Quality/Security) from TabNews (PT-BR), AWS Architecture Blog, Martin Fowler, Cloudflare Blog, DEV.to, and Hacker News — with PT/EN filter, saved list, and read tracking.

### 6. Automatic & Evolutionary Project Ideas Backlog (`Ideias de projetos`)
- Pre-populated automatically (`data/project-ideas-cache.json`) from live market skill gaps (`lib/skill-gap.mjs`), recognizing both `resume.projects` and `resume.portfolio_projects`.
- **`+ Novas ideias`**: generates distinct new project ideas deduplicated against existing, dismissed, and portfolio projects.
- **`Melhorar` / `Evoluir 1 ideia`**: upgrades any existing idea in-place (`v1 → v2 → v3`) with deeper architecture, observability, security, and testing deliverables (via Gemini or deterministic engineering rules).
- **Daily Auto-Evolution**: `scripts/fetch-project-ideas.mjs` runs daily in GitHub Actions to add a new distinct idea or evolve an existing one.

### 7. Learning Hub & StudyFlow API (`Learning Hub`, `/api/study-plan`)
- Centralizes courses, **official certifications**, completion certificates, badges, workshops, and learning goals with full CRUD, hours/progress tracking, investment by currency, validity/expiration alerts, official links, proof links, and verification dates (`verified_at`).
- **4-Level Skill Evidence Matrix** (`lib/skill-gap.mjs` + `lib/learning.mjs`): differentiates *Missing*, *Declared in CV*, *Demonstrated in project*, and *Validated by official certification* — automatically blocking introductory course recommendations for already demonstrated/certified skills.
- **Read-only CV & LinkedIn export**: generates copyable blocks without ever mutating the base resume.
- **StudyFlow Integration API (`GET`/`POST /api/study-plan`)**: exposes a versioned JSON contract (`schema_version: "1.0"`) with priority skills to improve (not just certifications), learning items/deadlines/dependencies, official recommendations, and hands-on projects for external study scheduling in StudyFlow.
- Per-user Firebase sync under `careerStudio/{uid}/data/learning` (isolated by `firestore.rules`).

### 8. Talent Platforms Tracker & Cloud Sync (`Cadastros`, Firebase)
- Tracks 32+ BR and international hiring platforms (`data/talent-platforms.json`, including Wellfound, We Work Remotely, Remote OK, YC Work at a Startup, OpenAbroad, and Globally Remote Jobs) and flags profiles as **outdated** whenever the portfolio repo updates.
- Optional **Firebase Auth & Firestore** sync (`web/cloud.js`, `firestore.rules`) across devices; works 100% offline/local without signing in.

---

## Project Structure

```text
ats-resume-generator-html/
├─ templates/
│  ├─ ats.html                   # Single-column ATS-first HTML template
│  └─ style.css                  # Print-safe A4 CSS
├─ data/
│  ├─ resume.json                # Base structured resume (Experience-first)
│  ├─ resume-pt.json             # Portuguese mirror
│  ├─ jobs-cache.json            # Daily verified job listings
│  ├─ events-cache.json          # Daily upcoming tech events (BH + Online)
│  ├─ articles-cache.json        # Daily curated engineering articles (PT/EN)
│  ├─ project-ideas-cache.json   # Daily evolving project ideas backlog
│  ├─ job-sources.json           # Company ATS boards configuration
│  └─ talent-platforms.json      # BR & international hiring platforms
├─ lib/                          # Shared pure/server logic (CLI, Express & Vercel)
│  ├─ render.mjs                 # JSON → HTML renderer
│  ├─ render-files.mjs           # Disk helpers for template loading & dist output
│  ├─ docx.mjs                   # Zero-dependency ATS Word (.docx / OOXML) generator
│  ├─ ats-score.mjs              # Explainable ATS scoring engine
│  ├─ ats-handler.mjs            # /api/ats-score handler
│  ├─ gemini.mjs                 # Gemini AI tailoring + model fallback + protected fields
│  ├─ job-sources.mjs            # Multi-source job collectors
│  ├─ job-quality.mjs            # Ghost-job, role, location & sector filters
│  ├─ jobs-filter.mjs            # Job search, facets & sorting
│  ├─ events.mjs                 # Tech event parser, location classifier & filters
│  ├─ articles.mjs               # RSS/Atom parser, language & 2027 topic classifier
│  ├─ skill-gap.mjs              # Market demand vs. resume & portfolio proof analysis
│  ├─ project-ideas.mjs          # Backlog persistence, deduplication & idea evolution
│  ├─ talent.mjs                 # Talent platforms tracker
│  └─ runtime.mjs                # Serverless detection & CRON_SECRET auth
├─ api/                          # Vercel serverless endpoints
│  ├─ render.js                  # POST /api/render
│  ├─ export-docx.js             # POST /api/export-docx
│  ├─ optimize.js                # POST /api/optimize
│  ├─ ats-score.js               # POST /api/ats-score
│  ├─ resume.js                  # GET/POST /api/resume
│  ├─ sync-portfolio.js          # POST /api/sync-portfolio
│  ├─ jobs.js                    # GET /api/jobs
│  ├─ events.js                  # GET /api/events
│  ├─ articles.js                # GET /api/articles
│  ├─ project-ideas.js           # GET/POST /api/project-ideas
│  └─ talent.js                  # GET/POST /api/talent
├─ scripts/
│  ├─ server.mjs                 # Local Express web server
│  ├─ render.mjs                 # CLI: build dist/cv.html
│  ├─ export-pdf.mjs             # CLI: export dist/cv.pdf (Playwright)
│  ├─ optimize.mjs               # CLI: tailor resume via Gemini
│  ├─ sync-portfolio.mjs         # Sync base resume from GitHub portfolio locales
│  ├─ fetch-jobs.mjs             # Collect real jobs into data/jobs-cache.json
│  ├─ fetch-events.mjs           # Collect upcoming BH & online tech events
│  ├─ fetch-articles.mjs         # Collect curated engineering articles
│  └─ fetch-project-ideas.mjs    # Evolve daily project ideas backlog
├─ web/                          # Zero-framework responsive & WCAG 2.1 AA web app
├─ tests/                        # node:test suite (53 unit tests)
├─ .github/workflows/
│  └─ daily-jobs-sync.yml        # Automated daily sync (07:00 BRT)
└─ vercel.json                   # Vercel functions, includeFiles & OWASP headers
```

---

## Installation & Running Locally

Requirements: **Node.js 20+** and **npm**.

```bash
npm install
npx playwright install   # Optional: required only for local PDF export
```

Start the local web app:

```bash
npm run server           # http://localhost:3000
```

### Available Commands

| Command | Description |
| --- | --- |
| `npm run server` | Starts the local Career Studio web app (`http://localhost:3000`) |
| `npm run build` | Renders `data/resume.json` into `dist/cv.html` |
| `npm run pdf` | Exports `dist/cv.html` to A4 `dist/cv.pdf` via Playwright |
| `npm run optimize` | Tailors `data/resume.json` to `data/job-description.txt` with Gemini |
| `npm run sync` | Rebuilds `data/resume.json` from the portfolio repository |
| `npm run jobs` | Refreshes `data/jobs-cache.json` |
| `node scripts/fetch-events.mjs` | Refreshes `data/events-cache.json` |
| `node scripts/fetch-articles.mjs` | Refreshes `data/articles-cache.json` |
| `node scripts/fetch-project-ideas.mjs` | Evolves `data/project-ideas-cache.json` |
| `npm test` | Runs the full `node:test` test suite (53 tests) |

---

## Security & Accessibility

- **OWASP Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` configured in both `vercel.json` and `scripts/server.mjs` (`X-Powered-By` disabled).
- **Safe Output & URLs**: HTML/XML escaping across all templates (`lib/render.mjs`, `lib/docx.mjs`, `web/app.js`) and strict `http(s):` protocol checks on external links.
- **Protected Refresh Endpoints**: live `?refresh=true` calls on `/api/jobs`, `/api/events`, and `/api/articles` require `Authorization: Bearer <CRON_SECRET>` in production.
- **Accessibility (WCAG 2.1 AA)**: skip-to-content link, unique ARIA landmarks, labeled inputs/buttons, `aria-current`, `aria-pressed`, `aria-live`, AA color contrast, and `prefers-reduced-motion` support.

---

## Environment Variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | `.env` / Vercel | Default key for AI tailoring & idea generation (can also be pasted per-browser in the UI) |
| `GEMINI_MODELS` | optional | Comma-separated model fallback list (e.g. `gemini-3.6-flash,gemini-flash-latest`) |
| `JOBS_MAX_AGE_DAYS` | optional | Maximum job age in days (default `30`) |
| `GITHUB_TOKEN` | optional | Higher GitHub API rate limit for community jobs (auto-provided in GitHub Actions) |
| `CRON_SECRET` | Vercel, optional | Bearer token required to trigger live `?refresh=true` endpoints in production |

---

## Deploy (Vercel)

Because Vercel's serverless filesystem is read-only:
- `data/jobs-cache.json`, `data/events-cache.json`, `data/articles-cache.json`, and `data/project-ideas-cache.json` are refreshed daily by `.github/workflows/daily-jobs-sync.yml` and bundled via `vercel.json` (`includeFiles`);
- Resume edits, checklist progress, ideas backlog status, and applications are persisted in `localStorage` (or synced across devices when signed in with Firebase);
- DOCX generation (`/api/export-docx`) runs 100% in-memory on Vercel Serverless with zero external binaries.

---

## Output Example

![ATS Resume Preview](data/cv-example.png)
