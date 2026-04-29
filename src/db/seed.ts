import { getDb, schema } from './client';
import { sql } from 'drizzle-orm';

const DEFAULT_SOURCES = {
  reddit: {
    subreddits: [
      'SaaS', 'Entrepreneur', 'startups', 'smallbusiness', 'webdev',
      'programming', 'MachineLearning', 'LocalLLaMA', 'ExperiencedDevs',
      'devops', 'productivity',
    ],
    listings: ['hot', 'top'],
    top_window: 'day',
    per_listing_limit: 25,
  },
  github: {
    trending_languages: ['typescript', 'python', 'rust', 'go'],
    trending_window: 'daily',
    issue_queries: [
      'is:issue is:open comments:>30 created:>{{7d_ago}} sort:reactions-+1-desc',
    ],
  },
};

const DEFAULT_SCORING = {
  comment_weight: 2,
  half_life_days: 7,
  sentiment_multipliers: {
    complaint: 1.5,
    question: 1.2,
    discussion: 1.0,
    showcase: 0.8,
  },
};

async function main() {
  const db = getDb();
  await db
    .insert(schema.settings)
    .values([
      { key: 'sources', value: DEFAULT_SOURCES },
      { key: 'scoring', value: DEFAULT_SCORING },
    ])
    .onConflictDoNothing();

  const rows = await db.execute(sql`SELECT key FROM settings`);
  console.log('settings present:', rows.rows.map((r) => r.key));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
