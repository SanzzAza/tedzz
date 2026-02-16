import { NextRequest, NextResponse } from 'next/server';
import { scrapeStreamUrl } from '@/lib/scraper';
import { withCache } from '@/lib/cache';
import type { APIResponse, StreamData } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { success: false, message: 'url parameter is required' },
        { status: 400 }
      );
    }

    const cacheKey = `stream:${Buffer.from(url).toString('base64url').slice(0, 32)}`;

    const { data: urls, cached } = await withCache(
      cacheKey,
      () => scrapeStreamUrl(url),
      120
    );

    const streams: StreamData[] = urls.map((u) => ({
      url: u,
      quality: u.includes('1080') ? '1080p' : u.includes('720') ? '720p' : u.includes('480') ? '480p' : 'auto',
      type: u.includes('.m3u8') ? ('hls' as const) : u.includes('.mp4') ? ('mp4' as const) : ('dash' as const),
    }));

    // Sort: HLS first, then by quality
    streams.sort((a, b) => {
      if (a.type === 'hls' && b.type !== 'hls') return -1;
      if (a.type !== 'hls' && b.type === 'hls') return 1;
      return 0;
    });

    const response: APIResponse<{ streams: StreamData[]; episodeUrl: string }> = {
      success: true,
      data: {
        streams,
        episodeUrl: url,
      },
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
