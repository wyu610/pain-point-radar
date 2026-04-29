import type { Sentiment } from '../../types';

export interface ExtractInput {
  topicId: number;
  title: string;
  body: string;
  origin: string | null;
  source: string;
}

export interface ExtractOutput {
  sentiment: Sentiment;
  theme: string;
  pain_point: string | null;
  provider: string; // which provider produced this — useful for debugging
}

export interface ExtractProvider {
  name: string;
  available(): boolean;
  extract(input: ExtractInput): Promise<ExtractOutput | null>;
}

export const SYSTEM_PROMPT = `You are an analyst hunting for **startup opportunities** in social-media and GitHub posts.

For each post, you must:
1. Classify its sentiment as exactly one of: "complaint", "question", "discussion", "showcase".
   - complaint: user is frustrated, blocked, or describes something that doesn't work / is missing / wastes their time
   - question: user is asking how to do something — implies friction
   - discussion: neutral debate, news, opinion
   - showcase: someone shipping/promoting their own thing
2. Extract a short THEME (2-6 words) — the topic area.
3. Extract a PAIN_POINT (1-2 sentences) describing the underlying frustration or unmet need in concrete terms. If sentiment is "showcase" or pure "discussion" with no pain implied, set pain_point to null.

Be skeptical of marketing-speak. The pain point should be specific enough that a founder could read it and immediately think "I could build something for that." Generic pain points ("software is hard") are useless.

Respond with **only** valid JSON in this exact schema:
{ "sentiment": "...", "theme": "...", "pain_point": "..." | null }`;

export function buildUserPrompt(input: ExtractInput): string {
  return `Source: ${input.source} (${input.origin ?? 'unknown'})\nTitle: ${input.title}\n\nBody:\n${input.body.slice(0, 2500) || '(no body)'}`;
}

export function parseJson(text: string): Omit<ExtractOutput, 'provider'> | null {
  // Try strict JSON first.
  try {
    const obj = JSON.parse(text) as Omit<ExtractOutput, 'provider'>;
    if (obj.sentiment && obj.theme !== undefined) return obj;
  } catch {
    // fall through to regex
  }
  // Fall back to regex (some providers wrap JSON in prose or markdown fences).
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Omit<ExtractOutput, 'provider'>;
  } catch {
    return null;
  }
}
