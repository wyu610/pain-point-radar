import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { activeProviders } from '@/analyze/providers';
import { getDb } from '@/db/client';

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
  scheduling: {
    timezone: string;
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

  try {
    const db = getDb();
    const t0 = Date.now();
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM topics)                                    AS topics_total,
        (SELECT COUNT(*)::int FROM topics WHERE theme IS NOT NULL)            AS topics_extracted,
        (SELECT MAX(date)        FROM daily_rankings)                         AS latest_ranking_date,
        (SELECT MAX(week_ending) FROM weekly_reports)                         AS latest_weekly_date,
        (SELECT COUNT(*)::int    FROM weekly_reports WHERE status IN ('pending','running')) AS pending_validations
    `);
    latencyMs = Date.now() - t0;
    dbReachable = true;
    const row = result.rows[0] as Record<string, unknown>;
    topicsTotal = Number(row.topics_total ?? 0);
    topicsExtracted = Number(row.topics_extracted ?? 0);
    latestRankingDate = (row.latest_ranking_date as string | null) ?? null;
    latestWeeklyDate = (row.latest_weekly_date as string | null) ?? null;
    pendingValidations = Number(row.pending_validations ?? 0);
  } catch (e) {
    dbError = (e as Error).message;
  }

  const report: HealthReport = {
    ok: dbReachable && active.size > 0,
    timestamp: new Date().toISOString(),
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
    scheduling: {
      timezone: process.env.RADAR_TZ ?? 'America/Denver',
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

