# Expovision

Expovision is a learning platform for running a 14-day IT/AI intensive as a managed route. A student activates access with a license token, takes a short onboarding diagnostic and then moves through the programme day by day: each day unlocks on schedule and combines lessons, reading materials, a homework assignment with a deadline and live webinars. On day 7 the student picks one of three tracks (IT careers, AI systems for work, or building a first product/MVP), and after the intensive ends they request a certificate. Curators run cohorts ("flows") from an admin console: they issue access tokens, edit the programme, review homework with written feedback and issue certificates. A community hub with a moderated Q&A feed and chats sits next to the learning space.

> This is a trimmed public version prepared for hackathon review; some modules of the production product are not included.
>
> Course content: only programme days 1–2 ship with full lessons, materials and homework. Days 3–14 keep their structure, schedule and titles, with short placeholders instead of the lesson and assignment texts.

## Key features

**Student side**

- **Access and accounts**: activation with a single-use license token bound to a cohort, sign-in with JWT access/refresh tokens and one active session per account, profile, avatar, password change.
- **Onboarding and route gate**: a five-question diagnostic produces a learner profile and a recommended track; an initial report unlocks the route map.
- **Daily programme**: 14 days unlocked from the cohort start date, lessons with notes and HTML reading materials, optional video (direct URL or Kinescope), day artifacts, progress tracking and a dashboard with the next step, deadlines and stats.
- **Homework**: per-day assignments with drafts, file attachments, on-time/overdue deadlines and curator verdicts with comments.
- **Track choice**: from day 7 the student picks track A, B or C, which shapes days 8–14.
- **Webinars**: cohort webinar schedule with join links, calendar export and an in-app player for Kinescope streams and recordings.
- **Final section and certificates**: after the intensive the student requests a certificate, the curator uploads the PDF or declines with a comment, and the student downloads it.
- **Course library**: full courses assembled from lessons, opened in full once the intensive is over.
- **Cohort chat**: a shared chat per cohort with automatic events (lesson completed, homework approved) and congratulations.
- **Community hub**: separate community accounts, pre-moderated discussion topics and short notes, Q&A feed, archive of closed discussions with summaries, votes, bookmarks, follows, public profiles, direct and group chats with image attachments, anonymous posting, blocking and reporting.
- **Bilingual interface**: Russian and English UI and course content, switchable at any time; installable as a PWA.

**Curator / admin console**

- Dashboard with platform stats and recent activity.
- Cohorts: create and duplicate flows, set dates, manage members, choose programme days, attach and order webinars, view the leaderboard.
- License tokens: generate and track activation tokens per cohort.
- Programme editor: days, lessons, webinars, artifacts and homework templates; course builder for the library.
- Users and student profiles with progress, password reset and role management.
- Homework review queue and history, certificate requests, community moderation (topics and users), cohort chat moderation and an audit log of admin actions.

**Optional AI assistance**

With an API key for a hosted LLM (Google GenAI SDK) the platform adds a homework coach, a homework integrity check, draft feedback for curators, a dashboard assistant and summaries of closed community discussions. Without a key the platform works fully: these endpoints answer `503` or fall back to deterministic logic.

## Architecture

```
Browser ── Next.js (App Router, React) ──fetch + JWT──> FastAPI REST API ──> PostgreSQL
                                                          │  ├─> Redis (rate limiting; in-memory fallback)
                                                          │  └─> /uploads volume (avatars, attachments, certificates)
                                                          └─> optional: Kinescope API, LLM API
```

- **Frontend** (`frontend/`): Next.js App Router application with client components; it talks to the API directly using `NEXT_PUBLIC_API_BASE_URL` and stores the session in `localStorage`.
- **Backend** (`backend-fastapi/`): FastAPI routers per domain (auth, onboarding, dashboard, curriculum, homework, track, final, webinar, chat, community, admin) over SQLAlchemy with explicit SQL. Role checks (`student`, `admin`) are FastAPI dependencies; sliding-window rate limits use Redis.
- **Database**: PostgreSQL schema and the 14-day curriculum content are created by Alembic migrations, applied automatically when the backend container starts.
- **Shared contracts** (`shared/contracts/`): zod schemas for the main API payloads.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, TipTap, marked / react-markdown, DOMPurify, Vitest, Testing Library |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, python-jose, passlib (bcrypt), httpx, redis-py, pytest |
| Data | PostgreSQL 16, Redis 7 |
| Tooling | Docker Compose, npm workspaces |

