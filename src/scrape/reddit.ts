import type { ScrapedTopic } from '../types';

interface RedditChild {
  data: {
    id: string;
    title: string;
    selftext: string;
    permalink: string;
    subreddit: string;
    created_utc: number;
    ups: number;
    num_comments: number;
    stickied: boolean;
    over_18: boolean;
  };
}

interface RedditListing {
  data: { children: RedditChild[] };
}

const UA = 'pain-point-radar/0.1 (by /u/local)';

async function fetchListing(
  subreddit: string,
  listing: 'hot' | 'top',
  limit: number,
  topWindow: string
): Promise<RedditChild[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (listing === 'top') params.set('t', topWindow);
  const url = `https://www.reddit.com/r/${subreddit}/${listing}.json?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.warn(`reddit: ${subreddit}/${listing} -> ${res.status}`);
    return [];
  }
  const json = (await res.json()) as RedditListing;
  return json.data?.children ?? [];
}

export async function scrapeReddit(cfg: {
  subreddits: string[];
  listings: ('hot' | 'top')[];
  top_window: string;
  per_listing_limit: number;
}): Promise<ScrapedTopic[]> {
  const out = new Map<string, ScrapedTopic>();
  for (const sub of cfg.subreddits) {
    for (const listing of cfg.listings) {
      const items = await fetchListing(sub, listing, cfg.per_listing_limit, cfg.top_window);
      for (const { data } of items) {
        if (data.stickied || data.over_18) continue;
        const key = `t3_${data.id}`;
        if (out.has(key)) continue;
        out.set(key, {
          source: 'reddit',
          externalId: key,
          title: data.title,
          url: `https://www.reddit.com${data.permalink}`,
          body: (data.selftext ?? '').slice(0, 4000),
          origin: data.subreddit,
          createdAt: Math.floor(data.created_utc),
          upvotes: data.ups ?? 0,
          comments: data.num_comments ?? 0,
        });
      }
      // be polite — reddit unauthenticated is ~60 req/min
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return [...out.values()];
}
