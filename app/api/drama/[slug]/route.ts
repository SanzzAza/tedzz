import { NextRequest, NextResponse } from 'next/server'
import { scrapeDramaDetail } from '@/lib/scraper'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    if (!params.slug) return NextResponse.json({ ok: false, msg: 'slug required' }, { status: 400 })
    const { data, hit } = await cached(`drama:${params.slug}`, () => scrapeDramaDetail(params.slug), 600)
    if (!data) return NextResponse.json({ ok: false, msg: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, data, cached: hit, ts: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, data: null, msg: String(e), ts: new Date().toISOString() }, { status: 500 })
  }
}
