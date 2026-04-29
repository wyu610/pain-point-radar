import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import { heuristicProvider } from './heuristic';
import { openrouterProvider } from './openrouter';
import type { ExtractInput, ExtractOutput, ExtractProvider } from './types';

/**
 * Provider chain (priority order):
 *   1. Anthropic   — paid, best quality. Skip the env var to skip the provider.
 *   2. Gemini      — FREE tier (1.5k RPD). Recommended primary for the free build.
 *   3. OpenRouter  — FREE models (deepseek/qwen/llama). Backup.
 *   4. Heuristic   — always available. Network-free. Quality is rough.
 *
 * The chain returns the first provider that successfully extracts. Failures
 * (rate limits, API errors, malformed JSON) cascade to the next provider.
 */
const CHAIN: ExtractProvider[] = [
  anthropicProvider,
  geminiProvider,
  openrouterProvider,
  heuristicProvider,
];

export async function extractWithChain(input: ExtractInput): Promise<ExtractOutput | null> {
  for (const p of CHAIN) {
    if (!p.available()) continue;
    const result = await p.extract(input);
    if (result) return result;
  }
  return null;
}

export function activeProviders(): string[] {
  return CHAIN.filter((p) => p.available()).map((p) => p.name);
}

export type { ExtractInput, ExtractOutput };
