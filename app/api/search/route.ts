import { NextRequest, NextResponse } from 'next/server'
import { scrapeSearch } from '@/lib/scraper'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')
    if (!q) return NextResponse.json({ ok: false, msg: 'q required' }, { status: 400 })
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1')
    const { data, hit } = await cached(`search:${q}:${page}`, () => scrapeSearch(q, page), 180)
    return NextResponse.json({ ok: true, data: { query: q, ...data }, cached: hit, ts: new Date().toISOString(), source: data.source })
  } catch (e) {
    return NextResponse.json({ ok: false, data: null, msg: String(e), ts: new Date().toISOString() }, { status: 500 })
  }
}
