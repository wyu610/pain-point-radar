# Pain-Point Radar — Plan

## Context

You want a daily intelligence loop that mines GitHub and Reddit for hot topics, complaints, and pain points, ranks the top 20 every day at 6pm MST, surfaces the top 5 every Friday, and runs Karpathy's `autoresearch` weekly to validate the top 5 as potential startup ideas. For any idea you choose to pursue, scaffold a project using forrestchang's Karpathy-style CLAUDE.md template.

The intent is opportunity discovery: signal a small number of validated startup hypotheses each week without you reading hundreds of threads manually.

## Architecture (chosen options)

- **Runtime**: Local Node.js + TypeScript, `node-cron` for scheduling, SQLite for storage. Runs on your Mac.
- **Sources**: General/multi-subreddit, configurable via JSON file. GitHub: trending + high-engagement issues.
- **Output**: Local Next.js dashboard (`localhost:3000`) showing daily top 20 with rank-change arrows, weekly top 5, and validation reports.
- **Karpathy integration**: Clone `karpathy/autoresearch` and `forrestchang/andrej-karpathy-skills` locally; invoke as subprocesses.

## Project Layout

```
firecrawl-outreach/
├── config/
│   ├── sources.json          # editable subreddit + GitHub query list
│   └── scoring.json          # weights for upvotes, comments, recency, sentiment
├── src/
│   ├── scrape/
│   │   ├── reddit.ts         # PRAW-style fetch via reddit JSON API (no auth needed for public)
│   │   ├── github.ts         # GitHub REST: trending repos, issues w/ high comment counts
│   │   └── normalize.ts      # unify into Topic { id, source, title, url, signals, raw }
│   ├── analyze/
│   │   ├── extract.ts        # LLM call: extract pain points + theme from raw text (Claude via Anthropic SDK)
│   │   ├── cluster.ts        # group similar topics across days/sources by embedding similarity
│   │   └── rank.ts           # decayed score = signals * exp(-age_days/7) * sentiment_weight
│   ├── report/
│   │   ├── daily.ts          # write daily snapshot to DB, compute rank deltas
│   │   └── weekly.ts         # Friday: pick top 5, invoke autoresearch, write validation report
│   ├── karpathy/
│   │   ├── autoresearch.ts   # spawn `python autoresearch/cli.py "<query>"`, capture markdown output
│   │   └── scaffold.ts       # generate new project dir using forrestchang CLAUDE.md template
│   ├── db/
│   │   ├── schema.sql        # topics, daily_rankings, weekly_reports, validations
│   │   └── client.ts         # better-sqlite3 wrapper
│   ├── scheduler.ts          # node-cron: '0 18 * * *' America/Denver daily; '30 18 * * 5' weekly
│   └── server/               # Next.js app router dashboard
│       └── app/
│           ├── page.tsx              # today's top 20 with rank-change badges
│           ├── weekly/page.tsx       # Friday top 5 + autoresearch validation
│           └── topic/[id]/page.tsx   # drilldown: source threads, history, theme
├── vendor/
│   ├── autoresearch/         # git submodule of karpathy/autoresearch
│   └── andrej-karpathy-skills/  # git submodule for CLAUDE.md template
├── data/
│   └── radar.db              # SQLite
└── reports/
    ├── daily/2026-04-24.md
    └── weekly/2026-04-24.md
```

## Data model (SQLite)

- `topics(id, source, external_id, title, url, first_seen_at, theme, pain_point)` — deduped by `(source, external_id)`.
- `signals(topic_id, captured_at, upvotes, comments, score)` — append-only per scrape.
- `daily_rankings(date, rank, topic_id, score, prev_rank)` — written each 6pm run.
- `weekly_reports(week_ending, topic_id, rank, validation_md)` — written each Friday.

## Scoring (decayed, recency-weighted)

`score = (upvotes + 2*comments) * exp(-age_days / 7) * sentiment_multiplier`

Sentiment multiplier boosts complaint-flavored content (LLM classifies each topic as `complaint | question | showcase | discussion`; complaint = 1.5x, question = 1.2x, others = 1.0).

