import { NextRequest, NextResponse } from 'next/server'
import { scrapeDramaDetail } from '@/lib/scraper'
import { cached } from '@/lib/cache'
import type { ApiRes, DramaDetail } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { slug } = params
    if (!slug) return NextResponse.json({ ok: false, msg: 'slug required' }, { status: 400 })

    const { data, hit } = await cached(`drama:${slug}`, () => scrapeDramaDetail(slug), 600)

    if (!data) return NextResponse.json({ ok: false, msg: 'Drama not found' }, { status: 404 })

    const res: ApiRes<DramaDetail> = {
      ok: true,
      data,
      cached: hit,
      ts: new Date().toISOString(),
    }

    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json(
      { ok: false, data: null, cached: false, ts: new Date().toISOString(), msg: String(e) },
      { status: 500 }
    )
  }
}
