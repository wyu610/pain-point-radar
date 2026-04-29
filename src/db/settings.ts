import { eq } from 'drizzle-orm';
import { getDb, schema } from './client';

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = getDb();
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return (row[0]?.value as T) ?? null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.settings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: value as object, updatedAt: new Date() },
    });
}

export interface SourcesConfig {
  reddit: {
    subreddits: string[];
    listings: ('hot' | 'top')[];
    top_window: string;
    per_listing_limit: number;
  };
  github: {
    trending_languages: string[];
    trending_window: string;
    issue_queries: string[];
  };
}

export interface ScoringConfig {
  comment_weight: number;
  half_life_days: number;
  sentiment_multipliers: Record<string, number>;
}
