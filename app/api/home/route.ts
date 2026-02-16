import { NextResponse } from 'next/server'
import { scrapeHome } from '@/lib/scraper'
import { cached } from '@/lib/cache'
import type { ApiRes, HomeData } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    const { data, hit } = await cached('home', scrapeHome, 300)

    const res: ApiRes<HomeData> = {
      ok: true,
      data: {
        banners: data.banners,
        sections: data.sections,
        categories: data.categories,
        allDramas: data.allDramas,
      },
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
