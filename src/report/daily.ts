import { extractPendingTopics } from '../analyze/extract';
import { computeAndStoreDailyRanking } from '../analyze/rank';
import { getSetting, type SourcesConfig } from '../db/settings';
import { scrapeGitHub } from '../scrape/github';
import { upsertTopics } from '../scrape/persist';
import { scrapeReddit } from '../scrape/reddit';

export async function runDaily(): Promise<{ date: string; count: number; newCount: number }> {
  const cfg = await getSetting<SourcesConfig>('sources');
  if (!cfg) throw new Error('sources config missing — run npm run db:seed first');

  console.log('[daily] scraping reddit…');
  const reddit = await scrapeReddit(cfg.reddit);
  console.log(`[daily]   reddit: ${reddit.length} items`);

  console.log('[daily] scraping github…');
  const github = await scrapeGitHub(cfg.github);
  console.log(`[daily]   github: ${github.length} items`);

  const all = [...reddit, ...github];
  const upserts = await upsertTopics(all);
  const newCount = upserts.filter((u) => u.isNew).length;
  console.log(`[daily] upserted ${all.length} (${newCount} new)`);

  console.log('[daily] extracting pain points…');
  const extracted = await extractPendingTopics(300);
  console.log(`[daily]   extracted ${extracted}`);

  console.log('[daily] computing ranking…');
  const ranking = await computeAndStoreDailyRanking(20);

  const tz = process.env.RADAR_TZ ?? 'America/Denver';
  const date = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  console.log(`[daily] done. date=${date} count=${ranking.length}`);
  return { date, count: ranking.length, newCount };
}
