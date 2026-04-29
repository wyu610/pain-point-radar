import { getDailyRanking } from '../analyze/rank';

export const dynamic = 'force-dynamic';

function delta(rank: number, prev: number | null): { text: string; cls: string } {
  if (prev == null) return { text: 'NEW', cls: 'delta-new' };
  const d = prev - rank;
  if (d === 0) return { text: '=', cls: 'delta-flat' };
  if (d > 0) return { text: `▲${d}`, cls: 'delta-up' };
  return { text: `▼${-d}`, cls: 'delta-down' };
}

export default async function TodayPage() {
  const ranking = await getDailyRanking();
  return (
    <section>
      <h2>Today's top {ranking.length || 20}</h2>
      <p className="subtle">
        Latest snapshot from Reddit + GitHub, ranked by decayed signal × sentiment weight.
      </p>
      {ranking.length === 0 ? (
        <p className="subtle">
          No ranking yet. Wait for the next daily cron, or trigger it manually with
          {' '}
          <code>curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/daily</code>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Δ</th>
              <th>Score</th>
              <th>Source</th>
              <th>Theme</th>
              <th>Title</th>
              <th>Pain point</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => {
              const d = delta(r.rank, r.prevRank);
              return (
                <tr key={r.topicId}>
                  <td className="rank">{r.rank}</td>
                  <td className={d.cls}>{d.text}</td>
                  <td>{r.score.toFixed(1)}</td>
                  <td>
                    <span className="tag">{r.source}</span>
                    <br />
                    <span className="subtle">{r.origin}</span>
                  </td>
                  <td>{r.theme ?? '—'}</td>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                  </td>
                  <td className="subtle">{r.painPoint ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
