import { GoogleGenAI, Type } from '@google/genai';
import {
  buildUserPrompt,
  SYSTEM_PROMPT,
  type ExtractInput,
  type ExtractOutput,
  type ExtractProvider,
} from './types';

const MODEL = 'gemini-2.5-flash';

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Gemini 2.5 Flash with structured JSON output.
 * Free tier: 1,500 requests/day, 1M tokens/min. We use ~300 req/day, ~150k TPD.
 */
export const geminiProvider: ExtractProvider = {
  name: 'gemini',

  available() {
    const k = process.env.GEMINI_API_KEY;
    return !!k && k.length > 20;
  },

  async extract(input: ExtractInput): Promise<ExtractOutput | null> {
    try {
      const res = await getClient().models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentiment: { type: Type.STRING, enum: ['complaint', 'question', 'discussion', 'showcase'] },
              theme: { type: Type.STRING },
              pain_point: { type: Type.STRING, nullable: true },
            },
            required: ['sentiment', 'theme'],
          },
          maxOutputTokens: 400,
        },
      });
      const text = res.text;
      if (!text) return null;
      const parsed = JSON.parse(text) as Omit<ExtractOutput, 'provider'>;
      return { ...parsed, provider: 'gemini' };
    } catch (e) {
      console.warn('[gemini] extract failed for', input.topicId, (e as Error).message);
      return null;
    }
  },
};
