import { NextResponse } from 'next/server';
import { discoverEndpoints, scrapeHome } from '@/lib/scraper';
import type { APIResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const [endpoints, homeData] = await Promise.all([
      discoverEndpoints(),
      scrapeHome(),
    ]);

    const response: APIResponse<{
      workingEndpoints: Record<string, unknown>;
      homeStats: {
        totalDramas: number;
        totalSections: number;
        totalBanners: number;
        totalCategories: number;
        source: string;
        sampleDramas: unknown[];
      };
    }> = {
      success: true,
      data: {
        workingEndpoints: endpoints,
        homeStats: {
          totalDramas: homeData.allDramas.length,
          totalSections: homeData.sections.length,
          totalBanners: homeData.banners.length,
          totalCategories: homeData.categories.length,
          source: homeData.rawSource,
          sampleDramas: homeData.allDramas.slice(0, 5),
        },
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