## Running locally

Requirements: Docker with Docker Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

The first start takes a few minutes: the backend applies the database migrations and the frontend installs its dependencies inside the container. Then open:

| Service | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:4000 |
| API docs (OpenAPI) | http://localhost:4000/docs |
| PostgreSQL | localhost:5432 (user, password and database: `intensive`) |
| Redis | localhost:6379 |

If a port is already taken, change `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` or `REDIS_PORT` in `.env`, and keep `NEXT_PUBLIC_API_BASE_URL` and `FRONTEND_ORIGINS` in sync with them.

### Demo data

The API creates the administrator account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on startup. To add a demo cohort, run the seed script once the API is up:

```bash
docker compose exec backend python scripts/seed_demo.py
```

It is idempotent and creates fictional data only:

| Role | Sign-in | Credentials |
| --- | --- | --- |
| Curator / admin | http://localhost:3000/admin/login | `admin@example.com` / `Admin12345!` (values from `.env`) |
| Student | http://localhost:3000/login | `student@example.com` / `Student12345!` |
| New student | http://localhost:3000/activate | any of the spare license tokens printed by the script |

The demo cohort started yesterday, so days 1–2 (the days with full content) are open. The demo student has finished onboarding, completed the day 1–2 lessons and submitted the day-2 homework, which waits in the curator review queue. Later days unlock one per day; to look at them sooner, set an earlier start date for the cohort under Flows in the admin console. Community accounts are separate: sign up at http://localhost:3000/community; new topics appear after an admin approves them under Moderation.

Each account has one active session, so signing in elsewhere (including the seed script, which signs in as the admin) ends the previous session of that account.

### Environment variables

`.env.example` lists every variable with a placeholder. The ones you may want to change:

| Variable | Purpose |
| --- | --- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrator account created on startup |
| `NEXT_PUBLIC_API_BASE_URL`, `FRONTEND_ORIGINS` | API URL for the browser and allowed CORS origins |
| `PASSWORD_RESET_RETURN_TOKEN_IN_RESPONSE` | The app sends no email; set to `true` locally to receive the reset token in the API response |
| `GOOGLE_API_KEY`, `GOOGLE_GEMINI_MODEL` | Optional AI assistance |
| `KINESCOPE_API_TOKEN`, `KINESCOPE_PROJECT_ID`, other `KINESCOPE_*` | Optional video hosting for lesson videos and live webinars |

### Tests and checks

```bash
# Backend unit tests (no database needed)
cd backend-fastapi
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
pytest -q

# Frontend unit tests, type check and production build (from the repository root)
npm ci
npm test -w frontend
npx tsc --noEmit -p frontend
npm run build
```

## Project structure

```
.
├── backend-fastapi/
│   ├── alembic/versions/   # schema and curriculum content migrations
│   ├── app/
│   │   ├── api/            # routers: auth, onboarding, dashboard, curriculum, homework,
│   │   │                   # track, final, webinar, chat, community, admin, health
│   │   ├── core/           # settings, security (JWT, hashing), rate limiting
│   │   ├── db/             # engine and session
│   │   ├── deps/           # auth dependencies and role checks
│   │   ├── schemas/        # shared request models
│   │   └── services/       # unlock rules, mastery, chat events, AI and Kinescope clients
│   ├── scripts/seed_demo.py
│   └── tests/
├── frontend/
│   ├── public/             # brand assets, PWA manifest, service worker, lesson materials
│   └── src/
│       ├── app/            # routes: student pages, /admin console, /community hub
│       ├── features/       # API client, i18n, dashboard, lesson, homework, community, admin modules
│       └── shared/ui/      # shared layout and UI components
├── shared/contracts/       # zod API contracts
├── docker-compose.yml      # local development stack
└── .env.example
```

---

© 2026 Expovision. All rights reserved.
