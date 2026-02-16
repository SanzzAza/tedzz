// ================================
// CORE SCRAPER ENGINE
// ================================

import * as cheerio from 'cheerio';
import { CONFIG, SELECTORS } from './constants';
import type {
  DramaCard,
  DramaDetail,
  Episode,
  HomeSection,
  Category,
  ScrapedPageData,
  SearchResult,
  Banner,
} from './types';

// ─── HTTP Fetcher ────────────────────────

async function fetchPage(url: string, isApi = false): Promise<string> {
  const headers = isApi ? CONFIG.API_HEADERS : CONFIG.HEADERS;

  const res = await fetch(url, {
    headers: {
      ...headers,
      Referer: CONFIG.HOME_URL,
      Origin: CONFIG.BASE_URL,
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return res.text();
}

async function fetchJSON<T = unknown>(url: string, body?: unknown): Promise<T | null> {
  try {
    const options: RequestInit = {
      headers: {
        ...CONFIG.API_HEADERS,
        Referer: CONFIG.HOME_URL,
        Origin: CONFIG.BASE_URL,
      },
    };

    if (body) {
      options.method = 'POST';
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return null;

    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Page Data Extractor ────────────────

function extractPageData(html: string): ScrapedPageData {
  const $ = cheerio.load(html);
  const result: ScrapedPageData = {};

  // 1. Next.js __NEXT_DATA__
  const nextScript = $('#__NEXT_DATA__');
  if (nextScript.length) {
    try {
      result.nextData = JSON.parse(nextScript.html() || '{}');
    } catch {
      /* skip */
    }
  }

  // 2. Nuxt.js __NUXT__
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    const nuxtMatch = text.match(/window\.__NUXT__\s*=\s*(.+?)(?:;?\s*$)/s);
    if (nuxtMatch) {
      try {
        result.nuxtData = JSON.parse(nuxtMatch[1]);
      } catch {
        /* eval-style nuxt data, skip */
      }
    }
  });

  // 3. Inline JSON / window.__DATA__
  result.inlineData = [];
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    const patterns = [
      /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
      /window\.__DATA__\s*=\s*({.+?});/s,
      /window\.__PRELOADED_STATE__\s*=\s*({.+?});/s,
      /var\s+pageData\s*=\s*({.+?});/s,
      /var\s+__data__\s*=\s*({.+?});/s,
    ];

    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        try {
          result.inlineData!.push(JSON.parse(m[1]));
        } catch {
          /* skip */
        }
      }
    }
  });

  return result;
}

// ─── Deep Object Search ─────────────────

function deepFind<T>(
  obj: unknown,
  predicate: (key: string, value: unknown) => boolean,
  depth = 0
): T[] {
  const results: T[] = [];
  if (depth > 12 || !obj) return results;

  if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        results.push(...deepFind<T>(item, predicate, depth + 1));
      }
    } else {
      const record = obj as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (predicate(key, value)) {
          results.push(value as T);
        }
        results.push(...deepFind<T>(value, predicate, depth + 1));
      }
    }
  }

  return results;
}

function findDramaArrays(data: unknown): DramaCard[][] {
  return deepFind<DramaCard[]>(data, (key, value) => {
    if (!Array.isArray(value) || value.length === 0) return false;
    if (typeof value[0] !== 'object' || value[0] === null) return false;
    const keys = Object.keys(value[0]);
    const indicators = ['title', 'name', 'cover', 'image', 'poster', 'id', 'coverUrl', 'drama_name'];
    return indicators.filter((k) => keys.includes(k)).length >= 2;
  });
}

// ─── HTML Parsers ───────────────────────

