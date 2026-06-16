import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { activeProviders } from '@/analyze/providers';
import { getDb } from '@/db/client';
import { getSetting } from '@/db/settings';
import { isAdminConfigured } from '@/lib/admin-auth';
import type { DailyRunStats } from '@/report/daily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProviderStatus {
  name: string;
  active: boolean;
  rank: number; // position in the chain
}

const ALL_PROVIDERS = ['anthropic', 'gemini', 'openrouter', 'heuristic'];

interface HealthReport {
  ok: boolean;
  timestamp: string;
  warnings: string[];
  providers: {
    chain: string[]; // active providers in priority order
    detail: ProviderStatus[];
  };
  database: {
    reachable: boolean;
    latencyMs: number | null;
    error?: string;
  };
  data: {
    topicsTotal: number;
    topicsExtracted: number; // theme IS NOT NULL
    extractedPct: number;
    latestRankingDate: string | null;
    latestWeeklyDate: string | null;
    pendingValidations: number;
  };
  lastRun: (DailyRunStats & { redditHealthy: boolean }) | null;
  config: {
    adminSecretConfigured: boolean;
    sourcesConfigured: boolean;
    scoringConfigured: boolean;
  };
  scheduling: {
    timezone: string;
    dailyCronUtc: string;
    weeklyCronUtc: string;
    cronSecretConfigured: boolean;
    appUrlConfigured: boolean;
    webhookSecretConfigured: boolean;
    ghDispatchConfigured: boolean;
  };
}

export async function GET() {
  const active = new Set(activeProviders());
  const providers: ProviderStatus[] = ALL_PROVIDERS.map((name, i) => ({
    name,
    active: active.has(name),
    rank: i + 1,
  }));

  let dbReachable = false;
  let latencyMs: number | null = null;
  let dbError: string | undefined;
  let topicsTotal = 0;
  let topicsExtracted = 0;
  let latestRankingDate: string | null = null;
  let latestWeeklyDate: string | null = null;
  let pendingValidations = 0;
  let sourcesConfigured = false;
  let scoringConfigured = false;

  try {
    const db = getDb();
    const t0 = Date.now();
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM topics)                                    AS topics_total,
        (SELECT COUNT(*)::int FROM topics WHERE theme IS NOT NULL)            AS topics_extracted,
        (SELECT MAX(date)        FROM daily_rankings)                         AS latest_ranking_date,
        (SELECT MAX(week_ending) FROM weekly_reports)                         AS latest_weekly_date,
        (SELECT COUNT(*)::int    FROM weekly_reports WHERE status IN ('pending','running')) AS pending_validations,
        EXISTS(SELECT 1 FROM settings WHERE key = 'sources')                  AS sources_configured,
        EXISTS(SELECT 1 FROM settings WHERE key = 'scoring')                  AS scoring_configured
    `);
    latencyMs = Date.now() - t0;
    dbReachable = true;
    const row = result.rows[0] as Record<string, unknown>;
    topicsTotal = Number(row.topics_total ?? 0);
    topicsExtracted = Number(row.topics_extracted ?? 0);
    latestRankingDate = (row.latest_ranking_date as string | null) ?? null;
    latestWeeklyDate = (row.latest_weekly_date as string | null) ?? null;
    pendingValidations = Number(row.pending_validations ?? 0);
    sourcesConfigured = Boolean(row.sources_configured);
    scoringConfigured = Boolean(row.scoring_configured);
  } catch (e) {
    dbError = (e as Error).message;
    console.error('[health] db check failed:', dbError);
  }

  // Last daily run stats (written by runDaily) — used to detect silent scrape failures.
  let lastRun: (DailyRunStats & { redditHealthy: boolean }) | null = null;
  if (dbReachable) {
    try {
      const stats = await getSetting<DailyRunStats>('last_daily_run');
      if (stats) {
        const redditHealthy = stats.redditCount > 0 && stats.redditFailedListings === 0;
        lastRun = { ...stats, redditHealthy };
      }
    } catch (e) {
      console.warn('[health] last_daily_run read failed:', (e as Error).message);
    }
  }

  const warnings: string[] = [];
  if (!dbReachable) warnings.push(`database unreachable: ${dbError ?? 'unknown error'}`);
  if (active.size <= 1) warnings.push('only the heuristic provider is active — extraction quality will be low');
  if (lastRun && lastRun.redditCount === 0) warnings.push('last run scraped 0 Reddit topics — likely rate-limited or blocked (consider REDDIT_CLIENT_ID/SECRET)');
  if (lastRun && lastRun.redditFailedListings > 0) warnings.push(`last run had ${lastRun.redditFailedListings} failed Reddit listing fetches`);
  if (!lastRun) warnings.push('no daily run has completed yet');

  const report: HealthReport = {
    ok: dbReachable && active.size > 0,
    timestamp: new Date().toISOString(),
    warnings,
    providers: {
      chain: [...active],
      detail: providers,
    },
    database: { reachable: dbReachable, latencyMs, error: dbError },
    data: {
      topicsTotal,
      topicsExtracted,
      extractedPct: topicsTotal ? Math.round((topicsExtracted / topicsTotal) * 100) : 0,
      latestRankingDate,
      latestWeeklyDate,
      pendingValidations,
    },
    lastRun,
    config: {
      adminSecretConfigured: isAdminConfigured(),
      sourcesConfigured,
      scoringConfigured,
    },
    scheduling: {
      timezone: process.env.RADAR_TZ ?? 'America/Denver',
      dailyCronUtc: '0 1 * * *',
      weeklyCronUtc: '30 1 * * 6',
      cronSecretConfigured: !!process.env.CRON_SECRET,
      appUrlConfigured: !!process.env.APP_URL,
      webhookSecretConfigured: !!process.env.WEBHOOK_SECRET,
      ghDispatchConfigured: !!process.env.GH_DISPATCH_TOKEN,
    },
  };

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
