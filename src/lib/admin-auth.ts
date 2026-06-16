import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { sign, verify } from './hmac';

export const ADMIN_COOKIE = 'radar_admin';
const SESSION_BODY = 'admin';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function adminSecret(): string | null {
  return process.env.ADMIN_SECRET || null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isAdminConfigured(): boolean {
  return !!adminSecret();
}

export function verifyAdminSecret(provided: string): boolean {
  const secret = adminSecret();
  return !!secret && safeEqual(provided, secret);
}

function sessionValue(secret: string): string {
  return sign(SESSION_BODY, secret);
}

export function isAdminCookieValue(value: string | undefined): boolean {
  const secret = adminSecret();
  return !!secret && !!value && verify(SESSION_BODY, value, secret);
}

function cookieFromRequest(req: Request): string | undefined {
  const header = req.headers.get('cookie') ?? '';
  const raw = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export function isAdminRequest(req: Request): boolean {
  return isAdminCookieValue(cookieFromRequest(req));
}

export async function isAdminSessionFromCookies(): Promise<boolean> {
  const jar = await cookies();
  return isAdminCookieValue(jar.get(ADMIN_COOKIE)?.value);
}

export function setAdminCookie(res: NextResponse): void {
  const secret = adminSecret();
  if (!secret) return;
  res.cookies.set(ADMIN_COOKIE, sessionValue(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearAdminCookie(res: NextResponse): void {
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
