import { NextResponse } from 'next/server';
import { setAdminCookie, verifyAdminSecret } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'admin auth not configured' }, { status: 500 });
  }

  let payload: { secret?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof payload.secret !== 'string' || !verifyAdminSecret(payload.secret)) {
    return NextResponse.json({ error: 'invalid admin secret' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  setAdminCookie(res);
  return res;
}
