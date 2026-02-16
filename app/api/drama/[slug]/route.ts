import { NextRequest, NextResponse } from 'next/server';
import { scrapeDramaDetail } from '@/lib/scraper';
import { withCache } from '@/lib/cache';
import type { APIResponse, DramaDetail } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    if (!slug) {
      return NextResponse.json(
        { success: false, message: 'slug is required' },
        { status: 400 }
      );
    }

    const cacheKey = `drama:${slug}`;

    const { data, cached } = await withCache(
      cacheKey,
      () => scrapeDramaDetail(slug),
      600
    );

    if (!data) {
      return NextResponse.json(
        { success: false, message: 'Drama not found' },
        { status: 404 }
      );
    }

    const response: APIResponse<DramaDetail> = {
      success: true,
      data,
      cached,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 's-maxage=600, stale-while-revalidate=1200',
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