This prevents stale viral threads from dominating and emphasizes fresh, frustration-rich signal — the input you actually want for opportunity discovery.

## Daily flow (cron: 18:00 America/Denver)

1. Load `config/sources.json`.
2. Scrape Reddit (top/hot from each sub, last 24h) + GitHub trending + high-engagement issues.
3. Upsert `topics`, append `signals`.
4. LLM-extract pain point + theme for new topics (batch via Claude with prompt caching).
5. Compute scores, write `daily_rankings` with `prev_rank` from yesterday.
6. Render `reports/daily/YYYY-MM-DD.md`.

## Weekly flow (cron: Friday 18:30 America/Denver, after daily)

1. Aggregate the past 7 days of `daily_rankings`, pick top 5 by sum-of-decayed-scores.
2. For each, spawn `autoresearch` with a query like: `"Validate startup opportunity: <pain_point>. Market size, existing solutions, differentiation."`
3. Capture each markdown report into `weekly_reports.validation_md`.
4. Render `reports/weekly/YYYY-MM-DD.md`.
5. Dashboard `/weekly` page shows the 5 cards with validation, plus a "Pursue this idea" button that invokes `karpathy/scaffold.ts` to create a new project folder seeded with the forrestchang CLAUDE.md template + the validation report as `BACKGROUND.md`.

## Configurability

`config/sources.json` example:

```json
{
  "reddit": {
    "subreddits": ["SaaS", "Entrepreneur", "startups", "smallbusiness", "webdev", "programming", "MachineLearning"],
    "listings": ["hot", "top"],
    "top_window": "day"
  },
  "github": {
    "trending_languages": ["typescript", "python", "rust"],
    "issue_queries": ["is:issue is:open comments:>20 created:>{{7d_ago}}"]
  }
}
```

A dashboard `/settings` page lets you edit this list and reload without restarting cron.

## Dependencies

- `better-sqlite3`, `node-cron`, `zod`, `next`, `react`
- `@anthropic-ai/sdk` for extraction (Claude Haiku 4.5 for cost; prompt caching on the system prompt)
- No Reddit API auth needed (public JSON endpoints) initially; GitHub needs a PAT in `.env`
- Python 3 available locally for `autoresearch`

## Critical files to create

- [src/scrape/reddit.ts](src/scrape/reddit.ts), [src/scrape/github.ts](src/scrape/github.ts)
- [src/analyze/extract.ts](src/analyze/extract.ts), [src/analyze/rank.ts](src/analyze/rank.ts)
- [src/report/weekly.ts](src/report/weekly.ts), [src/karpathy/autoresearch.ts](src/karpathy/autoresearch.ts)
- [src/scheduler.ts](src/scheduler.ts) — entry point started via `npm run radar`
- [src/server/app/page.tsx](src/server/app/page.tsx) — dashboard
- [config/sources.json](config/sources.json), [config/scoring.json](config/scoring.json)
- [.env.example](.env.example): `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`

## Verification

1. `npm install` and `git submodule update --init` to pull `autoresearch` + skills repo.
2. `npm run radar:once` — manual trigger of the daily flow; confirm `reports/daily/<today>.md` lists 20 ranked topics with theme + pain-point fields.
3. `npm run radar:weekly --force` — manual weekly trigger; confirm 5 markdown validation files generated with autoresearch output (~2-5 min/idea).
4. `npm run dev` — open `http://localhost:3000`, verify daily ranking renders with rank-change arrows; `/weekly` shows top 5 cards.
5. From `/weekly`, click "Pursue idea" on one card — verify a new directory is created under `~/projects/<slug>/` with `CLAUDE.md` and `BACKGROUND.md`.
6. Let the scheduler run overnight; next day at 18:00 MST confirm a new daily report appears and `prev_rank` deltas are populated.

## Open follow-ups (post-MVP)

- Add HackerNews + Twitter/X as sources (config-driven).
- Email digest option (Resend) once you confirm the dashboard cadence works for you.
- Sentiment-based filtering toggle in the dashboard.
