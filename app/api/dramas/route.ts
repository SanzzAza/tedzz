import { NextRequest, NextResponse } from 'next/server'
import { scrapeDramas } from '@/lib/scraper'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = parseInt(sp.get('page') || '1')
    const category = sp.get('category') || undefined
    const { data, hit } = await cached(`dramas:${page}:${category||'all'}`, () => scrapeDramas(page, category), 300)
    return NextResponse.json({ ok: true, data: { dramas: data.dramas, page, hasMore: data.hasMore }, cached: hit, ts: new Date().toISOString(), source: data.source })
  } catch (e) {
    return NextResponse.json({ ok: false, data: null, msg: String(e), ts: new Date().toISOString() }, { status: 500 })
  }
}
