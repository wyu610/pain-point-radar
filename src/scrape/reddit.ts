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

export interface RedditScrapeResult {
  topics: ScrapedTopic[];
  authenticated: boolean;
  /** Number of (subreddit, listing) fetches that failed (non-OK response). */
  failedListings: number;
  totalListings: number;
}

function userAgent(): string {
  return process.env.REDDIT_USER_AGENT ?? 'web:pain-point-radar:0.2 (by /u/painpointradar)';
}

// ── App-only OAuth ─────────────────────────────────────────────────────────
// When REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set we use the "script"
// app client_credentials grant, which lifts the rate limit to ~600 req/10min
// and is far more reliable than anonymous www.reddit.com from cloud egress IPs.
let cachedToken: { value: string; expiresAt: number } | null = null;

function redditAuthConfigured(): boolean {
  return !!process.env.REDDIT_CLIENT_ID && !!process.env.REDDIT_CLIENT_SECRET;
}

async function getAccessToken(): Promise<string | null> {
  if (!redditAuthConfigured()) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const basic = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');
  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': userAgent(),
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      console.warn(`[reddit] token request -> ${res.status}; falling back to anonymous`);
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  } catch (e) {
    console.warn('[reddit] token fetch failed:', (e as Error).message);
    return null;
  }
}

async function fetchListing(
  subreddit: string,
  listing: 'hot' | 'top',
  limit: number,
  topWindow: string,
  token: string | null
): Promise<RedditChild[] | null> {
  const params = new URLSearchParams({ limit: String(limit), raw_json: '1' });
  if (listing === 'top') params.set('t', topWindow);
  const host = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const url = `${host}/r/${subreddit}/${listing}.json?${params}`;
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': userAgent(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      console.warn(`[reddit] ${subreddit}/${listing} -> ${res.status}`);
      return null;
    }
    const json = (await res.json()) as RedditListing;
    return json.data?.children ?? [];
  } catch (e) {
    console.warn(`[reddit] ${subreddit}/${listing} fetch error:`, (e as Error).message);
    return null;
  }
}

export async function scrapeReddit(cfg: {
  subreddits: string[];
  listings: ('hot' | 'top')[];
  top_window: string;
  per_listing_limit: number;
}): Promise<RedditScrapeResult> {
  const token = await getAccessToken();
  const authenticated = !!token;
  // Authenticated clients get ~600 req/10min (~1/s); anonymous needs to be slower.
  const delayMs = authenticated ? 1000 : 1500;

  const out = new Map<string, ScrapedTopic>();
  let failedListings = 0;
  let totalListings = 0;

  for (const sub of cfg.subreddits) {
    for (const listing of cfg.listings) {
      totalListings++;
      const items = await fetchListing(sub, listing, cfg.per_listing_limit, cfg.top_window, token);
      if (items === null) {
        failedListings++;
      } else {
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
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { topics: [...out.values()], authenticated, failedListings, totalListings };
}
