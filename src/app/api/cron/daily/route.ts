import { NextResponse } from 'next/server';
import { isVercelCron } from '@/lib/cron-auth';
import { runDaily } from '@/report/daily';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isVercelCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  console.log(`[cron/daily] start ${new Date().toISOString()}`);
  try {
    const result = await runDaily();
    console.log('[cron/daily] success', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron/daily] failed:', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
