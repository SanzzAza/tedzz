import { NextRequest, NextResponse } from 'next/server';
import { scrapeSearch } from '@/lib/scraper';
import { withCache } from '@/lib/cache';
import type { APIResponse, SearchResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1');

    if (!q) {
      return NextResponse.json(
        { success: false, message: 'q (query) parameter is required' },
        { status: 400 }
      );
    }

    const cacheKey = `search:${q}:${page}`;
    const { data, cached } = await withCache(
      cacheKey,
      () => scrapeSearch(q, page),
      180
    );

    const response: APIResponse<SearchResult> = {
      success: true,
      data,
      cached,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
