'use client';
import type { FormEvent } from 'react';
import { useState } from 'react';

export function LoginForm() {
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'login failed');
      window.location.reload();
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-panel" onSubmit={onSubmit}>
      <label htmlFor="admin-secret">Admin secret</label>
      <input
        id="admin-secret"
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        autoComplete="current-password"
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
      {status && <p className="subtle">{status}</p>}
    </form>
  );
}
