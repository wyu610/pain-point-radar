import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import type { ScrapedTopic } from '../types';

export interface UpsertResult {
  topicId: number;
  isNew: boolean;
}

export async function upsertTopics(items: ScrapedTopic[]): Promise<UpsertResult[]> {
  const db = getDb();
  const out: UpsertResult[] = [];
  const now = new Date();

  for (const row of items) {
    const existing = await db
      .select({ id: schema.topics.id })
      .from(schema.topics)
      .where(and(eq(schema.topics.source, row.source), eq(schema.topics.externalId, row.externalId)))
      .limit(1);

    let topicId: number;
    let isNew = false;
    if (existing.length) {
      topicId = existing[0].id;
      await db
        .update(schema.topics)
        .set({ title: row.title, url: row.url })
        .where(eq(schema.topics.id, topicId));
    } else {
      const inserted = await db
        .insert(schema.topics)
        .values({
          source: row.source,
          externalId: row.externalId,
          title: row.title,
          url: row.url,
          body: row.body,
          origin: row.origin,
          createdAt: new Date(row.createdAt * 1000),
          firstSeenAt: now,
        })
        .returning({ id: schema.topics.id });
      topicId = inserted[0].id;
      isNew = true;
    }

    await db.insert(schema.signals).values({
      topicId,
      capturedAt: now,
      upvotes: row.upvotes,
      comments: row.comments,
      rawScore: row.upvotes + 2 * row.comments,
    });

    out.push({ topicId, isNew });
  }
  return out;
}