function parseDramaCardsFromHTML($: cheerio.CheerioAPI): DramaCard[] {
  const cards: DramaCard[] = [];
  const seen = new Set<string>();

  for (const selector of SELECTORS.DRAMA_CARDS) {
    const els = $(selector);
    if (els.length < 2) continue;

    els.each((_, el) => {
      const $el = $(el);
      const $link = $el.is('a') ? $el : $el.find('a').first();
      const href = $link.attr('href') || '';

      if (!href || seen.has(href)) return;

      const fullUrl = href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`;

      // Check if URL looks like a drama page
      const isDramaUrl = SELECTORS.DRAMA_URL_PATTERNS.some((p) => p.test(href));
      if (!isDramaUrl && !href.includes('/id/')) return;

      const $img = $el.find('img').first();
      const title =
        $img.attr('alt') ||
        $el.find('[class*="title"], [class*="name"], h2, h3, h4').first().text().trim() ||
        $el.text().trim().split('\n')[0]?.trim() ||
        '';

      if (!title) return;

      const coverImage =
        $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || '';

      // Extract slug from URL
      const slugMatch = href.match(/\/([^/]+)\/?$/);
      const slug = slugMatch?.[1] || '';

      const card: DramaCard = {
        id: slug || Buffer.from(fullUrl).toString('base64url').slice(0, 16),
        slug,
        title,
        coverImage,
        url: fullUrl,
      };

      // Try extract episode count
      const epText = $el.text().match(/(\d+)\s*(?:ep|episode|集)/i);
      if (epText) card.totalEpisodes = parseInt(epText[1]);

      // Try extract rating
      const ratingText = $el.find('[class*="rating"], [class*="score"]').text();
      const ratingMatch = ratingText.match(/([\d.]+)/);
      if (ratingMatch) card.rating = parseFloat(ratingMatch[1]);

      seen.add(href);
      cards.push(card);
    });

    if (cards.length > 0) break;
  }

  return cards;
}

function parseSectionsFromHTML($: cheerio.CheerioAPI): HomeSection[] {
  const sections: HomeSection[] = [];

  for (const selector of SELECTORS.SECTIONS) {
    $(selector).each((_, el) => {
      const $section = $(el);
      const title =
        $section.find('h2, h3, [class*="title"]').first().text().trim();

      if (!title) return;

      const dramas: DramaCard[] = [];
      $section.find('a[href]').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        const isDramaUrl = SELECTORS.DRAMA_URL_PATTERNS.some((p) => p.test(href));

        if (!isDramaUrl) return;

        const $img = $a.find('img').first();
        const cardTitle = $img.attr('alt') || $a.text().trim().split('\n')[0]?.trim() || '';

        if (!cardTitle) return;

        const slugMatch = href.match(/\/([^/]+)\/?$/);
        dramas.push({
          id: slugMatch?.[1] || '',
          slug: slugMatch?.[1] || '',
          title: cardTitle,
          coverImage: $img.attr('src') || $img.attr('data-src') || '',
          url: href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`,
        });
      });

      if (dramas.length > 0) {
        sections.push({
          title,
          type: 'horizontal',
          dramas,
        });
      }
    });

    if (sections.length > 0) break;
  }

  return sections;
}

