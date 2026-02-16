// ================================
// CACHING LAYER
// ================================

import { CONFIG } from './constants';

interface CacheEntry<T> {
  data: T;
  expires: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize = 500;

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    // Evict oldest if full
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    this.store.set(key, {
      data,
      expires: Date.now() + (ttl || CONFIG.CACHE_TTL) * 1000,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.store.clear();
  }

  stats() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
    };
  }
}

// Singleton
export const cache = new MemoryCache();

// Helper: cache wrapper for async functions
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl?: number
): Promise<{ data: T; cached: boolean }> {
  const cached = cache.get<T>(key);
  if (cached) {
    return { data: cached, cached: true };
  }

  const data = await fn();
  cache.set(key, data, ttl);
  return { data, cached: false };
}
