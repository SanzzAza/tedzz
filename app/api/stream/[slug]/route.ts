import { NextRequest, NextResponse } from 'next/server'
import { scrapeStream } from '@/lib/scraper'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    if (!params.slug) return NextResponse.json({ ok: false, msg: 'slug required' }, { status: 400 })
    const ep = parseInt(req.nextUrl.searchParams.get('ep') || '1')
    const { data, hit } = await cached(`stream:${params.slug}:${ep}`, () => scrapeStream(params.slug, ep), 120)
    return NextResponse.json({ ok: true, data, cached: hit, ts: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, data: null, msg: String(e), ts: new Date().toISOString() }, { status: 500 })
  }
}
