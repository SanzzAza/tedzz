import { NextRequest, NextResponse } from 'next/server';
import { scrapeDramas, scrapeHome } from '@/lib/scraper';
import { withCache } from '@/lib/cache';
import type { APIResponse, DramaCard } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const category = searchParams.get('category') || undefined;

    const cacheKey = `dramas:${page}:${category || 'all'}`;

    const { data, cached } = await withCache(
      cacheKey,
      () => scrapeDramas(page, category),
      300
    );

    const response: APIResponse<{
      dramas: DramaCard[];
      page: number;
      hasMore: boolean;
    }> = {
      success: true,
      data: {
        dramas: data.dramas,
        page,
        hasMore: data.hasMore,
      },
      cached,
      timestamp: new Date().toISOString(),
      source: data.source,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    });
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
