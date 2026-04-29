export type Source = 'reddit' | 'github_issue' | 'github_repo';

export type Sentiment = 'complaint' | 'question' | 'discussion' | 'showcase';

export interface ScrapedTopic {
  source: Source;
  externalId: string;
  title: string;
  url: string;
  body: string;
  origin: string;        // subreddit / repo full name
  createdAt: number;     // unix seconds
  upvotes: number;
  comments: number;
}

export interface RankedTopic {
  topicId: number;
  rank: number;
  score: number;
  prevRank: number | null;
  title: string;
  url: string;
  source: Source;
  origin: string;
  theme: string | null;
  painPoint: string | null;
  sentiment: Sentiment | null;
}
