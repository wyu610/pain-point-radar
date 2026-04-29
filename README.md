# Pain-Point Radar (Webapp)

A scheduled webapp that mines GitHub + Reddit for hot complaints and pain points, ranks the top 20 daily at 6pm MST, surfaces the top 5 each Friday, and runs Karpathy `autoresearch` (via GitHub Actions) to validate them as startup ideas.

## Two flavors

| | Free | Paid |
|---|---|---|
| **Total cost** | **$0** | ~$3-5/mo |
| Hosting | Vercel Hobby | Vercel Hobby |
| Database | Neon free tier (0.5 GB) | Neon free tier |
| LLM | Gemini 2.5 Flash free tier → OpenRouter free → heuristic fallback | Anthropic Haiku 4.5 (best quality) |
| Validation | GitHub Actions (free for public repos) | same |
| Auth | Public URL (deferred) | Vercel Authentication |

The same code runs both flavors. The LLM provider chain auto-detects which env vars are set and falls through on errors.

## Architecture

```
Vercel Cron ──▶ /api/cron/daily       (scrape, extract, rank — 5 min)
                /api/cron/weekly      (aggregate, dispatch GHA — <30 sec)

Provider chain:  Anthropic → Gemini → OpenRouter → Heuristic
                 (first available wins, errors cascade)

GHA workflow ──▶ runs autoresearch in parallel for each top-5 pick
                 ──▶ POSTs HMAC-signed result to /api/validation

Neon Postgres   topics, signals, daily_rankings, weekly_reports, settings
```

## Free deploy (~15 min)

### 1. Vercel + Neon
```bash
npm i -g vercel
vercel link
vercel integration add neon       # auto-injects DATABASE_URL
vercel env pull .env.local --yes
```

### 2. Get a Gemini API key (free)
https://aistudio.google.com/apikey → click "Create API key" (sign in with Google).
Free tier: **1,500 requests/day, 1M tokens/min**. We use ~300 RPD.

```bash
vercel env add GEMINI_API_KEY production
# paste the key
```

### 3. (Optional but recommended) Add OpenRouter as backup
https://openrouter.ai/keys → free key, no credit card. Used only if Gemini errors.

```bash
vercel env add OPENROUTER_API_KEY production
```

### 4. Generate cron + webhook secrets
```bash
vercel env add CRON_SECRET production       # paste: openssl rand -hex 32
vercel env add WEBHOOK_SECRET production    # paste: openssl rand -hex 32
```

### 5. Push code, init schema
```bash
git init && git add . && git commit -m 'init'
gh repo create pain-point-radar --public --push   # public = free GHA
npm install
npm run db:push     # creates tables in Neon
npm run db:seed     # writes default sources + scoring
```

### 6. Set up the GHA dispatch token
```bash
# A GH PAT with `repo` and `workflow` scopes; use a fine-grained token.
vercel env add GH_DISPATCH_TOKEN production
vercel env add GH_WORKFLOW_OWNER production    # e.g. wyu610
vercel env add GH_WORKFLOW_REPO  production    # e.g. pain-point-radar
vercel env add APP_URL           production    # https://your-app.vercel.app

# And the autoresearch worker needs a Gemini key too (autoresearch uses LLMs):
gh secret set GEMINI_API_KEY --body "$(grep GEMINI_API_KEY .env.local | cut -d= -f2)"
```

> Note: the autoresearch upstream defaults to Anthropic. To run it on the free path, fork `karpathy/autoresearch` and patch its provider to Gemini, or use [LiteLLM proxy](https://github.com/BerriAI/litellm) to route Anthropic-shaped calls to Gemini. The repo URL in the workflow can be swapped to your fork.

### 7. Deploy
```bash
vercel deploy --prod
```

That's it. The first daily cron fires at the next 18:00 MST tick.

## How the free LLM path works

1. **Gemini 2.5 Flash** is tried first when `GEMINI_API_KEY` is set. Native JSON-mode, structured schema → reliable parsing.
2. **OpenRouter** (`deepseek/deepseek-chat:free` by default) catches Gemini errors and rate limits.
3. **Heuristic** is the floor: regex-based sentiment (`/hate|sucks|frustrating|why is .* so/i` → complaint), first-non-stopword phrase as theme, first body sentence as pain point. No network call. Quality is rough but the daily ranking always produces *some* sentiment classification.

You can verify which provider produced an extraction by querying the DB — the chain logs `[extract] active providers: gemini → openrouter → heuristic` on each run.

## Local development

```bash
vercel env pull .env.local --yes
npm install
npm run dev                  # http://localhost:3000

# Manually trigger jobs locally:
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
     http://localhost:3000/api/cron/daily

# Or run the pipeline directly without HTTP:
npm run radar:once
npm run radar:weekly
```

## Pursue an idea

Click **Download starter project (.zip)** on `/weekly`. The server bundles:
- `CLAUDE.md` (live-fetched from forrestchang/andrej-karpathy-skills)
- `BACKGROUND.md` (source thread, pain point, autoresearch validation)
- `README.md`, `.gitignore` placeholders

Unzip and start from there.

## When to upgrade to the paid tier

Add `ANTHROPIC_API_KEY` to enable Anthropic Haiku 4.5 at the front of the provider chain. Better theme phrasing and more nuanced pain-point extraction. Cost: ~$2-5/mo for our volume with prompt caching.

## Re-enable auth later

Vercel Authentication = Project Settings → Deployment Protection → enable. Restricts the URL to your Vercel team. Zero code change.
