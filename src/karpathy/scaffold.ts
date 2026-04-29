import JSZip from 'jszip';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/client';

const KARPATHY_SKILLS_CLAUDE_MD =
  'https://raw.githubusercontent.com/forrestchang/andrej-karpathy-skills/main/CLAUDE.md';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'idea';
}

export interface ZipResult {
  filename: string;
  bytes: Buffer;
  slug: string;
  topicId: number;
}

/**
 * Builds an in-memory zip of a starter project for the picked weekly idea.
 * Includes:
 *   - CLAUDE.md  fetched live from forrestchang/andrej-karpathy-skills
 *   - BACKGROUND.md with the source thread, pain point, and validation report
 *   - .gitignore + README.md placeholder
 */
export async function buildPursueZip(opts: {
  weekEnding: string;
  rank: number;
}): Promise<ZipResult> {
  const db = getDb();
  const rows = await db
    .select({
      topicId: schema.weeklyReports.topicId,
      title: schema.topics.title,
      url: schema.topics.url,
      theme: schema.topics.theme,
      painPoint: schema.topics.painPoint,
      validation: schema.weeklyReports.validationMd,
    })
    .from(schema.weeklyReports)
    .innerJoin(schema.topics, eq(schema.topics.id, schema.weeklyReports.topicId))
    .where(
      and(
        eq(schema.weeklyReports.weekEnding, opts.weekEnding),
        eq(schema.weeklyReports.rank, opts.rank)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Pick ${opts.weekEnding}#${opts.rank} not found`);

  const slug = slugify(row.theme ?? row.title);

  let claudeMd: string;
  try {
    const r = await fetch(KARPATHY_SKILLS_CLAUDE_MD, { cache: 'no-store' });
    claudeMd = r.ok
      ? await r.text()
      : `# ${row.theme ?? row.title}\n\n_(forrestchang/andrej-karpathy-skills CLAUDE.md fetch failed: ${r.status})_\n`;
  } catch (e) {
    claudeMd = `# ${row.theme ?? row.title}\n\n_(CLAUDE.md fetch error: ${(e as Error).message})_\n`;
  }

  const background = [
    `# Background — ${row.theme ?? row.title}`,
    '',
    `**Source thread:** ${row.url}`,
    `**Pain point:** ${row.painPoint ?? '—'}`,
    `**Picked from week ending:** ${opts.weekEnding} (rank #${opts.rank})`,
    '',
    '## Karpathy autoresearch validation',
    '',
    row.validation ?? '_(no validation captured yet — check the dashboard)_',
    '',
  ].join('\n');

  const readme = `# ${row.theme ?? row.title}\n\nSee BACKGROUND.md for the source pain point and validation.\nSee CLAUDE.md for the Karpathy-style project conventions.\n`;

  const gitignore = `node_modules\n.env\n.env.local\n.DS_Store\ndist\nbuild\n`;

  const zip = new JSZip();
  zip.file('CLAUDE.md', claudeMd);
  zip.file('BACKGROUND.md', background);
  zip.file('README.md', readme);
  zip.file('.gitignore', gitignore);

  const bytes = await zip.generateAsync({ type: 'nodebuffer' });

  await db.insert(schema.pursuedIdeas).values({
    topicId: row.topicId,
    weekEnding: opts.weekEnding,
    downloadedAt: new Date(),
  });

  return { filename: `${slug}.zip`, bytes, slug, topicId: row.topicId };
}
