import Anthropic from '@anthropic-ai/sdk';
import {
  buildUserPrompt,
  parseJson,
  SYSTEM_PROMPT,
  type ExtractInput,
  type ExtractOutput,
  type ExtractProvider,
} from './types';

const MODEL = 'claude-haiku-4-5-20251001';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const anthropicProvider: ExtractProvider = {
  name: 'anthropic',

  available() {
    const k = process.env.ANTHROPIC_API_KEY;
    return !!k && k.startsWith('sk-ant-') && !k.endsWith('...');
  },

  async extract(input: ExtractInput): Promise<ExtractOutput | null> {
    try {
      const res = await getClient().messages.create({
        model: MODEL,
        max_tokens: 400,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
      });
      const block = res.content.find((c) => c.type === 'text');
      if (!block || block.type !== 'text') return null;
      const parsed = parseJson(block.text);
      return parsed ? { ...parsed, provider: 'anthropic' } : null;
    } catch (e) {
      console.warn('[anthropic] extract failed for', input.topicId, (e as Error).message);
      return null;
    }
  },
};
