# Webapp Migration Plan — Pain-Point Radar

## Why migrate

Local-only has three operational pain points:
1. **Mac must be awake at 6pm MST** for the daily cron — misses runs when the laptop is closed.
2. **Reports + DB live on one machine** — no access from phone, no backup.
3. **Sharing/multi-device** is impossible.

Going webapp on Vercel solves all three, but six pieces of the local design must change.

---

## What breaks in a serverless webapp (and the fix)

| Local design | Why it fails on Vercel | Replacement |
|---|---|---|
| `better-sqlite3` + local file | Functions have ephemeral filesystem; each invocation can land on a fresh container | **Neon Postgres** via Vercel Marketplace |
| `node-cron` long-running process | No always-on process; functions are request-scoped | **Vercel Cron** triggers a route handler |
| Python `autoresearch` subprocess | No Python runtime in standard Node functions | **Vercel Sandbox** (Python 3.13, GA Jan 2026) — or external worker |
| Markdown reports written to `reports/` | Filesystem is ephemeral | Render reports from DB on demand; archive to **Vercel Blob** if you want downloadable files |
| `config/sources.json` writable | Filesystem read-only | Move config into DB (`settings` table) editable via dashboard |
| No auth (localhost) | Public URL exposes private startup research | **Vercel Authentication** (deployment protection) — zero-config, only your team logs in |

---

## Updated architecture

```
┌────────────────────────────────────────────────────────┐
│                    Vercel Project                      │
│                                                        │
│  ┌──────────────┐    ┌──────────────────────────────┐ │
│  │  Next.js UI  │───▶│  /api/* route handlers       │ │
│  │  (dashboard) │    │  - GET /api/today            │ │
│  └──────────────┘    │  - GET /api/weekly           │ │
│                      │  - POST /api/pursue          │ │
│                      │  - PUT  /api/config/*        │ │
│  ┌──────────────┐    │  - POST /api/cron/daily   ◀──┼──── Vercel Cron 0 18 * * *
│  │ Vercel Cron  │───▶│  - POST /api/cron/weekly  ◀──┼──── Vercel Cron 30 18 * * 5
│  └──────────────┘    └──────────────────────────────┘ │
│                                  │                     │
│                                  ▼                     │
│                      ┌──────────────────┐              │
│                      │  Vercel Sandbox  │  (only       │
│                      │  python autoresearch │  weekly) │
│                      └──────────────────┘              │
└────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                ┌─────────────────────────────────┐
                │  Neon Postgres (Marketplace)    │
                │  topics, signals, daily_rankings,│
                │  weekly_reports, settings, ...  │
                └─────────────────────────────────┘
                                  │
                                  ▼ (optional)
                ┌─────────────────────────────────┐
                │  Vercel Blob (archived reports) │
                └─────────────────────────────────┘
```

---

## Migration steps (8 phases)

### Phase 1 — DB: SQLite → Postgres
- Install `@neondatabase/serverless` + `drizzle-orm` (or `pg` if you prefer raw).
- Translate `src/db/schema.sql` to Postgres dialect (mostly compatible; `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL`, `INTEGER` unix timestamps → `TIMESTAMPTZ`).
- Add `settings(key TEXT PRIMARY KEY, value JSONB)` table to hold sources/scoring.
- Replace `src/db/client.ts` with a Neon HTTP client (works in serverless cold starts).

### Phase 2 — Cron: node-cron → Vercel Cron
- Delete `src/scheduler.ts`.
- Add `vercel.ts` with cron entries pointing at `/api/cron/daily` and `/api/cron/weekly`.
- Move `runDaily()` / `runWeekly()` bodies into `app/api/cron/*/route.ts` handlers.
- Protect routes with `CRON_SECRET` header check (Vercel sets this automatically).
- Set `maxDuration = 300` (the new default 300s ceiling fits a daily scrape).

### Phase 3 — Config: JSON files → DB-backed
- New `getSetting('sources')` / `setSetting()` helpers reading `settings` table.
- `/settings` page reads + writes via API; no filesystem.
- One-time seed from current `config/*.json` on first deploy.

### Phase 4 — Reports: filesystem → DB + on-demand render
- Daily/weekly route handlers render markdown into `daily_rankings.report_md` (TEXT column) at end of run.
- Dashboard displays directly from DB rows; download-as-`.md` endpoint streams the column.
- (Optional) Push archived markdown to **Vercel Blob** for permanent backup.

