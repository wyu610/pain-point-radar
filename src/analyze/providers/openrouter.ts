import {
  buildUserPrompt,
  parseJson,
  SYSTEM_PROMPT,
  type ExtractInput,
  type ExtractOutput,
  type ExtractProvider,
} from './types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * OpenRouter free models (deepseek-chat:free, qwen-2.5:free, llama-3.3:free).
 * Same OpenAI-compatible API; we use json_object response format.
 */
export const openrouterProvider: ExtractProvider = {
  name: 'openrouter',

  available() {
    const k = process.env.OPENROUTER_API_KEY;
    return !!k && k.startsWith('sk-or-');
  },

  async extract(input: ExtractInput): Promise<ExtractOutput | null> {
    const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat:free';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'content-type': 'application/json',
          'HTTP-Referer': process.env.APP_URL ?? 'https://localhost',
          'X-Title': 'pain-point-radar',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          max_tokens: 400,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.warn(`[openrouter] ${model} -> ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content;
      if (!text) return null;
      const parsed = parseJson(text);
      return parsed ? { ...parsed, provider: `openrouter:${model}` } : null;
    } catch (e) {
      console.warn('[openrouter] extract failed for', input.topicId, (e as Error).message);
      return null;
    }
  },
};
