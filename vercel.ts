import type { VercelConfig } from '@vercel/config/v1';

/**
 * Vercel project configuration.
 *
 * Cron schedules expressed in UTC. We want:
 *   - daily 18:00 America/Denver = 00:00 UTC (when MDT) / 01:00 UTC (when MST).
 *     Using 01:00 UTC: fires at 17:00 MDT or 18:00 MST. Acceptable; alternatively use TZDB-aware
 *     scheduling once Vercel supports it. For now we pick 01:00 UTC year-round.
 *   - weekly Friday 18:30 America/Denver ≈ 01:30 UTC Saturday.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/daily', schedule: '0 1 * * *' },
    { path: '/api/cron/weekly', schedule: '30 1 * * 6' },
  ],
};
