import { sql, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { getSetting, type ScoringConfig } from '../db/settings';
import type { RankedTopic, Sentiment } from '../types';

function todayLocal(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

interface AggRow {
  topicId: number;
  title: string;
  url: string;
  source: string;
  origin: string | null;
  createdAt: Date;
  theme: string | null;
  painPoint: string | null;
  sentiment: string | null;
  upvotes: number;
  comments: number;
}

const DEFAULT_SCORING: ScoringConfig = {
  comment_weight: 2,
  half_life_days: 7,
  sentiment_multipliers: { complaint: 1.5, question: 1.2, discussion: 1.0, showcase: 0.8 },
};

export async function computeAndStoreDailyRanking(topN = 20): Promise<RankedTopic[]> {
  const cfg = (await getSetting<ScoringConfig>('scoring')) ?? DEFAULT_SCORING;
  const db = getDb();
  const tz = process.env.RADAR_TZ ?? 'America/Denver';
  const date = todayLocal(tz);
  const now = new Date();

  // Pull each topic's latest signal in the last 14 days using DISTINCT ON.
  const rowsRaw = await db.execute(sql`
    SELECT DISTINCT ON (s.topic_id)
      s.topic_id     AS "topicId",
      t.title        AS title,
      t.url          AS url,
      t.source       AS source,
      t.origin       AS origin,
      t.created_at   AS "createdAt",
      t.theme        AS theme,
      t.pain_point   AS "painPoint",
      t.sentiment    AS sentiment,
      s.upvotes      AS upvotes,
      s.comments     AS comments
    FROM signals s
    JOIN topics t ON t.id = s.topic_id
    WHERE s.captured_at > ${new Date(now.getTime() - 14 * 86400_000)}
    ORDER BY s.topic_id, s.captured_at DESC
  `);
  const rows = rowsRaw.rows as unknown as AggRow[];

  const halfLife = cfg.half_life_days;
  const scored = rows.map((r) => {
    const ageDays = Math.max(0, (now.getTime() - new Date(r.createdAt).getTime()) / 86400_000);
    const decay = Math.exp(-(Math.LN2 * ageDays) / halfLife);
    const sentMul = r.sentiment ? cfg.sentiment_multipliers[r.sentiment] ?? 1 : 1;
    const base = r.upvotes + cfg.comment_weight * r.comments;
    return { ...r, score: base * decay * sentMul };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topN);

  // Find yesterday's ranks (latest date strictly before today).
  const prevDate = await db.execute(sql`
    SELECT MAX(date) AS d FROM daily_rankings WHERE date < ${date}
  `);
  const prevD = (prevDate.rows[0] as { d: string | null })?.d ?? null;

  const prevMap = new Map<number, number>();
  if (prevD) {
    const prevRows = await db
      .select({ topicId: schema.dailyRankings.topicId, rank: schema.dailyRankings.rank })
      .from(schema.dailyRankings)
      .where(eq(schema.dailyRankings.date, prevD));
    for (const p of prevRows) prevMap.set(p.topicId, p.rank);
  }

  // Replace today's ranking atomically.
  await db.delete(schema.dailyRankings).where(eq(schema.dailyRankings.date, date));
  if (top.length) {
    await db.insert(schema.dailyRankings).values(
      top.map((row, i) => ({
        date,
        rank: i + 1,
        topicId: row.topicId,
        score: row.score,
        prevRank: prevMap.get(row.topicId) ?? null,
      }))
    );
  }

  return top.map((row, i) => ({
    topicId: row.topicId,
    rank: i + 1,
    score: row.score,
    prevRank: prevMap.get(row.topicId) ?? null,
    title: row.title,
    url: row.url,
    source: row.source as RankedTopic['source'],
    origin: row.origin ?? '',
    theme: row.theme,
    painPoint: row.painPoint,
    sentiment: row.sentiment as Sentiment | null,
  }));
}

export async function getDailyRanking(date?: string): Promise<RankedTopic[]> {
  const db = getDb();
  const tz = process.env.RADAR_TZ ?? 'America/Denver';
  let d = date;
  if (!d) {
    const latest = await db.execute(sql`SELECT MAX(date) AS d FROM daily_rankings`);
    d = (latest.rows[0] as { d: string | null })?.d ?? todayLocal(tz);
  }

  const rows = await db
    .select({
      rank: schema.dailyRankings.rank,
      score: schema.dailyRankings.score,
      prevRank: schema.dailyRankings.prevRank,
      topicId: schema.dailyRankings.topicId,
      title: schema.topics.title,
      url: schema.topics.url,
      source: schema.topics.source,
      origin: schema.topics.origin,
      theme: schema.topics.theme,
      painPoint: schema.topics.painPoint,
      sentiment: schema.topics.sentiment,
    })
    .from(schema.dailyRankings)
    .innerJoin(schema.topics, eq(schema.topics.id, schema.dailyRankings.topicId))
    .where(eq(schema.dailyRankings.date, d))
    .orderBy(schema.dailyRankings.rank);

  return rows.map((r) => ({
    topicId: r.topicId,
    rank: r.rank,
    score: r.score,
    prevRank: r.prevRank,
    title: r.title,
    url: r.url,
    source: r.source as RankedTopic['source'],
    origin: r.origin ?? '',
    theme: r.theme,
    painPoint: r.painPoint,
    sentiment: r.sentiment as Sentiment | null,
  }));
}
