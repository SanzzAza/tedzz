import { NextRequest, NextResponse } from 'next/server'
import { scrapeSearch } from '@/lib/scraper'
import { cached } from '@/lib/cache'
import type { ApiRes, DramaCard } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1')

    if (!q) return NextResponse.json({ ok: false, msg: 'q (query) required' }, { status: 400 })

    const { data, hit } = await cached(`search:${q}:${page}`, () => scrapeSearch(q, page), 180)

    const res: ApiRes<{ query: string; total: number; dramas: DramaCard[] }> = {
      ok: true,
      data: { query: q, total: data.total, dramas: data.dramas },
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
