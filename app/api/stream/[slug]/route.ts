import { NextRequest, NextResponse } from 'next/server'
import { scrapeStream } from '@/lib/scraper'
import { cached } from '@/lib/cache'
import type { ApiRes, StreamInfo } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { slug } = params
    const ep = parseInt(req.nextUrl.searchParams.get('ep') || '1')

    if (!slug) return NextResponse.json({ ok: false, msg: 'slug required' }, { status: 400 })

    const { data, hit } = await cached(`stream:${slug}:${ep}`, () => scrapeStream(slug, ep), 120)

    const res: ApiRes<StreamInfo> = {
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
