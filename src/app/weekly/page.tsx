import { getLatestWeekly } from '../../report/weekly';

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'delta-flat',
    running: 'delta-new',
    complete: 'delta-up',
    failed: 'delta-down',
  };
  return <span className={map[status] ?? 'delta-flat'}>{status}</span>;
}

export default async function WeeklyPage() {
  const picks = await getLatestWeekly();
  return (
    <section>
      <h2>Weekly top 5</h2>
      {picks.length === 0 ? (
        <p className="subtle">
          No weekly picks yet. Cron fires Friday 6:30pm MST, or trigger
          {' '}
          <code>/api/cron/weekly</code> manually.
        </p>
      ) : (
        <>
          <p className="subtle">
            Week ending <strong>{picks[0].weekEnding}</strong>. Validation runs asynchronously in
            GitHub Actions; this page reflects the latest webhook updates.
          </p>
          {picks.map((p) => (
            <article key={p.topicId} className="card">
              <h3>
                #{p.rank} — {p.theme ?? p.title} <StatusBadge status={p.status} />
              </h3>
              <p>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.title}
                </a>
              </p>
              <p>
                <strong>Pain point:</strong> {p.painPoint ?? '—'}
              </p>
              <details open={p.status === 'complete'}>
                <summary>Validation report</summary>
                <pre>{p.validation ?? '(awaiting GitHub Actions…)'}</pre>
              </details>
              <p style={{ marginTop: '0.75rem' }}>
                <a
                  href={`/api/pursue?weekEnding=${p.weekEnding}&rank=${p.rank}`}
                  download
                  style={{
                    display: 'inline-block',
                    background: 'var(--accent)',
                    color: '#001220',
                    padding: '0.5rem 0.9rem',
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  ⬇ Download starter project (.zip)
                </a>
              </p>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
