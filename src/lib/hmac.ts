import { createHmac, timingSafeEqual } from 'node:crypto';

export function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verify(body: string, providedHex: string, secret: string): boolean {
  const expected = sign(body, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(providedHex.replace(/^sha256=/, ''), 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
