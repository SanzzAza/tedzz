import { NextRequest, NextResponse } from 'next/server'
import { scrapeDramas } from '@/lib/scraper'
import { cached } from '@/lib/cache'
import type { ApiRes, DramaCard } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = parseInt(sp.get('page') || '1')
    const category = sp.get('category') || undefined

    const key = `dramas:${page}:${category || 'all'}`
    const { data, hit } = await cached(key, () => scrapeDramas(page, category), 300)

    const res: ApiRes<{ dramas: DramaCard[]; page: number; hasMore: boolean }> = {
      ok: true,
      data: { dramas: data.dramas, page, hasMore: data.hasMore },
      cached: hit,
      ts: new Date().toISOString(),
      source: data.source,
    }

    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json(
      { ok: false, data: null, cached: false, ts: new Date().toISOString(), msg: String(e) },
      { status: 500 }
    )
  }
}
