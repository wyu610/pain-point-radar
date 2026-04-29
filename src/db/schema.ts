import {
  bigserial,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const topics = pgTable(
  'topics',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    source: text('source').notNull(), // 'reddit' | 'github_issue' | 'github_repo'
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    body: text('body'),
    origin: text('origin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    theme: text('theme'),
    painPoint: text('pain_point'),
    sentiment: text('sentiment'), // complaint | question | discussion | showcase
  },
  (t) => ({
    uniq: uniqueIndex('topics_source_external_idx').on(t.source, t.externalId),
    createdIdx: index('topics_created_idx').on(t.createdAt),
  })
);

export const signals = pgTable(
  'signals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    upvotes: integer('upvotes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    rawScore: doublePrecision('raw_score').notNull().default(0),
  },
  (t) => ({
    topicIdx: index('signals_topic_idx').on(t.topicId, t.capturedAt),
  })
);

export const dailyRankings = pgTable(
  'daily_rankings',
  {
    date: text('date').notNull(), // YYYY-MM-DD in RADAR_TZ
    rank: integer('rank').notNull(),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    prevRank: integer('prev_rank'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.rank] }),
    topicIdx: index('daily_rankings_topic_idx').on(t.topicId, t.date),
  })
);

export const weeklyReports = pgTable(
  'weekly_reports',
  {
    weekEnding: text('week_ending').notNull(), // Friday YYYY-MM-DD
    rank: integer('rank').notNull(),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    aggregateScore: doublePrecision('aggregate_score').notNull(),
    status: text('status').notNull().default('pending'), // pending | running | complete | failed
    validationMd: text('validation_md'),
    validationAt: timestamp('validation_at', { withTimezone: true }),
    queryText: text('query_text'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.weekEnding, t.rank] }),
  })
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pursuedIdeas = pgTable('pursued_ideas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  topicId: integer('topic_id')
    .notNull()
    .references(() => topics.id),
  weekEnding: text('week_ending').notNull(),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
});
