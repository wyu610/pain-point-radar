import { NextResponse } from 'next/server';
import { isVercelCron } from '@/lib/cron-auth';
import { runWeekly } from '@/report/weekly';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isVercelCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  console.log(`[cron/weekly] start ${new Date().toISOString()}`);
  try {
    const result = await runWeekly();
    console.log('[cron/weekly] dispatched', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron/weekly] failed:', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
