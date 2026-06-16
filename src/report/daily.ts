import { extractPendingTopics, reextractHeuristicTopics } from '../analyze/extract';
import { computeAndStoreDailyRanking } from '../analyze/rank';
import { getSetting, setSetting, type SourcesConfig } from '../db/settings';
import { scrapeGitHub } from '../scrape/github';
import { upsertTopics } from '../scrape/persist';
import { scrapeReddit } from '../scrape/reddit';

export interface DailyRunStats {
  date: string;
  finishedAt: string;
  redditCount: number;
  redditAuthenticated: boolean;
  redditFailedListings: number;
  githubCount: number;
  newCount: number;
  rankingCount: number;
}

export async function runDaily(): Promise<DailyRunStats> {
  const cfg = await getSetting<SourcesConfig>('sources');
  if (!cfg) throw new Error('sources config missing — run npm run db:seed first');

  console.log('[daily] scraping reddit…');
  const reddit = await scrapeReddit(cfg.reddit);
  console.log(
    `[daily]   reddit: ${reddit.topics.length} items ` +
      `(auth=${reddit.authenticated}, failed ${reddit.failedListings}/${reddit.totalListings} listings)`
  );
  if (reddit.topics.length === 0) {
    console.warn('[daily]   WARNING: reddit returned 0 topics — likely rate-limited or blocked');
  }

  console.log('[daily] scraping github…');
  const github = await scrapeGitHub(cfg.github);
  console.log(`[daily]   github: ${github.length} items`);

  const all = [...reddit.topics, ...github];
  const upserts = await upsertTopics(all);
  const newCount = upserts.filter((u) => u.isNew).length;
  console.log(`[daily] upserted ${all.length} (${newCount} new)`);

  console.log('[daily] extracting pain points…');
  const extracted = await extractPendingTopics(300);
  console.log(`[daily]   extracted ${extracted}`);

  // Opportunistically upgrade rows the heuristic filled when an LLM was down.
  const reextracted = await reextractHeuristicTopics(50);
  if (reextracted > 0) console.log(`[daily]   re-extracted ${reextracted} heuristic rows`);

  console.log('[daily] computing ranking…');
  const ranking = await computeAndStoreDailyRanking(20);

  const tz = process.env.RADAR_TZ ?? 'America/Denver';
  const date = new Date().toLocaleDateString('en-CA', { timeZone: tz });

  const stats: DailyRunStats = {
    date,
    finishedAt: new Date().toISOString(),
    redditCount: reddit.topics.length,
    redditAuthenticated: reddit.authenticated,
    redditFailedListings: reddit.failedListings,
    githubCount: github.length,
    newCount,
    rankingCount: ranking.length,
  };
  await setSetting('last_daily_run', stats);

  console.log(`[daily] done. date=${date} count=${ranking.length}`);
  return stats;
}
