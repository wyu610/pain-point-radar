import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb, schema } from '@/db/client';
import { verify } from '@/lib/hmac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ValidationBody {
  weekEnding: string;
  rank: number;
  status: 'complete' | 'failed';
  validationMd?: string;
  error?: string;
}

/**
 * Webhook endpoint hit by the GitHub Actions autoresearch workflow once per
 * top-5 pick when its validation finishes. The body is signed with the shared
 * WEBHOOK_SECRET — only signed requests succeed.
 */
export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 500 });

  const sig = req.headers.get('x-radar-signature') ?? '';
  const bodyText = await req.text();
  if (!verify(bodyText, sig, secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let payload: ValidationBody;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(schema.weeklyReports)
    .set({
      status: payload.status,
      validationMd:
        payload.status === 'complete'
          ? payload.validationMd ?? null
          : `_(autoresearch failed: ${payload.error ?? 'unknown'})_`,
      validationAt: new Date(),
    })
    .where(
      and(
        eq(schema.weeklyReports.weekEnding, payload.weekEnding),
        eq(schema.weeklyReports.rank, payload.rank)
      )
    );

  return NextResponse.json({ ok: true });
}
