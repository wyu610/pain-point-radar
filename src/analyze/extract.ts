import { eq, isNull, desc } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { activeProviders, extractWithChain } from './providers';

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

  let done = 0;
  for (const row of rows) {
    const out = await extractWithChain({ ...row, body: row.body ?? '' });
    if (!out) continue;
    await db
      .update(schema.topics)
      .set({ theme: out.theme, painPoint: out.pain_point, sentiment: out.sentiment })
      .where(eq(schema.topics.id, row.topicId));
    done++;
  }
  console.log(`[extract] processed ${done}/${rows.length}`);
  return done;
}
