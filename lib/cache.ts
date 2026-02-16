interface E<T> { d: T; exp: number }
const s = new Map<string, E<unknown>>()

export function cget<T>(k: string): T | null {
  const e = s.get(k) as E<T> | undefined
  if (!e) return null
  if (Date.now() > e.exp) { s.delete(k); return null }
  return e.d
}

export function cset<T>(k: string, d: T, ttl = 300) {
  if (s.size > 400) { const f = s.keys().next().value; if (f) s.delete(f) }
  s.set(k, { d, exp: Date.now() + ttl * 1000 })
}

export async function cached<T>(k: string, fn: () => Promise<T>, ttl = 300): Promise<{ data: T; hit: boolean }> {
  const c = cget<T>(k)
  if (c) return { data: c, hit: true }
  const d = await fn()
  cset(k, d, ttl)
  return { data: d, hit: false }
}
