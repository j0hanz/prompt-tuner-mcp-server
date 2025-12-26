// Prompt refinement cache
import { createHash } from 'node:crypto';

import { LRUCache } from 'lru-cache';

import { config } from '../config/env.js';
import { debugCache } from './errors.js';

const MAX_CACHE_ENTRIES = config.CACHE_MAX_SIZE;
const CACHE_ENTRY_TTL_MS = 15 * 60 * 1000; // 15 minutes
const refinementCache = new LRUCache<string, string>({
  max: MAX_CACHE_ENTRIES,
  ttl: CACHE_ENTRY_TTL_MS,
});

// Generates SHA-256 hash for cache key
function generateCacheKey(
  prompt: string,
  technique: string,
  format: string
): string {
  const data = `${prompt}|${technique}|${format}`;
  return createHash('sha256').update(data).digest('hex');
}

// Retrieves cached refinement result if available
export function getCachedRefinement(
  prompt: string,
  technique: string,
  format: string
): string | null {
  const key = generateCacheKey(prompt, technique, format);
  const cached = refinementCache.get(key) ?? null;
  debugCache('getCachedRefinement: key=%s hit=%s', key.slice(0, 8), !!cached);
  return cached;
}

// Caches a refinement result
export function setCachedRefinement(
  prompt: string,
  technique: string,
  format: string,
  refined: string
): void {
  const key = generateCacheKey(prompt, technique, format);
  refinementCache.set(key, refined);
  debugCache(
    'setCachedRefinement: key=%s size=%d',
    key.slice(0, 8),
    refinementCache.size
  );
}
