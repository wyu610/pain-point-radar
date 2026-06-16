import { NextResponse } from 'next/server';
import { formatConfigError, validateConfig } from '@/db/config-validation';
import { setSetting } from '@/db/settings';
import { isAdminRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['sources', 'scoring']);

export async function PUT(req: Request, ctx: { params: Promise<{ file: string }> }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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

  let validated: unknown;
  try {
    validated = validateConfig(file, parsed);
  } catch (e) {
    return NextResponse.json({ error: formatConfigError(e) }, { status: 400 });
  }

  try {
    await setSetting(file, validated);
  } catch (e) {
    console.error('[config] write failed:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
