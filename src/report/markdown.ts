import type { RankedTopic } from '../types';
import type { WeeklyPick } from './weekly';

function rankDelta(rank: number, prev: number | null): string {
  if (prev == null) return ' NEW ';
  const d = prev - rank;
  if (d === 0) return '  =  ';
  if (d > 0) return ` +${d} `;
  return ` ${d} `;
}

export function renderDailyMarkdown(date: string, ranking: RankedTopic[]): string {
  const lines: string[] = [];
  lines.push(`# Pain-Point Radar — Daily ${date}`, '');
  lines.push(`Top ${ranking.length} pain points and hot topics across Reddit + GitHub.`, '');
  lines.push('| # | Δ | Score | Source | Theme | Title | Pain point |');
  lines.push('|---|---|------:|--------|-------|-------|------------|');
  for (const r of ranking) {
    const titleLink = `[${r.title.replaceAll('|', '\\|').slice(0, 80)}](${r.url})`;
    const pain = (r.painPoint ?? '—').replaceAll('|', '\\|').slice(0, 200);
    lines.push(
      `| ${r.rank} | ${rankDelta(r.rank, r.prevRank)} | ${r.score.toFixed(1)} | ${r.source}/${r.origin} | ${r.theme ?? '—'} | ${titleLink} | ${pain} |`
    );
  }
  return lines.join('\n') + '\n';
}

export function renderWeeklyMarkdown(weekEnding: string, picks: WeeklyPick[]): string {
  const out: string[] = [];
  out.push(`# Pain-Point Radar — Weekly Top 5 (week ending ${weekEnding})`, '');
  picks.forEach((p) => {
    out.push(`## ${p.rank}. ${p.theme ?? p.title}`);
    out.push(`- **Source thread**: [${p.title}](${p.url})`);
    out.push(`- **Pain point**: ${p.painPoint ?? '—'}`);
    out.push(`- **Status**: ${p.status}`);
    out.push('');
    out.push('### Karpathy autoresearch validation');
    out.push('');
    out.push(p.validation ?? '_(validation pending or skipped)_');
    out.push('');
  });
  return out.join('\n');
}
