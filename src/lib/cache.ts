// Prompt refinement cache for PromptTuner MCP
// Simplified implementation using Map with FIFO eviction

const MAX_CACHE_SIZE = parseInt(process.env.CACHE_MAX_SIZE ?? '1000', 10);
const refinementCache = new Map<string, string>();

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
 * Caches a refinement result with FIFO eviction to prevent unbounded growth.
 */
export function setCachedRefinement(
  prompt: string,
  technique: string,
  format: string,
  refined: string
): void {
  // FIFO eviction: remove oldest entry when cache is full
  if (refinementCache.size >= MAX_CACHE_SIZE) {
    const firstKey = refinementCache.keys().next().value;
    if (firstKey !== undefined) {
      refinementCache.delete(firstKey);
    }
  }

  const key = `${prompt}|${technique}|${format}`;
  refinementCache.set(key, refined);
}

/**
 * Clears the refinement cache.
 */
export function clearCache(): void {
  refinementCache.clear();
}
