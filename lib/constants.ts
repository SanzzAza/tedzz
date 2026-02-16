// ================================
// CONFIGURATION & CONSTANTS
// ================================

export const CONFIG = {
  BASE_URL: process.env.GOODSHORT_BASE_URL || 'https://www.goodshort.com',
  LANG: process.env.GOODSHORT_LANG || 'id',
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '300'),

  get HOME_URL() {
    return `${this.BASE_URL}/${this.LANG}`;
  },

  HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  } as Record<string, string>,

  API_HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Content-Type': 'application/json',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  } as Record<string, string>,

  // Possible API endpoint patterns
  API_PATHS: {
    DRAMA_LIST: [
      '/api/drama/list',
      '/api/v1/drama/list',
      '/api/v1/video/list',
      '/api/short/list',
      '/api/series/list',
      '/api/v1/series',
      '/api/home/recommend',
      '/api/home/list',
      '/api/video/list',
      '/api/v2/drama/list',
    ],
    DRAMA_DETAIL: [
      '/api/drama/detail',
      '/api/v1/drama/detail',
      '/api/v1/video/detail',
      '/api/short/detail',
      '/api/series/detail',
    ],
    EPISODES: [
      '/api/drama/episodes',
      '/api/v1/drama/episodes',
      '/api/episode/list',
      '/api/v1/episode/list',
      '/api/video/episode',
    ],
    STREAM: [
      '/api/video/play',
      '/api/v1/video/play',
      '/api/episode/play',
      '/api/video/url',
      '/api/stream/url',
    ],
    SEARCH: [
      '/api/search',
      '/api/v1/search',
      '/api/drama/search',
      '/api/video/search',
    ],
    CATEGORIES: [
      '/api/category/list',
      '/api/v1/category',
      '/api/genre/list',
      '/api/tag/list',
    ],
    HOME: [
      '/api/home',
      '/api/home/data',
      '/api/home/index',
      '/api/index',
      '/api/init',
      '/api/app/config',
    ],
  },
};

// HTML selectors (adaptive)
export const SELECTORS = {
  DRAMA_CARDS: [
    '[class*="drama-card"]',
    '[class*="video-card"]',
    '[class*="drama-item"]',
    '[class*="card-item"]',
    '[class*="series-card"]',
    '[class*="short-card"]',
    '[class*="movie-card"]',
    'div[class*="card"] a[href*="/drama"]',
    'div[class*="card"] a[href*="/detail"]',
    'div[class*="item"] a[href*="/drama"]',
    'article a[href*="/drama"]',
  ],

  EPISODE_LIST: [
    '[class*="episode-list"]',
    '[class*="episode-wrap"]',
    '[class*="ep-list"]',
    '[class*="playlist"]',
    '[class*="video-list"]',
    '[class*="chapter-list"]',
  ],

  SECTIONS: [
    'section',
    '[class*="section"]',
    '[class*="module"]',
    '[class*="block"]',
    '[class*="row"]',
    '[class*="swiper"]',
  ],

  // URL patterns to identify drama pages
  DRAMA_URL_PATTERNS: [
    /\/drama\/[\w-]+/,
    /\/detail\/[\w-]+/,
    /\/series\/[\w-]+/,
    /\/video\/[\w-]+/,
    /\/play\/[\w-]+/,
    /\/short\/[\w-]+/,
    /\/watch\/[\w-]+/,
    /\/id\/[\w-]+\/[\w-]+/,
  ],
};