function parseEpisodesFromHTML($: cheerio.CheerioAPI): Episode[] {
  const episodes: Episode[] = [];

  for (const selector of SELECTORS.EPISODE_LIST) {
    const container = $(selector).first();
    if (!container.length) continue;

    container.find('a[href], button, [role="button"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();
      const numMatch = text.match(/\d+/);

      episodes.push({
        number: numMatch ? parseInt(numMatch[0]) : i + 1,
        title: text || `Episode ${i + 1}`,
        url: href.startsWith('http') ? href : href ? `${CONFIG.BASE_URL}${href}` : '',
        isFree: !$el.find('[class*="vip"], [class*="lock"], [class*="coin"]').length,
        isVip: !!$el.find('[class*="vip"], [class*="lock"]').length,
        thumbnail: $el.find('img').attr('src') || '',
        duration: $el.find('[class*="duration"], [class*="time"]').text().trim() || undefined,
      });
    });

    if (episodes.length > 0) break;
  }

  // Fallback: cari semua link yang mengandung angka episode
  if (episodes.length === 0) {
    $('a[href]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();

      if (/(?:episode|ep\.?\s*)\d+/i.test(text) || /\/ep(?:isode)?\/?\d+/i.test(href)) {
        const numMatch = text.match(/\d+/) || href.match(/(\d+)\/?$/);
        episodes.push({
          number: numMatch ? parseInt(numMatch[0] || numMatch[1]) : i + 1,
          title: text || `Episode ${i + 1}`,
          url: href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`,
          isFree: true,
          isVip: false,
        });
      }
    });
  }

  return episodes;
}

function parseDramaDetailFromHTML($: cheerio.CheerioAPI): Partial<DramaDetail> {
  const detail: Partial<DramaDetail> = {};

  // Title
  detail.title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim();

  // Cover image
  detail.coverImage =
    $('meta[property="og:image"]').attr('content') ||
    $('[class*="cover"] img, [class*="poster"] img, [class*="banner"] img')
      .first()
      .attr('src') ||
    '';

  // Description
  detail.description =
    $('[class*="desc"], [class*="synopsis"], [class*="summary"], [class*="intro"]')
      .first()
      .text()
      .trim() ||
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  // Genre / Tags
  const genreEls = $('[class*="genre"] a, [class*="tag"] a, [class*="category"] a');
  detail.genre = [];
  detail.tags = [];
  genreEls.each((_, el) => {
    const text = $(el).text().trim();
    if (text) detail.tags!.push(text);
  });

  // Rating
  const ratingText = $('[class*="rating"], [class*="score"]').first().text();
  const ratingMatch = ratingText.match(/([\d.]+)/);
  if (ratingMatch) detail.rating = parseFloat(ratingMatch[1]);

  // Views
  detail.views =
    $('[class*="view"], [class*="play-count"]').first().text().trim() || '';

  // Status
  const statusText = $('[class*="status"]').first().text().toLowerCase();
  if (statusText.includes('completed') || statusText.includes('tamat') || statusText.includes('selesai')) {
    detail.status = 'completed';
  } else if (statusText.includes('ongoing') || statusText.includes('berlangsung')) {
    detail.status = 'ongoing';
  } else {
    detail.status = 'unknown';
  }

  // Episodes
  detail.episodes = parseEpisodesFromHTML($);

  return detail;
}

// ─── Stream URL Extraction ──────────────

function extractStreamUrls(html: string): string[] {
  const urls: string[] = [];

  // m3u8
  const m3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
  if (m3u8) urls.push(...m3u8);

  // mp4
  const mp4 = html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g);
  if (mp4) urls.push(...mp4);

  // Generic video/play URLs in scripts
  const videoUrls = html.match(
    /(?:playUrl|videoUrl|streamUrl|video_url|play_url|src|source|url)\s*[=:]\s*["'](https?:\/\/[^"']+)["']/gi
  );
  if (videoUrls) {
    for (const match of videoUrls) {
      const urlMatch = match.match(/["'](https?:\/\/[^"']+)["']/);
      if (urlMatch) urls.push(urlMatch[1]);
    }
  }

  return [...new Set(urls)];
}

// ─── API Discovery ─────────────────────

async function tryAPIEndpoints(
  type: keyof typeof CONFIG.API_PATHS,
  params?: Record<string, unknown>
): Promise<{ endpoint: string; data: unknown } | null> {
  const paths = CONFIG.API_PATHS[type];

  for (const path of paths) {
    const url = `${CONFIG.BASE_URL}${path}`;

    // Try GET
    const getData = await fetchJSON(
      params
        ? `${url}?${new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
          )}`
        : url
    );

    if (getData) {
      return { endpoint: `GET ${path}`, data: getData };
    }

    // Try POST
    const postData = await fetchJSON(url, params || { page: 1, pageSize: 20 });
    if (postData) {
      return { endpoint: `POST ${path}`, data: postData };
    }
  }

  return null;
}

// ═════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════

export async function scrapeHome(): Promise<{
  sections: HomeSection[];
  banners: Banner[];
  categories: Category[];
  allDramas: DramaCard[];
  rawSource: string;
}> {
  const html = await fetchPage(CONFIG.HOME_URL);
  const $ = cheerio.load(html);
  const pageData = extractPageData(html);

  let allDramas: DramaCard[] = [];
  let sections: HomeSection[] = [];
  let banners: Banner[] = [];
  const categories: Category[] = [];

  // Strategy 1: Parse from Next.js / Nuxt data
  const ssrData = pageData.nextData || pageData.nuxtData;
  if (ssrData) {
    const dramaArrays = findDramaArrays(ssrData);
    for (const arr of dramaArrays) {
      const mapped = arr.map((item: Record<string, unknown>) => ({
        id: String(item.id || item.drama_id || item.videoId || ''),
        slug: String(item.slug || item.id || item.drama_id || ''),
        title: String(item.title || item.name || item.drama_name || ''),
        coverImage: String(item.cover || item.coverUrl || item.image || item.poster || item.cover_url || ''),
        url: String(
          item.url || item.detailUrl || item.shareUrl ||
          `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`
        ),
        totalEpisodes: Number(item.totalEpisodes || item.episodeCount || item.episode_count || 0),
        rating: Number(item.rating || item.score || 0),
        genre: String(item.genre || item.category || item.categoryName || ''),
      }));

      allDramas.push(...mapped);
    }

    // Extract sections from pageProps
    const props = pageData.nextData?.props?.pageProps || pageData.nuxtData;
    if (props && typeof props === 'object') {
      const propsRecord = props as Record<string, unknown>;
      for (const [key, value] of Object.entries(propsRecord)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          const firstKeys = Object.keys(value[0] as Record<string, unknown>);
          const isDrama = ['title', 'name', 'cover', 'id'].some((k) => firstKeys.includes(k));
          if (isDrama) {
            sections.push({
              title: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
              type: 'list',
              dramas: value.map((item: Record<string, unknown>) => ({
                id: String(item.id || ''),
                slug: String(item.slug || item.id || ''),
                title: String(item.title || item.name || ''),
                coverImage: String(item.cover || item.coverUrl || item.image || ''),
                url: `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`,
              })),
            });
          }
        }
      }
    }
  }

  // Strategy 2: Parse from inline JSON data
  if (pageData.inlineData) {
    for (const data of pageData.inlineData) {
      const arrays = findDramaArrays(data);
      for (const arr of arrays) {
        allDramas.push(
          ...arr.map((item: Record<string, unknown>) => ({
            id: String(item.id || ''),
            slug: String(item.slug || item.id || ''),
            title: String(item.title || item.name || ''),
            coverImage: String(item.cover || item.image || ''),
            url: `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`,
          }))
        );
      }
    }
  }

  // Strategy 3: Try API endpoints directly
  const apiResult = await tryAPIEndpoints('HOME');
  if (apiResult) {
    const arrays = findDramaArrays(apiResult.data);
    for (const arr of arrays) {
      allDramas.push(
        ...arr.map((item: Record<string, unknown>) => ({
          id: String(item.id || ''),
          slug: String(item.slug || item.id || ''),
          title: String(item.title || item.name || ''),
          coverImage: String(item.cover || item.image || ''),
          url: `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`,
        }))
      );
    }
  }

  // Strategy 4: Parse HTML directly
  const htmlDramas = parseDramaCardsFromHTML($);
  allDramas.push(...htmlDramas);

  if (sections.length === 0) {
    sections = parseSectionsFromHTML($);
  }

  // Parse banners
  $('[class*="banner"] a, [class*="swiper-slide"] a, [class*="carousel"] a').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const $img = $el.find('img').first();
    if ($img.length && href) {
      banners.push({
        id: String(banners.length),
        title: $img.attr('alt') || '',
        image: $img.attr('src') || $img.attr('data-src') || '',
        url: href.startsWith('http') ? href : `${CONFIG.BASE_URL}${href}`,
      });
    }
  });

  // Parse categories
  $('a[href*="category"], a[href*="genre"], [class*="category"] a, [class*="genre"] a, [class*="tag"] a').each(
    (_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const href = $el.attr('href') || '';
      if (text && href) {
        const slugMatch = href.match(/\/([^/]+)\/?$/);
        categories.push({
          id: slugMatch?.[1] || String(categories.length),
          name: text,
          slug: slugMatch?.[1] || text.toLowerCase().replace(/\s+/g, '-'),
        });
      }
    }
  );

  // Deduplicate dramas
  const seen = new Set<string>();
  allDramas = allDramas.filter((d) => {
    const key = d.title + d.url;
    if (seen.has(key) || !d.title) return false;
    seen.add(key);
    return true;
  });

  return {
    sections,
    banners,
    categories,
    allDramas,
    rawSource: ssrData ? 'ssr_data' : apiResult ? 'api' : 'html',
  };
}

export async function scrapeDramas(
  page = 1,
  category?: string
): Promise<{ dramas: DramaCard[]; hasMore: boolean; source: string }> {
  // Try API first
  const params: Record<string, unknown> = { page, pageSize: 20, size: 20 };
  if (category) params.category = category;

  for (const type of ['DRAMA_LIST', 'HOME'] as const) {
    const result = await tryAPIEndpoints(type, params);
    if (result) {
      const arrays = findDramaArrays(result.data);
      if (arrays.length > 0) {
        const dramas = arrays[0].map((item: Record<string, unknown>) => ({
          id: String(item.id || ''),
          slug: String(item.slug || item.id || ''),
          title: String(item.title || item.name || ''),
          coverImage: String(item.cover || item.coverUrl || item.image || ''),
          url: `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`,
          totalEpisodes: Number(item.totalEpisodes || item.episodeCount || 0),
          rating: Number(item.rating || item.score || 0),
          genre: String(item.genre || item.category || ''),
        }));

        return { dramas, hasMore: dramas.length >= 20, source: result.endpoint };
      }
    }
  }

  // Fallback to homepage
  const homeData = await scrapeHome();
  return {
    dramas: homeData.allDramas,
    hasMore: false,
    source: 'homepage_html',
  };
}

export async function scrapeDramaDetail(slugOrUrl: string): Promise<DramaDetail | null> {
  const url = slugOrUrl.startsWith('http')
    ? slugOrUrl
    : `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${slugOrUrl}`;

  // Try API
  for (const path of CONFIG.API_PATHS.DRAMA_DETAIL) {
    const apiUrl = `${CONFIG.BASE_URL}${path}`;
    const id = slugOrUrl.replace(/^.*\//, '');

    for (const params of [{ id }, { dramaId: id }, { slug: id }, { videoId: id }]) {
      const data = await fetchJSON(apiUrl, params);
      if (data) {
        // Parse API response
        const obj = data as Record<string, unknown>;
        const detail = (obj.data || obj.result || obj) as Record<string, unknown>;

        const drama: DramaDetail = {
          id: String(detail.id || id),
          slug: String(detail.slug || id),
          title: String(detail.title || detail.name || ''),
          originalTitle: String(detail.originalTitle || detail.original_title || ''),
          url,
          coverImage: String(detail.cover || detail.coverUrl || detail.image || detail.poster || ''),
          description: String(detail.description || detail.desc || detail.synopsis || ''),
          genre: Array.isArray(detail.genre) ? detail.genre.map(String) : [String(detail.genre || detail.category || '')],
          tags: Array.isArray(detail.tags) ? detail.tags.map(String) : [],
          totalEpisodes: Number(detail.totalEpisodes || detail.episodeCount || 0),
          rating: Number(detail.rating || detail.score || 0),
          views: String(detail.views || detail.playCount || ''),
          status: String(detail.status || 'unknown') as DramaDetail['status'],
          language: String(detail.language || detail.lang || ''),
          year: String(detail.year || ''),
          episodes: [],
        };

        // Parse episodes from API response
        const epArrays = deepFind<unknown[]>(detail, (key) =>
          ['episodes', 'episodeList', 'episode_list', 'videoList', 'playlist'].includes(key)
        );

        for (const epArr of epArrays) {
          if (Array.isArray(epArr)) {
            drama.episodes = epArr.map((ep: Record<string, unknown>, i: number) => ({
              number: Number(ep.number || ep.episode || ep.sort || ep.ep || i + 1),
              title: String(ep.title || ep.name || `Episode ${i + 1}`),
              url: String(ep.url || ep.detailUrl || ep.playUrl || ''),
              streamUrl: String(ep.streamUrl || ep.videoUrl || ep.playUrl || ep.video_url || ''),
              thumbnail: String(ep.thumbnail || ep.cover || ep.image || ''),
              duration: String(ep.duration || ''),
              isFree: Boolean(ep.isFree ?? ep.free ?? true),
              isVip: Boolean(ep.isVip || ep.vip || ep.locked || false),
            }));
            break;
          }
        }

        if (drama.title) return drama;
      }
    }
  }

  // Fallback: Scrape HTML
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const pageData = extractPageData(html);

  // From SSR data
  if (pageData.nextData || pageData.nuxtData) {
    const ssrData = pageData.nextData?.props?.pageProps || pageData.nuxtData;
    if (ssrData && typeof ssrData === 'object') {
      const record = ssrData as Record<string, unknown>;
      const dramaInfo = (record.dramaDetail || record.drama || record.detail ||
        record.videoDetail || record.data || record.seriesDetail || record) as Record<string, unknown>;

      if (dramaInfo && (dramaInfo.title || dramaInfo.name)) {
        const drama: DramaDetail = {
          id: String(dramaInfo.id || ''),
          slug: slugOrUrl.replace(/^.*\//, ''),
          title: String(dramaInfo.title || dramaInfo.name || ''),
          originalTitle: String(dramaInfo.originalTitle || ''),
          url,
          coverImage: String(dramaInfo.cover || dramaInfo.coverUrl || dramaInfo.image || ''),
          description: String(dramaInfo.description || dramaInfo.desc || ''),
          genre: [],
          tags: [],
          totalEpisodes: Number(dramaInfo.totalEpisodes || dramaInfo.episodeCount || 0),
          rating: Number(dramaInfo.rating || dramaInfo.score || 0),
          views: String(dramaInfo.views || dramaInfo.playCount || ''),
          status: 'unknown',
          language: String(dramaInfo.language || ''),
          year: String(dramaInfo.year || ''),
          episodes: [],
        };

        // Episodes from SSR
        const epArrays = findDramaArrays(dramaInfo);
        // Also find direct episode arrays
        const directEps = deepFind<unknown[]>(dramaInfo, (key) =>
          ['episodes', 'episodeList', 'videoList', 'playlist'].includes(key)
        );

        for (const arr of directEps) {
          if (Array.isArray(arr)) {
            drama.episodes = arr.map((ep: Record<string, unknown>, i: number) => ({
              number: Number(ep.number || ep.episode || ep.sort || i + 1),
              title: String(ep.title || ep.name || `Episode ${i + 1}`),
              url: String(ep.url || ep.detailUrl || ''),
              streamUrl: String(ep.streamUrl || ep.videoUrl || ep.playUrl || ''),
              thumbnail: String(ep.thumbnail || ep.cover || ''),
              duration: String(ep.duration || ''),
              isFree: Boolean(ep.isFree ?? true),
              isVip: Boolean(ep.isVip || ep.vip || false),
            }));
            break;
          }
        }

        return drama;
      }
    }
  }

  // Pure HTML parsing
  const htmlDetail = parseDramaDetailFromHTML($);

  const slugPart = slugOrUrl.replace(/^.*\//, '');
  return {
    id: slugPart,
    slug: slugPart,
    title: htmlDetail.title || '',
    url,
    coverImage: htmlDetail.coverImage || '',
    description: htmlDetail.description || '',
    genre: htmlDetail.genre || [],
    tags: htmlDetail.tags || [],
    totalEpisodes: htmlDetail.episodes?.length || 0,
    rating: htmlDetail.rating || 0,
    views: htmlDetail.views || '',
    status: htmlDetail.status || 'unknown',
    language: htmlDetail.language || '',
    year: htmlDetail.year || '',
    episodes: htmlDetail.episodes || [],
  };
}

export async function scrapeStreamUrl(episodeUrl: string): Promise<string[]> {
  const html = await fetchPage(episodeUrl);
  const urls = extractStreamUrls(html);

  // Also check SSR data
  const pageData = extractPageData(html);
  const ssrData = pageData.nextData || pageData.nuxtData;

  if (ssrData) {
    const streamUrls = deepFind<string>(ssrData, (key, value) => {
      if (typeof value !== 'string') return false;
      return (
        ['playUrl', 'videoUrl', 'streamUrl', 'video_url', 'play_url', 'url', 'src'].includes(key) &&
        (value.includes('.m3u8') || value.includes('.mp4') || value.includes('video') || value.includes('stream'))
      );
    });
    urls.push(...streamUrls);
  }

  // Try API
  const $ = cheerio.load(html);
  const videoId = episodeUrl.match(/\/([^/]+)\/?$/)?.[1] || '';

  for (const path of CONFIG.API_PATHS.STREAM) {
    const apiUrl = `${CONFIG.BASE_URL}${path}`;
    for (const params of [
      { id: videoId },
      { episodeId: videoId },
      { videoId },
      { vid: videoId },
    ]) {
      const data = await fetchJSON(apiUrl, params);
      if (data) {
        const streamUrls = deepFind<string>(data, (key, value) => {
          return (
            typeof value === 'string' &&
            (value.includes('.m3u8') || value.includes('.mp4'))
          );
        });
        urls.push(...streamUrls);
      }
    }
  }

  return [...new Set(urls)];
}

export async function scrapeSearch(query: string, page = 1): Promise<SearchResult> {
  // Try search API
  for (const path of CONFIG.API_PATHS.SEARCH) {
    const url = `${CONFIG.BASE_URL}${path}`;

    for (const params of [
      { keyword: query, page, pageSize: 20 },
      { q: query, page, size: 20 },
      { search: query, page },
      { query, page },
    ]) {
      const data = await fetchJSON(url, params);
      if (data) {
        const arrays = findDramaArrays(data);
        if (arrays.length > 0) {
          return {
            query,
            total: arrays[0].length,
            page,
            dramas: arrays[0].map((item: Record<string, unknown>) => ({
              id: String(item.id || ''),
              slug: String(item.slug || item.id || ''),
              title: String(item.title || item.name || ''),
              coverImage: String(item.cover || item.image || ''),
              url: `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`,
            })),
          };
        }
      }

      // Try GET too
      const getUrl = `${url}?${new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      )}`;
      const getData = await fetchJSON(getUrl);
      if (getData) {
        const arrays = findDramaArrays(getData);
        if (arrays.length > 0) {
          return {
            query,
            total: arrays[0].length,
            page,
            dramas: arrays[0].map((item: Record<string, unknown>) => ({
              id: String(item.id || ''),
              slug: String(item.slug || item.id || ''),
              title: String(item.title || item.name || ''),
              coverImage: String(item.cover || item.image || ''),
              url: `${CONFIG.BASE_URL}/${CONFIG.LANG}/drama/${item.id || item.slug || ''}`,
            })),
          };
        }
      }
    }
  }

  // Fallback: scrape search page HTML
  const searchUrls = [
    `${CONFIG.BASE_URL}/${CONFIG.LANG}/search?q=${encodeURIComponent(query)}`,
    `${CONFIG.BASE_URL}/search?keyword=${encodeURIComponent(query)}`,
    `${CONFIG.BASE_URL}/${CONFIG.LANG}/search/${encodeURIComponent(query)}`,
  ];

  for (const searchUrl of searchUrls) {
    try {
      const html = await fetchPage(searchUrl);
      const $ = cheerio.load(html);
      const dramas = parseDramaCardsFromHTML($);

      if (dramas.length > 0) {
        return { query, total: dramas.length, page, dramas };
      }
    } catch {
      continue;
    }
  }

  return { query, total: 0, page, dramas: [] };
}

// Debug: discover all endpoints
export async function discoverEndpoints(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  for (const [type, paths] of Object.entries(CONFIG.API_PATHS)) {
    results[type] = {};
    for (const path of paths) {
      const url = `${CONFIG.BASE_URL}${path}`;

      // GET
      const getRes = await fetchJSON(url);
      if (getRes) {
        (results[type] as Record<string, unknown>)[`GET ${path}`] = {
          success: true,
          sample: JSON.stringify(getRes).slice(0, 300),
        };
      }

      // POST
      const postRes = await fetchJSON(url, { page: 1, pageSize: 20 });
      if (postRes) {
        (results[type] as Record<string, unknown>)[`POST ${path}`] = {
          success: true,
          sample: JSON.stringify(postRes).slice(0, 300),
        };
      }
    }
  }

  return results;
}
