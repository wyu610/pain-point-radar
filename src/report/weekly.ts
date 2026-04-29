import { sql, and, eq, asc } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { dispatchAutoresearch } from '../karpathy/dispatch';
import type { Sentiment } from '../types';

interface AggRow {
  topicId: number;
  title: string;
  url: string;
  source: string;
  origin: string | null;
  theme: string | null;
  painPoint: string | null;
  sentiment: string | null;
  aggScore: number;
}

function todayLocal(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function buildQuery(row: AggRow): string {
  if (row.painPoint) {
    return `Validate startup opportunity. Pain point: "${row.painPoint}" (theme: ${row.theme ?? 'n/a'}). Assess market size, existing solutions, differentiation angles, and the strongest objection.`;
  }
  return `Validate startup opportunity around: ${row.title}. Source: ${row.source}/${row.origin}. Assess market size, existing solutions, differentiation angles.`;
}

export async function runWeekly(): Promise<{ weekEnding: string; dispatched: number }> {
  const db = getDb();
  const tz = process.env.RADAR_TZ ?? 'America/Denver';
  const weekEnding = todayLocal(tz);
  const sevenAgo = new Date(Date.now() - 7 * 86400_000).toLocaleDateString('en-CA', { timeZone: tz });

  const aggregated = await db.execute(sql`
    SELECT dr.topic_id  AS "topicId",
           t.title      AS title,
           t.url        AS url,
           t.source     AS source,
           t.origin     AS origin,
           t.theme      AS theme,
           t.pain_point AS "painPoint",
           t.sentiment  AS sentiment,
           SUM(dr.score) AS "aggScore"
    FROM daily_rankings dr
    JOIN topics t ON t.id = dr.topic_id
    WHERE dr.date BETWEEN ${sevenAgo} AND ${weekEnding}
    GROUP BY dr.topic_id, t.title, t.url, t.source, t.origin, t.theme, t.pain_point, t.sentiment
    ORDER BY "aggScore" DESC
    LIMIT 5
  `);
  const rows = aggregated.rows as unknown as AggRow[];

  // Persist as 'pending' (or refresh if a previous run created the same week_ending row).
  await db.delete(schema.weeklyReports).where(eq(schema.weeklyReports.weekEnding, weekEnding));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await db.insert(schema.weeklyReports).values({
      weekEnding,
      rank: i + 1,
      topicId: r.topicId,
      aggregateScore: Number(r.aggScore),
      status: 'pending',
      queryText: buildQuery(r),
    });
  }

  // Fire-and-forget dispatch to GitHub Actions.
  let dispatched = 0;
  try {
    await dispatchAutoresearch(
      weekEnding,
      rows.map((r, i) => ({ rank: i + 1, query: buildQuery(r) }))
    );
    dispatched = rows.length;
    // Mark all picks as 'running'
    await db
      .update(schema.weeklyReports)
      .set({ status: 'running' })
      .where(eq(schema.weeklyReports.weekEnding, weekEnding));
  } catch (e) {
    console.warn('[weekly] dispatch failed:', e);
  }

  return { weekEnding, dispatched };
}

export interface WeeklyPick {
  rank: number;
  topicId: number;
  weekEnding: string;
  title: string;
  url: string;
  theme: string | null;
  painPoint: string | null;
  sentiment: Sentiment | null;
  status: string;
  validation: string | null;
}

export async function getLatestWeekly(): Promise<WeeklyPick[]> {
  const db = getDb();
  const latest = await db.execute(sql`SELECT MAX(week_ending) AS d FROM weekly_reports`);
  const week = (latest.rows[0] as { d: string | null })?.d;
  if (!week) return [];

  const rows = await db
    .select({
      rank: schema.weeklyReports.rank,
      topicId: schema.weeklyReports.topicId,
      weekEnding: schema.weeklyReports.weekEnding,
      validation: schema.weeklyReports.validationMd,
      status: schema.weeklyReports.status,
      title: schema.topics.title,
      url: schema.topics.url,
      theme: schema.topics.theme,
      painPoint: schema.topics.painPoint,
      sentiment: schema.topics.sentiment,
    })
    .from(schema.weeklyReports)
    .innerJoin(schema.topics, eq(schema.topics.id, schema.weeklyReports.topicId))
    .where(eq(schema.weeklyReports.weekEnding, week))
    .orderBy(asc(schema.weeklyReports.rank));

  return rows.map((r) => ({
    rank: r.rank,
    topicId: r.topicId,
    weekEnding: r.weekEnding,
    title: r.title,
    url: r.url,
    theme: r.theme,
    painPoint: r.painPoint,
    sentiment: r.sentiment as Sentiment | null,
    status: r.status,
    validation: r.validation,
  }));
}
