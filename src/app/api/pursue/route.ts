import { NextResponse } from 'next/server';
import { buildPursueZip } from '@/karpathy/scaffold';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const weekEnding = url.searchParams.get('weekEnding');
  const rank = Number(url.searchParams.get('rank'));
  if (!weekEnding || !Number.isFinite(rank)) {
    console.warn('[pursue] missing params', { weekEnding, rank });
    return NextResponse.json({ error: 'weekEnding and rank required' }, { status: 400 });
  }

  try {
    const result = await buildPursueZip({ weekEnding, rank });
    // Cast to BodyInit — Buffer is compatible at runtime, but TS undici types are too narrow.
    return new Response(result.bytes as unknown as BodyInit, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${result.filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[pursue] failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
