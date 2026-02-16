import { NextResponse } from 'next/server';
import { scrapeHome } from '@/lib/scraper';
import { withCache } from '@/lib/cache';
import type { APIResponse, HomePageData } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const { data, cached } = await withCache('home', scrapeHome, 300);

    const response: APIResponse<HomePageData> = {
      success: true,
      data: {
        banners: data.banners,
        sections: data.sections,
        categories: data.categories,
      },
      cached,
      timestamp: new Date().toISOString(),
      source: data.rawSource,
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
