import type { Sentiment } from '../../types';
import type { ExtractInput, ExtractOutput, ExtractProvider } from './types';

const COMPLAINT = /\b(hate|sucks|broken|frustrat|annoying|impossible|nightmare|garbage|terrible|awful|disappointed|disappointing|abandoned|deprecated|obsolete|why does|why is .* so|stupid|useless|painful|miserable|wasted|nothing works|completely (broken|wrong))\b/i;

const QUESTION = /\b(how (do|can|to|should)|what(?:'s| is) the best|why (is|does|do|can(?:'t)?)|can someone|help me|anyone (know|use)|is there a)\b/i;

const SHOWCASE = /\b(I (built|made|created|launched|shipped|wrote|open[- ]?source|released)|introducing|just (released|launched|finished)|announce|^show hn)\b/i;

function classifySentiment(text: string): Sentiment {
  const s = text.toLowerCase();
  if (COMPLAINT.test(s)) return 'complaint';
  if (QUESTION.test(s) || s.endsWith('?')) return 'question';
  if (SHOWCASE.test(s)) return 'showcase';
  return 'discussion';
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'from', 'as', 'this', 'that', 'these', 'those', 'i', 'you',
  'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its',
  'our', 'their', 'do', 'does', 'did', 'have', 'has', 'had', 'will',
  'would', 'could', 'should', 'can', 'may', 'might', 'just', 'so',
  'not', 'no', 'yes', 'why', 'how', 'what', 'when', 'where', 'who',
]);

function extractTheme(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 5);
  return words.length ? words.join(' ') : title.slice(0, 40);
}

function extractPainPoint(input: ExtractInput, sentiment: Sentiment): string | null {
  if (sentiment !== 'complaint' && sentiment !== 'question') return null;
  // First sentence of body, falling back to title.
  const body = input.body.trim();
  if (body) {
    const firstSentence = body.split(/(?<=[.!?])\s+/)[0];
    if (firstSentence && firstSentence.length > 10) {
      return firstSentence.slice(0, 240);
    }
  }
  return input.title.slice(0, 240);
}

/**
 * Pure regex/keyword sentiment classifier — no network call.
 * Always available, used as the final fallback. Quality is rough but the
 * pipeline never blocks.
 */
export const heuristicProvider: ExtractProvider = {
  name: 'heuristic',

  available() {
    return true;
  },

  async extract(input: ExtractInput): Promise<ExtractOutput> {
    const combined = `${input.title}\n${input.body}`;
    const sentiment = classifySentiment(combined);
    return {
      sentiment,
      theme: extractTheme(input.title),
      pain_point: extractPainPoint(input, sentiment),
      provider: 'heuristic',
    };
  },
};
