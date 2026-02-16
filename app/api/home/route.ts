import { NextResponse } from 'next/server'
import { scrapeHome } from '@/lib/scraper'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    const { data, hit } = await cached('home', scrapeHome, 300)
    return NextResponse.json({ ok: true, data, cached: hit, ts: new Date().toISOString(), source: data.source })
  } catch (e) {
    return NextResponse.json({ ok: false, data: null, msg: String(e), ts: new Date().toISOString() }, { status: 500 })
  }
}
