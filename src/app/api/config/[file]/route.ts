import { NextResponse } from 'next/server';
import { setSetting } from '@/db/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['sources', 'scoring']);

export async function PUT(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!ALLOWED.has(file)) {
    return NextResponse.json({ error: 'unknown config' }, { status: 400 });
  }
  const text = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  try {
    await setSetting(file, parsed);
  } catch (e) {
    console.error('[config] write failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
