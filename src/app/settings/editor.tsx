'use client';
import { useState } from 'react';

export function SettingsEditor({ file, initial }: { file: 'sources' | 'scoring'; initial: string }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onSave() {
    setBusy(true);
    setStatus(null);
    try {
      JSON.parse(text); // validate
      const res = await fetch(`/api/config/${file}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: text,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'failed');
      setStatus('Saved.');
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.reload();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="secondary" onClick={onLogout} disabled={loggingOut} style={{ marginLeft: '0.5rem' }}>
          {loggingOut ? 'Signing out...' : 'Sign out'}
        </button>
        {status && <span className="subtle" style={{ marginLeft: '1rem' }}>{status}</span>}
      </div>
    </div>
  );
}