### Phase 5 — Karpathy autoresearch: subprocess → Vercel Sandbox
- The Python CLI can run inside a Vercel Sandbox session (Python 3.13 supported).
- Weekly cron handler spawns 5 sandbox sessions in parallel — each runs `pip install autoresearch` + invokes it with the query and returns markdown.
- Sandbox max execution fits 5-minute autoresearch runs comfortably.
- **Tradeoff**: Sandbox has per-second pricing. ~5 ideas × 5 min = 25 min/week ≈ a few cents. Acceptable.

### Phase 6 — Project scaffolding ("Pursue this idea")
This was the trickiest piece — local fs writes to `~/projects/<slug>/`. On the web that doesn't make sense. Two options (you'll pick in Q2 below):
- **A: Push to GitHub** — server creates a repo via `@octokit/rest`, commits `CLAUDE.md` + `BACKGROUND.md`, returns the URL.
- **B: Download as zip** — server returns a `.zip` of the seeded project to download into your local `~/projects`.

### Phase 7 — Auth
- Cheapest: enable **Vercel Authentication** (deployment protection) under project settings — only logged-in Vercel team members can access. Zero code.
- Slightly more flexible: add `next-auth` with email magic links (Resend) so you can share specific reports with collaborators.

### Phase 8 — Local dev parity
- Keep the Next.js app runnable locally (`npm run dev` against a Neon dev branch via `DATABASE_URL`).
- For local cron testing, add `npm run cron:daily` script that hits the route directly with the `CRON_SECRET`.
- Remove `node-cron`, `better-sqlite3`, `dotenv` from deps.

---

## Files that change

| File | Change |
|---|---|
| `package.json` | Drop `better-sqlite3`, `node-cron`, `dotenv`; add `@neondatabase/serverless`, `drizzle-orm`, `@vercel/sandbox`, `@octokit/rest` (if Phase 6A) |
| `vercel.ts` | NEW — declares cron schedules, framework, env validation |
| `src/db/schema.sql` | DELETE — replaced by Drizzle migrations |
| `src/db/client.ts` | Rewrite to Neon HTTP client + Drizzle |
| `src/db/schema.ts` | NEW — Drizzle table definitions |
| `src/scheduler.ts` | DELETE |
| `src/cli.ts` | Keep for one-shot local testing; calls the same handlers |
| `src/scrape/persist.ts` | Rewrite for Postgres (`ON CONFLICT DO UPDATE`) |
| `src/analyze/extract.ts`, `rank.ts` | Minor: replace SQLite query syntax |
| `src/report/{daily,weekly,markdown}.ts` | Drop filesystem writes; return strings, persist to DB |
| `src/karpathy/autoresearch.ts` | Rewrite to use `@vercel/sandbox` instead of `child_process.spawn` |
| `src/karpathy/scaffold.ts` | Rewrite per Phase 6 choice (GitHub repo creation OR zip stream) |
| `src/app/api/cron/daily/route.ts` | NEW |
| `src/app/api/cron/weekly/route.ts` | NEW |
| `src/app/api/today/route.ts` | NEW (replaces direct DB read in page) |
| `src/app/api/weekly/route.ts` | NEW |
| `src/app/api/config/[file]/route.ts` | Rewrite to use DB-backed settings |
| `src/app/api/pursue/route.ts` | Rewrite per Phase 6 choice |
| `config/sources.json`, `config/scoring.json` | DELETE after one-time DB seed |

---

## Cost (estimate, per month)

| Service | Tier | Cost |
|---|---|---|
| Vercel Hobby plan | Free for personal use | $0 |
| Neon (via Vercel Marketplace) | Free tier, 0.5 GB | $0 |
| Vercel Sandbox | ~25 min/week of Python | <$1 |
| Anthropic API (Haiku 4.5) | ~300 extracts/day, prompt cached | ~$2-5 |
| **Total** | | **~$3-6/mo** |

If usage grows, Neon Pro is $19/mo; Vercel Pro $20/mo.

---

## Migration verification

1. `vercel env pull .env.local --yes` to sync env after linking.
2. `npm run dev` against Neon dev branch — confirm `/`, `/weekly`, `/settings` render with data from a seed.
3. Manually invoke `/api/cron/daily` with `Authorization: Bearer $CRON_SECRET` — confirm new ranking appears in DB.
4. `vercel deploy` to a preview URL.
5. From preview, trigger weekly cron — confirm 5 Sandbox jobs run and persist `validation_md`.
6. Wait one real cron tick (next 6pm MST) — confirm scheduled run fires automatically.
