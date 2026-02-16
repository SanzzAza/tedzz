interface Entry<T> { data: T; exp: number }

const store = new Map<string, Entry<unknown>>()

export function cget<T>(key: string): T | null {
  const e = store.get(key) as Entry<T> | undefined
  if (!e) return null
  if (Date.now() > e.exp) { store.delete(key); return null }
  return e.data
}

export function cset<T>(key: string, data: T, ttl = 300): void {
  if (store.size > 400) {
    const first = store.keys().next().value
    if (first) store.delete(first)
  }
  store.set(key, { data, exp: Date.now() + ttl * 1000 })
}

export async function cached<T>(key: string, fn: () => Promise<T>, ttl = 300): Promise<{ data: T; hit: boolean }> {
  const c = cget<T>(key)
  if (c) return { data: c, hit: true }
  const d = await fn()
  cset(key, d, ttl)
  return { data: d, hit: false }
}
