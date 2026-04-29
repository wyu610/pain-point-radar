/**
 * Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}` on cron-triggered
 * requests. Use this guard on any handler reachable only by Vercel Cron.
 */
export function isVercelCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}
