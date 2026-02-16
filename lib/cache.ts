interface CacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  expires: number
}

const store = new Map<string, CacheEntry>()
const MAX_SIZE = 400

export function cget<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

export function cset(key: string, data: unknown, ttl: number = 300): void {
  if (store.size >= MAX_SIZE) {
    const firstKey = store.keys().next()
    if (!firstKey.done && firstKey.value) {
      store.delete(firstKey.value)
    }
  }
  store.set(key, {
    data,
    expires: Date.now() + ttl * 1000,
  })
}

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = 300
): Promise<{ data: T; hit: boolean }> {
  const existing = cget<T>(key)
  if (existing !== null) {
    return { data: existing, hit: true }
  }
  const fresh = await fn()
  cset(key, fresh, ttl)
  return { data: fresh, hit: false }
}
