import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { activeProviders, extractWithChain } from './providers';

// Concurrency cap for LLM extraction. Sequential extraction (~1-2s/call) would
// exceed the 300s serverless cap on a large backlog; a bounded pool keeps the
// daily cron well under budget while staying within free-tier rate limits
// (Gemini free: 1M tokens/min, so ~8 in flight is comfortable).
const EXTRACT_CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY ?? 8);

interface PendingRow {
  topicId: number;
  title: string;
  body: string | null;
  origin: string | null;
  source: string;
}

/** Runs `worker` over `items` with at most `concurrency` in flight. */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function runExtraction(rows: PendingRow[], label: string): Promise<number> {
  const db = getDb();
  let done = 0;
  await mapPool(rows, EXTRACT_CONCURRENCY, async (row) => {
    const out = await extractWithChain({ ...row, body: row.body ?? '' });
    if (!out) return;
    await db
      .update(schema.topics)
      .set({
        theme: out.theme,
        painPoint: out.pain_point,
        sentiment: out.sentiment,
        provider: out.provider,
      })
      .where(eq(schema.topics.id, row.topicId));
    done++;
  });
  console.log(`[extract] ${label}: ${done}/${rows.length} (concurrency ${EXTRACT_CONCURRENCY})`);
  return done;
}

/** Extracts theme/pain-point for topics that have never been processed. */
export async function extractPendingTopics(limit = 200): Promise<number> {
  const providers = activeProviders();
  console.log(`[extract] active providers: ${providers.join(' → ')}`);
  if (providers.length === 0) {
    console.warn('[extract] no providers available — skipping (this should never happen, heuristic is always on)');
    return 0;
  }

  const db = getDb();
  const rows = await db
    .select({
      topicId: schema.topics.id,
      title: schema.topics.title,
      body: schema.topics.body,
      origin: schema.topics.origin,
      source: schema.topics.source,
    })
    .from(schema.topics)
    .where(isNull(schema.topics.theme))
    .orderBy(desc(schema.topics.firstSeenAt))
    .limit(limit);

  return runExtraction(rows, 'pending');
}

/**
 * Upgrades rows previously filled by the heuristic fallback. The heuristic runs
 * whenever an LLM provider was unavailable or errored on that row; once a real
 * provider is back, those rows are re-processed so quality recovers over time.
 * Bounded per run so it never dominates the daily budget.
 */
export async function reextractHeuristicTopics(limit = 50): Promise<number> {
  const networkProviders = activeProviders().filter((p) => p !== 'heuristic');
  if (networkProviders.length === 0) return 0; // nothing better than heuristic available

  const db = getDb();
  const rows = await db
    .select({
      topicId: schema.topics.id,
      title: schema.topics.title,
      body: schema.topics.body,
      origin: schema.topics.origin,
      source: schema.topics.source,
    })
    .from(schema.topics)
    .where(eq(schema.topics.provider, 'heuristic'))
    .orderBy(desc(schema.topics.firstSeenAt))
    .limit(limit);

  if (rows.length === 0) return 0;
  return runExtraction(rows, 'reextract-heuristic');
}
