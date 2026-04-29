import type { ScrapedTopic } from '../types';

interface GhSearchResp<T> {
  items: T[];
}
interface GhIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  comments: number;
  reactions?: { total_count?: number; '+1'?: number };
  created_at: string;
  repository_url: string;
}
interface GhRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  open_issues_count: number;
  pushed_at: string;
  created_at: string;
}

function gh(token: string | undefined) {
  return async (path: string) => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'User-Agent': 'pain-point-radar',
      },
    });
    if (!res.ok) {
      console.warn(`github ${path} -> ${res.status}`);
      return null;
    }
    return res.json();
  };
}

function expandQuery(q: string): string {
  const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  return q.replaceAll('{{7d_ago}}', sevenAgo);
}

export async function scrapeGitHub(cfg: {
  trending_languages: string[];
  trending_window: string;
  issue_queries: string[];
}): Promise<ScrapedTopic[]> {
  const rawToken = process.env.GITHUB_TOKEN;
  const token =
    rawToken && /^(ghp_|github_pat_|ghs_)/.test(rawToken) && !rawToken.endsWith('...') && rawToken.length > 20
      ? rawToken
      : undefined;
  if (rawToken && !token) console.warn('[github] GITHUB_TOKEN looks like placeholder — using anonymous');
  const fetchGh = gh(token);
  const out: ScrapedTopic[] = [];

  for (const rawQuery of cfg.issue_queries) {
    const q = expandQuery(rawQuery);
    const data = (await fetchGh(`/search/issues?q=${encodeURIComponent(q)}&per_page=30`)) as GhSearchResp<GhIssue> | null;
    if (!data?.items) continue;
    for (const it of data.items) {
      const repo = it.repository_url.replace('https://api.github.com/repos/', '');
      out.push({
        source: 'github_issue',
        externalId: `${repo}#${it.number}`,
        title: it.title,
        url: it.html_url,
        body: (it.body ?? '').slice(0, 4000),
        origin: repo,
        createdAt: Math.floor(new Date(it.created_at).getTime() / 1000),
        upvotes: it.reactions?.['+1'] ?? it.reactions?.total_count ?? 0,
        comments: it.comments,
      });
    }
  }

  for (const lang of cfg.trending_languages) {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const q = `language:${lang} created:>${since} stars:>50`;
    const data = (await fetchGh(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`)) as GhSearchResp<GhRepo> | null;
    if (!data?.items) continue;
    for (const r of data.items) {
      out.push({
        source: 'github_repo',
        externalId: `repo:${r.full_name}`,
        title: r.full_name + (r.description ? ` — ${r.description}` : ''),
        url: r.html_url,
        body: r.description ?? '',
        origin: r.full_name,
        createdAt: Math.floor(new Date(r.created_at).getTime() / 1000),
        upvotes: r.stargazers_count,
        comments: r.open_issues_count,
      });
    }
  }
  return out;
}
