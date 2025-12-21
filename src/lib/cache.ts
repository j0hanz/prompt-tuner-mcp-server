// Prompt refinement cache for PromptTuner MCP
import { LRUCache } from 'lru-cache';

const MAX_CACHE_SIZE = parseInt(process.env.CACHE_MAX_SIZE ?? '1000', 10);
const refinementCache = new LRUCache<string, string>({
  max: MAX_CACHE_SIZE,
});

/**
 * Retrieves cached refinement result if available.
 */
export function getCachedRefinement(
  prompt: string,
  technique: string,
  format: string
): string | null {
  const key = `${prompt}|${technique}|${format}`;
  return refinementCache.get(key) ?? null;
}

/**
 * Caches a refinement result.
 */
export function setCachedRefinement(
  prompt: string,
  technique: string,
  format: string,
  refined: string
): void {
  const key = `${prompt}|${technique}|${format}`;
  refinementCache.set(key, refined);
}

/**
 * Clears the refinement cache.
 */
export function clearCache(): void {
  refinementCache.clear();
}
