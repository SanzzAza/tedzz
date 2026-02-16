import { NextResponse } from 'next/server'
import { discover } from '@/lib/scraper'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    const data = await discover()
    return NextResponse.json({ ok: true, data, ts: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, msg: String(e) }, { status: 500 })
  }
}
