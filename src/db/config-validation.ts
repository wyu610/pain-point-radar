import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1).max(200);

export const sourcesConfigSchema = z
  .object({
    reddit: z
      .object({
        subreddits: z.array(nonEmptyText).min(1).max(100),
        listings: z.array(z.enum(['hot', 'top'])).min(1).max(2),
        top_window: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']),
        per_listing_limit: z.number().int().min(1).max(100),
      })
      .strict(),
    github: z
      .object({
        trending_languages: z.array(nonEmptyText).min(1).max(50),
        trending_window: z.enum(['daily', 'weekly']),
        issue_queries: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
      })
      .strict(),
  })
  .strict();

export const scoringConfigSchema = z
  .object({
    comment_weight: z.number().min(0).max(20),
    half_life_days: z.number().positive().max(365),
    sentiment_multipliers: z
      .object({
        complaint: z.number().min(0).max(10),
        question: z.number().min(0).max(10),
        discussion: z.number().min(0).max(10),
        showcase: z.number().min(0).max(10),
      })
      .strict(),
  })
  .strict();

export function validateConfig(file: string, value: unknown): unknown {
  if (file === 'sources') return sourcesConfigSchema.parse(value);
  if (file === 'scoring') return scoringConfigSchema.parse(value);
  throw new Error('unknown config');
}

export function formatConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : 'config';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
  }
  return error instanceof Error ? error.message : 'invalid config';
}
