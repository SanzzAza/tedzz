import * as cheerio from 'cheerio'
import type { DramaCard, DramaDetail, Episode, HomeData, StreamInfo } from './types'

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const BASE = process.env.GOODSHORT_BASE || 'https://www.goodshort.com'
const LANG = process.env.LANG_CODE || 'id'
const HOME = `${BASE}/${LANG}`

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.7',
  'Referer': HOME,
}

const API_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9',
  'Referer': HOME,
  'Origin': BASE,
}

// ═══════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════

async function get(url: string): Promise<string> {
  const r = await fetch(url, { headers: HEADERS, next: { revalidate: 300 } })
  if (!r.ok) throw new Error(`HTTP ${r.status} → ${url}`)
  return r.text()
}

async function api<T = unknown>(url: string, body?: unknown): Promise<T | null> {
  try {
    const opts: RequestInit = { headers: API_HEADERS }
    if (body) {
      opts.method = 'POST'
      opts.body = JSON.stringify(body)
      ;(opts.headers as Record<string, string>)['Content-Type'] = 'application/json'
    }
    const r = await fetch(url, opts)
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('json')) return null
    return r.json() as Promise<T>
  } catch { return null }
}

function abs(href: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return 'https:' + href
  return BASE + (href.startsWith('/') ? '' : '/') + href
}

function slug(url: string): string {
  return url.replace(/\/$/, '').split('/').pop() || ''
}

// ═══════════════════════════════════════════
// DEEP DATA EXTRACTION
// ═══════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepSearch(obj: any, test: (k: string, v: unknown) => boolean, depth = 0): unknown[] {
  const out: unknown[] = []
  if (depth > 15 || !obj) return out
  if (Array.isArray(obj)) {
    for (const item of obj) out.push(...deepSearch(item, test, depth + 1))
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (test(k, v)) out.push(v)
      out.push(...deepSearch(v, test, depth + 1))
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDramaArrays(data: any): any[][] {
  return deepSearch(data, (_k, v) => {
    if (!Array.isArray(v) || v.length === 0 || typeof v[0] !== 'object') return false
    const keys = Object.keys(v[0])
    const hits = ['title', 'name', 'cover', 'image', 'poster', 'coverUrl', 'id', 'drama_id', 'video_id'].filter(x => keys.includes(x))
    return hits.length >= 2
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[][]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findEpisodeArrays(data: any): any[][] {
  return deepSearch(data, (k, v) => {
    return ['episodes', 'episodeList', 'episode_list', 'videoList', 'video_list', 'playlist', 'chapterList'].includes(k)
      && Array.isArray(v) && v.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[][]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findStreamUrls(data: any): string[] {
  const urls = deepSearch(data, (k, v) => {
    if (typeof v !== 'string') return false
    const isKey = ['playUrl', 'videoUrl', 'streamUrl', 'video_url', 'play_url', 'hls_url', 'mp4_url', 'url', 'src', 'source'].includes(k)
    const isMedia = /\.(m3u8|mp4|ts)/.test(v) || /video|stream|play|media|cdn/.test(v)
    return isKey && isMedia
  }) as string[]
  return [...new Set(urls)]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCard(item: any): DramaCard {
  const id = String(item.id || item.drama_id || item.videoId || item.video_id || item.sid || '')
  const title = String(item.title || item.name || item.drama_name || item.videoName || '')
  const cover = String(item.cover || item.coverUrl || item.cover_url || item.image || item.poster || item.img || item.pic || '')
  const dramaSlug = String(item.slug || item.id || item.drama_id || '')
  const dramaUrl = String(item.url || item.detailUrl || item.detail_url || item.shareUrl || '')

  return {
    id,
    slug: dramaSlug,
    title,
    cover: abs(cover),
    url: dramaUrl ? abs(dramaUrl) : `${HOME}/drama/${dramaSlug || id}`,
    episodes: Number(item.totalEpisodes || item.episodeCount || item.episode_count || item.total_episodes || item.episodeTotal || 0),
    rating: Number(item.rating || item.score || 0),
    genre: String(item.genre || item.category || item.categoryName || item.tag || ''),
    views: String(item.views || item.playCount || item.play_count || item.viewCount || ''),
    status: String(item.status || ''),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEpisode(item: any, i: number): Episode {
  return {
    number: Number(item.number || item.episode || item.ep || item.sort || item.index || item.order || i + 1),
    title: String(item.title || item.name || item.episodeName || `Episode ${i + 1}`),
    url: abs(String(item.url || item.detailUrl || item.detail_url || item.pageUrl || '')),
    streamUrl: String(item.streamUrl || item.videoUrl || item.playUrl || item.video_url || item.play_url || item.hls || item.mp4 || ''),
    thumbnail: abs(String(item.thumbnail || item.cover || item.image || item.thumb || '')),
    duration: String(item.duration || item.time || ''),
    isFree: item.isFree !== undefined ? Boolean(item.isFree) : item.free !== undefined ? Boolean(item.free) : !item.isVip && !item.vip && !item.locked,
    isVip: Boolean(item.isVip || item.vip || item.locked || item.is_vip || false),
  }
}

// ═══════════════════════════════════════════
// SSR DATA EXTRACTION (Next.js / Nuxt)
// ═══════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSSR(html: string): { type: string; data: any; buildId?: string } | null {
  const $ = cheerio.load(html)

  // Next.js
  const nextScript = $('#__NEXT_DATA__').html()
  if (nextScript) {
    try {
      const d = JSON.parse(nextScript)
      return { type: 'nextjs', data: d, buildId: d.buildId }
    } catch { /* skip */ }
  }

  // Nuxt.js
  let nuxtData = null
  $('script').each((_, el) => {
    const txt = $(el).html() || ''
    const m = txt.match(/window\.__NUXT__\s*=\s*(.+?);\s*$/s)
    if (m) { try { nuxtData = JSON.parse(m[1]) } catch { /* skip */ } }
  })
  if (nuxtData) return { type: 'nuxtjs', data: nuxtData }

  // Generic window.__DATA__
  $('script').each((_, el) => {
    const txt = $(el).html() || ''
    const patterns = [
      /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
      /window\.__DATA__\s*=\s*({.+?});/s,
      /window\.__PRELOADED_STATE__\s*=\s*({.+?});/s,
      /window\.pageData\s*=\s*({.+?});/s,
    ]
    for (const p of patterns) {
      const m = txt.match(p)
      if (m) {
        try {
          nuxtData = JSON.parse(m[1])
          return false // break each
        } catch { /* skip */ }
      }
    }
  })
  if (nuxtData) return { type: 'inline', data: nuxtData }

  return null
}

// ═══════════════════════════════════════════
// HTML PARSERS
// ═══════════════════════════════════════════

function parseDramaCards($: cheerio.CheerioAPI): DramaCard[] {
  const cards: DramaCard[] = []
  const seen = new Set<string>()

  // Collect all <a> with images that link to drama-like URLs
  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''

    // Must look like a drama URL
    if (!/\/(drama|detail|series|video|play|short|watch|id)\//i.test(href)) return
    // Skip static/nav links
    if (/\/(login|register|about|help|faq|terms|privacy|download)/i.test(href)) return

    const fullUrl = abs(href)
    if (seen.has(fullUrl)) return

    const $img = $a.find('img').first()
    const title = (
      $img.attr('alt') ||
      $a.find('[class*="title"], [class*="name"], h2, h3, h4, p').first().text().trim() ||
      $a.attr('title') ||
      ''
    ).trim()

    if (!title || title.length < 2) return

    const cover = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || ''

    seen.add(fullUrl)
    cards.push({
      id: slug(href),
      slug: slug(href),
      title,
      cover: abs(cover),
      url: fullUrl,
    })
  })

  return cards
}

function parseEpisodesHTML($: cheerio.CheerioAPI): Episode[] {
  const eps: Episode[] = []

  // Strategy 1: episode containers
  const containerSels = [
    '[class*="episode"]', '[class*="ep-list"]', '[class*="playlist"]',
    '[class*="video-list"]', '[class*="chapter"]',
  ]

  for (const sel of containerSels) {
    const $c = $(sel).first()
    if (!$c.length) continue

    $c.find('a[href], button, [role="button"], li').each((i, el) => {
      const $el = $(el)
      const href = $el.closest('a').attr('href') || $el.attr('href') || ''
      const text = $el.text().trim()
      const num = text.match(/\d+/)

      eps.push({
        number: num ? parseInt(num[0]) : i + 1,
        title: text || `Episode ${i + 1}`,
        url: abs(href),
        streamUrl: '',
        thumbnail: abs($el.find('img').attr('src') || ''),
        duration: $el.find('[class*="duration"], [class*="time"]').text().trim(),
        isFree: !$el.find('[class*="vip"], [class*="lock"], [class*="coin"]').length,
        isVip: !!$el.find('[class*="vip"], [class*="lock"]').length,
      })
    })

    if (eps.length > 0) break
  }

  return eps
}

function parseDetailHTML($: cheerio.CheerioAPI): Partial<DramaDetail> {
  return {
    title: $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim() || '',

    cover: abs(
      $('meta[property="og:image"]').attr('content') ||
      $('[class*="cover"] img, [class*="poster"] img').first().attr('src') || ''
    ),

    description:
      $('[class*="desc"], [class*="synopsis"], [class*="summary"], [class*="intro"]').first().text().trim() ||
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') || '',

    genre: $('[class*="genre"] a, [class*="tag"] a, [class*="category"] a')
      .map((_, el) => $(el).text().trim()).get().filter(Boolean),

    rating: parseFloat($('[class*="rating"], [class*="score"]').first().text().match(/([\d.]+)/)?.[1] || '0'),

    views: $('[class*="view"], [class*="play-count"]').first().text().trim(),

    episodes: parseEpisodesHTML($),
  }
}

function extractStreamFromHTML(html: string): string[] {
  const urls: string[] = []

  // m3u8 & mp4 URLs
  const m3u8 = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)
  if (m3u8) urls.push(...m3u8)

  const mp4 = html.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/g)
  if (mp4) urls.push(...mp4)

  // Key-value patterns in JS
  const kvPatterns = /(?:playUrl|videoUrl|streamUrl|video_url|play_url|hls_url|mp4_url|src|source|url)\s*[=:]\s*["'](https?:\/\/[^"']+)["']/gi
  let m
  while ((m = kvPatterns.exec(html)) !== null) {
    if (/\.(m3u8|mp4|ts)|video|stream|play|media|cdn/i.test(m[1])) {
      urls.push(m[1])
    }
  }

  return [...new Set(urls)]
}

// ═══════════════════════════════════════════
// API ENDPOINT DISCOVERY
// ═══════════════════════════════════════════

const API_PATHS = {
  HOME: ['/api/home', '/api/home/data', '/api/home/index', '/api/index', '/api/init', '/api/app/config', '/api/v1/home', '/api/v2/home'],
  LIST: ['/api/drama/list', '/api/v1/drama/list', '/api/video/list', '/api/v1/video/list', '/api/short/list', '/api/series/list', '/api/v1/series', '/api/home/recommend'],
  DETAIL: ['/api/drama/detail', '/api/v1/drama/detail', '/api/video/detail', '/api/v1/video/detail', '/api/short/detail', '/api/series/detail'],
  EPISODES: ['/api/drama/episodes', '/api/v1/drama/episodes', '/api/episode/list', '/api/v1/episode/list', '/api/video/episode'],
  STREAM: ['/api/video/play', '/api/v1/video/play', '/api/episode/play', '/api/video/url', '/api/stream/url', '/api/v1/video/url'],
  SEARCH: ['/api/search', '/api/v1/search', '/api/drama/search', '/api/video/search'],
  CATEGORY: ['/api/category/list', '/api/v1/category', '/api/genre/list', '/api/tag/list'],
}

async function tryAPIs(type: keyof typeof API_PATHS, params?: Record<string, unknown>): Promise<{ endpoint: string; data: unknown } | null> {
  for (const path of API_PATHS[type]) {
    const url = `${BASE}${path}`

    // GET
    if (params) {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const d = await api(`${url}?${qs}`)
      if (d) return { endpoint: `GET ${path}?${qs}`, data: d }
    } else {
      const d = await api(url)
      if (d) return { endpoint: `GET ${path}`, data: d }
    }

    // POST
    const pd = await api(url, params || { page: 1, pageSize: 20 })
    if (pd) return { endpoint: `POST ${path}`, data: pd }
  }
  return null
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE HOME
// ═══════════════════════════════════════════

export async function scrapeHome(): Promise<HomeData & { source: string }> {
  const html = await get(HOME)
  const $ = cheerio.load(html)
  const ssr = extractSSR(html)

  let allDramas: DramaCard[] = []
  const sections: HomeData['sections'] = []
  const banners: HomeData['banners'] = []
  const categories: HomeData['categories'] = []
  let source = 'html'

  // ── 1. SSR DATA ──
  if (ssr) {
    source = ssr.type
    const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data

    // Find drama arrays in SSR data
    const arrays = findDramaArrays(root)
    for (const arr of arrays) {
      const mapped = arr.map(normalizeCard).filter(d => d.title)
      if (mapped.length > 0) {
        allDramas.push(...mapped)
      }
    }

    // Build sections from top-level keys
    if (root && typeof root === 'object') {
      for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          const firstKeys = value[0] ? Object.keys(value[0] as Record<string, unknown>) : []
          if (['title', 'name', 'cover', 'id'].some(k => firstKeys.includes(k))) {
            const mapped = value.map(normalizeCard).filter(d => d.title)
            if (mapped.length > 0) {
              sections.push({
                title: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
                dramas: mapped,
              })
            }
          }
        }

        // Sections wrapped in { title, list } objects
        if (Array.isArray(value)) {
          for (const section of value) {
            if (section && typeof section === 'object' && 'title' in section) {
              const sec = section as Record<string, unknown>
              const listKey = Object.keys(sec).find(k => Array.isArray(sec[k]) && (sec[k] as unknown[]).length > 0)
              if (listKey) {
                const mapped = (sec[listKey] as unknown[]).map(normalizeCard).filter(d => d.title)
                if (mapped.length > 0) {
                  sections.push({ title: String(sec.title || key), dramas: mapped })
                }
              }
            }
          }
        }
      }
    }

    // Next.js data routes
    if (ssr.buildId) {
      const nextPaths = [
        `/_next/data/${ssr.buildId}/${LANG}.json`,
        `/_next/data/${ssr.buildId}/index.json`,
        `/_next/data/${ssr.buildId}/${LANG}/index.json`,
      ]
      for (const p of nextPaths) {
        const d = await api(`${BASE}${p}`)
        if (d) {
          const arrs = findDramaArrays(d)
          for (const arr of arrs) allDramas.push(...arr.map(normalizeCard).filter(x => x.title))
          source = 'nextjs_data_route'
          break
        }
      }
    }
  }

  // ── 2. API ENDPOINTS ──
  if (allDramas.length === 0) {
    const apiResult = await tryAPIs('HOME')
    if (apiResult) {
      source = apiResult.endpoint
      const arrs = findDramaArrays(apiResult.data)
      for (const arr of arrs) allDramas.push(...arr.map(normalizeCard).filter(x => x.title))
    }

    const listResult = await tryAPIs('LIST', { page: 1, pageSize: 30 })
    if (listResult) {
      if (!source.includes('api')) source = listResult.endpoint
      const arrs = findDramaArrays(listResult.data)
      for (const arr of arrs) allDramas.push(...arr.map(normalizeCard).filter(x => x.title))
    }
  }

  // ── 3. HTML FALLBACK ──
  const htmlCards = parseDramaCards($)
  allDramas.push(...htmlCards)

  // Parse banners
  $('[class*="banner"] a, [class*="swiper"] a, [class*="carousel"] a, [class*="slider"] a').each((_, el) => {
    const $a = $(el)
    const $img = $a.find('img').first()
    const href = $a.attr('href')
    if ($img.length && href) {
      banners.push({
        title: $img.attr('alt') || '',
        image: abs($img.attr('src') || $img.attr('data-src') || ''),
        url: abs(href),
      })
    }
  })

  // Parse categories
  $('a[href*="category"], a[href*="genre"], a[href*="type"], [class*="category"] a, [class*="genre"] a, [class*="filter"] a').each((_, el) => {
    const text = $(el).text().trim()
    const href = $(el).attr('href') || ''
    if (text && text.length < 30 && href) {
      categories.push({ name: text, slug: slug(href) || text.toLowerCase().replace(/\s+/g, '-') })
    }
  })

  // Build sections from HTML if empty
  if (sections.length === 0) {
    $('section, [class*="section"], [class*="module"], [class*="block"]').each((_, el) => {
      const $s = $(el)
      const title = $s.find('h2, h3, [class*="title"]').first().text().trim()
      if (!title) return

      const dramas: DramaCard[] = []
      $s.find('a[href]').each((_, a) => {
        const href = $(a).attr('href') || ''
        if (!/\/(drama|detail|series|video|play|short|watch)\//i.test(href)) return
        const $img = $(a).find('img').first()
        const t = ($img.attr('alt') || $(a).text().trim().split('\n')[0]?.trim() || '').trim()
        if (!t) return
        dramas.push({
          id: slug(href), slug: slug(href), title: t,
          cover: abs($img.attr('src') || ''), url: abs(href),
        })
      })
      if (dramas.length > 0) sections.push({ title, dramas })
    })
  }

  // Dedupe
  const seen = new Set<string>()
  allDramas = allDramas.filter(d => {
    const k = d.title + '|' + d.url
    if (seen.has(k) || !d.title) return false
    seen.add(k)
    return true
  })

  return { banners, sections, categories, allDramas, source }
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE DRAMAS (PAGINATED)
// ═══════════════════════════════════════════

export async function scrapeDramas(page = 1, category?: string): Promise<{ dramas: DramaCard[]; hasMore: boolean; source: string }> {
  // Try APIs with pagination
  const params: Record<string, unknown> = { page, pageSize: 20, size: 20, limit: 20 }
  if (category) { params.category = category; params.categoryId = category; params.genre = category; params.type = category }

  for (const type of ['LIST', 'HOME'] as const) {
    const r = await tryAPIs(type, params)
    if (r) {
      const arrs = findDramaArrays(r.data)
      if (arrs.length > 0) {
        const dramas = arrs[0].map(normalizeCard).filter(d => d.title)
        return { dramas, hasMore: dramas.length >= 15, source: r.endpoint }
      }
    }
  }

  // Try HTML pagination
  const urls = [
    `${HOME}/drama?page=${page}`,
    `${HOME}/dramas?page=${page}`,
    `${HOME}/explore?page=${page}`,
    `${HOME}/all?page=${page}`,
    `${HOME}/browse?page=${page}`,
    `${HOME}/library?page=${page}`,
  ]

  for (const url of urls) {
    try {
      const html = await get(url)
      const $ = cheerio.load(html)
      const ssr = extractSSR(html)

      let dramas: DramaCard[] = []

      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        const arrs = findDramaArrays(root)
        for (const arr of arrs) dramas.push(...arr.map(normalizeCard).filter(d => d.title))
      }

      if (dramas.length === 0) dramas = parseDramaCards($)

      if (dramas.length > 0) {
        return { dramas, hasMore: dramas.length >= 10, source: url }
      }
    } catch { continue }
  }

  // Fallback: homepage
  const home = await scrapeHome()
  return { dramas: home.allDramas, hasMore: false, source: 'homepage_fallback' }
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE DRAMA DETAIL
// ═══════════════════════════════════════════

export async function scrapeDramaDetail(dramaSlug: string): Promise<DramaDetail | null> {
  // Build possible URLs
  const possibleUrls = [
    `${HOME}/drama/${dramaSlug}`,
    `${HOME}/detail/${dramaSlug}`,
    `${HOME}/series/${dramaSlug}`,
    `${HOME}/video/${dramaSlug}`,
    `${HOME}/short/${dramaSlug}`,
    `${HOME}/${dramaSlug}`,
    `${BASE}/drama/${dramaSlug}`,
    `${BASE}/detail/${dramaSlug}`,
  ]

  // If slug is a full URL
  if (dramaSlug.startsWith('http')) possibleUrls.unshift(dramaSlug)

  // Try API first
  for (const path of API_PATHS.DETAIL) {
    for (const params of [
      { id: dramaSlug }, { dramaId: dramaSlug }, { slug: dramaSlug },
      { videoId: dramaSlug }, { sid: dramaSlug },
    ]) {
      const d = await api(`${BASE}${path}`, params)
      if (d) {
        const obj = (d as Record<string, unknown>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = (obj.data || obj.result || obj) as any

        if (detail && (detail.title || detail.name)) {
          const drama: DramaDetail = {
            ...normalizeCard(detail),
            originalTitle: String(detail.originalTitle || detail.original_title || ''),
            description: String(detail.description || detail.desc || detail.synopsis || detail.intro || ''),
            genre: Array.isArray(detail.genre) ? detail.genre.map(String) : [String(detail.genre || detail.category || '')].filter(Boolean),
            tags: Array.isArray(detail.tags) ? detail.tags.map(String) : [],
            totalEpisodes: Number(detail.totalEpisodes || detail.episodeCount || detail.episode_count || 0),
            language: String(detail.language || detail.lang || ''),
            year: String(detail.year || ''),
            cast: Array.isArray(detail.cast) ? detail.cast.map(String) : [],
            episodes: [],
          }

          // Episodes from same response
          const epArrs = findEpisodeArrays(detail)
          if (epArrs.length > 0) {
            drama.episodes = epArrs[0].map(normalizeEpisode)
          }

          // Or fetch episodes separately
          if (drama.episodes.length === 0) {
            const epsData = await fetchEpisodes(dramaSlug)
            if (epsData.length > 0) drama.episodes = epsData
          }

          drama.totalEpisodes = drama.totalEpisodes || drama.episodes.length
          return drama
        }
      }

      // Also try GET with query
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) {
        // Same parsing as above
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = ((gd as any).data || (gd as any).result || gd) as any
        if (detail?.title || detail?.name) {
          const drama: DramaDetail = {
            ...normalizeCard(detail),
            originalTitle: '', description: String(detail.description || detail.desc || ''),
            genre: [].concat(detail.genre || detail.category || []).map(String).filter(Boolean),
            tags: [], totalEpisodes: 0, language: '', year: '', cast: [],
            episodes: findEpisodeArrays(detail).flatMap(a => a.map(normalizeEpisode)),
          }
          if (drama.episodes.length === 0) drama.episodes = await fetchEpisodes(dramaSlug)
          drama.totalEpisodes = drama.episodes.length
          return drama
        }
      }
    }
  }

  // Try HTML scraping
  for (const url of possibleUrls) {
    try {
      const html = await get(url)
      const $ = cheerio.load(html)
      const ssr = extractSSR(html)

      const drama: DramaDetail = {
        id: dramaSlug, slug: dramaSlug, title: '', originalTitle: '', cover: '',
        url, description: '', genre: [], tags: [], totalEpisodes: 0, rating: 0,
        views: '', status: '', language: '', year: '', cast: [], episodes: [],
      }

      // SSR data
      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data

        // Find the drama detail object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detailCandidates = deepSearch(root, (k) => {
          return ['dramaDetail', 'drama', 'detail', 'videoDetail', 'seriesDetail', 'data', 'info'].includes(k)
        })

        for (const candidate of detailCandidates) {
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = candidate as any
            if (c.title || c.name) {
              Object.assign(drama, normalizeCard(c))
              drama.description = String(c.description || c.desc || c.synopsis || '')
              drama.originalTitle = String(c.originalTitle || c.original_title || '')
              drama.genre = [].concat(c.genre || c.category || []).map(String).filter(Boolean)
              drama.tags = [].concat(c.tags || []).map(String).filter(Boolean)
              drama.language = String(c.language || '')
              drama.year = String(c.year || '')
              drama.cast = [].concat(c.cast || c.actors || []).map(String).filter(Boolean)
              break
            }
          }
        }

        // Episodes from SSR
        const epArrs = findEpisodeArrays(root)
        if (epArrs.length > 0) {
          drama.episodes = epArrs[0].map(normalizeEpisode)
        }
      }

      // HTML fallback
      if (!drama.title) {
        const htmlDetail = parseDetailHTML($)
        drama.title = htmlDetail.title || ''
        drama.cover = htmlDetail.cover || drama.cover
        drama.description = htmlDetail.description || drama.description
        drama.genre = htmlDetail.genre || drama.genre
        drama.rating = htmlDetail.rating || drama.rating
        drama.views = htmlDetail.views || drama.views
      }

      if (drama.episodes.length === 0) {
        drama.episodes = parseEpisodesHTML($)
      }

      // Stream URLs from page HTML
      if (drama.episodes.length === 0) {
        const streams = extractStreamFromHTML(html)
        if (streams.length > 0) {
          drama.episodes = [{ number: 1, title: 'Episode 1', url, streamUrl: streams[0], thumbnail: '', duration: '', isFree: true, isVip: false }]
        }
      }

      // Try fetch episodes via API
      if (drama.episodes.length === 0) {
        drama.episodes = await fetchEpisodes(dramaSlug)
      }

      drama.totalEpisodes = drama.totalEpisodes || drama.episodes.length
      drama.url = url

      if (drama.title) return drama
    } catch { continue }
  }

  return null
}

// ═══════════════════════════════════════════
// FETCH EPISODES SEPARATELY
// ═══════════════════════════════════════════

async function fetchEpisodes(dramaId: string): Promise<Episode[]> {
  for (const path of API_PATHS.EPISODES) {
    for (const params of [
      { id: dramaId }, { dramaId }, { videoId: dramaId }, { sid: dramaId }, { slug: dramaId },
    ]) {
      const d = await api(`${BASE}${path}`, params)
      if (d) {
        const arrs = findEpisodeArrays(d) || findDramaArrays(d)
        if (arrs.length > 0) return arrs[0].map(normalizeEpisode)

        // Maybe the data itself is an array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = d as any
        const list = obj.data || obj.result || obj.list || obj.episodes || obj
        if (Array.isArray(list) && list.length > 0) {
          return list.map(normalizeEpisode)
        }
      }

      // GET
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) {
        const arrs = findEpisodeArrays(gd)
        if (arrs.length > 0) return arrs[0].map(normalizeEpisode)
      }
    }
  }
  return []
}

// ═══════════════════════════════════════════
// PUBLIC: STREAM URL
// ═══════════════════════════════════════════

export async function scrapeStream(dramaSlug: string, ep: number): Promise<StreamInfo> {
  const result: StreamInfo = { episodeUrl: '', streams: [] }

  // 1. Get drama detail to find episode URL
  const drama = await scrapeDramaDetail(dramaSlug)
  if (!drama) return result

  const episode = drama.episodes.find(e => e.number === ep) || drama.episodes[ep - 1]
  if (!episode) return result

  result.episodeUrl = episode.url

  // If stream URL already in episode data
  if (episode.streamUrl) {
    result.streams.push({
      url: episode.streamUrl,
      type: episode.streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
      quality: 'auto',
    })
  }

  // 2. Try stream API
  for (const path of API_PATHS.STREAM) {
    for (const params of [
      { id: episode.number, dramaId: dramaSlug },
      { episodeId: `${dramaSlug}_${ep}` },
      { videoId: dramaSlug, episode: ep },
      { id: dramaSlug, ep },
    ]) {
      const d = await api(`${BASE}${path}`, params)
      if (d) {
        const urls = findStreamUrls(d)
        for (const u of urls) {
          result.streams.push({
            url: u,
            type: u.includes('.m3u8') ? 'hls' : 'mp4',
            quality: u.includes('1080') ? '1080p' : u.includes('720') ? '720p' : 'auto',
          })
        }
      }
    }
  }

  // 3. Scrape episode page
  if (episode.url && result.streams.length === 0) {
    try {
      const html = await get(episode.url)
      const ssr = extractSSR(html)

      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        const urls = findStreamUrls(root)
        for (const u of urls) {
          result.streams.push({ url: u, type: u.includes('.m3u8') ? 'hls' : 'mp4', quality: 'auto' })
        }
      }

      const htmlUrls = extractStreamFromHTML(html)
      for (const u of htmlUrls) {
        result.streams.push({ url: u, type: u.includes('.m3u8') ? 'hls' : 'mp4', quality: 'auto' })
      }
    } catch { /* skip */ }
  }

  // Dedupe streams
  const seen = new Set<string>()
  result.streams = result.streams.filter(s => {
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })

  // Sort: HLS first
  result.streams.sort((a, b) => a.type === 'hls' ? -1 : b.type === 'hls' ? 1 : 0)

  return result
}

// ═══════════════════════════════════════════
// PUBLIC: SEARCH
// ═══════════════════════════════════════════

export async function scrapeSearch(query: string, page = 1): Promise<{ dramas: DramaCard[]; total: number; source: string }> {
  // Try search API
  for (const path of API_PATHS.SEARCH) {
    for (const params of [
      { keyword: query, page, pageSize: 20 },
      { q: query, page, size: 20 },
      { search: query, page },
      { query, page },
      { key: query, page },
      { wd: query, page },
    ]) {
      // POST
      const pd = await api(`${BASE}${path}`, params)
      if (pd) {
        const arrs = findDramaArrays(pd)
        if (arrs.length > 0) {
          const dramas = arrs[0].map(normalizeCard).filter(d => d.title)
          return { dramas, total: dramas.length, source: `POST ${path}` }
        }
      }

      // GET
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) {
        const arrs = findDramaArrays(gd)
        if (arrs.length > 0) {
          const dramas = arrs[0].map(normalizeCard).filter(d => d.title)
          return { dramas, total: dramas.length, source: `GET ${path}?${qs}` }
        }
      }
    }
  }

  // HTML search pages
  const searchUrls = [
    `${HOME}/search?q=${encodeURIComponent(query)}`,
    `${HOME}/search?keyword=${encodeURIComponent(query)}`,
    `${HOME}/search/${encodeURIComponent(query)}`,
    `${BASE}/search?q=${encodeURIComponent(query)}`,
    `${BASE}/search?keyword=${encodeURIComponent(query)}`,
  ]

  for (const url of searchUrls) {
    try {
      const html = await get(url)
      const $ = cheerio.load(html)
      const ssr = extractSSR(html)

      let dramas: DramaCard[] = []

      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        const arrs = findDramaArrays(root)
        for (const arr of arrs) dramas.push(...arr.map(normalizeCard).filter(d => d.title))
      }

      if (dramas.length === 0) dramas = parseDramaCards($)

      if (dramas.length > 0) {
        return { dramas, total: dramas.length, source: url }
      }
    } catch { continue }
  }

  return { dramas: [], total: 0, source: 'none' }
}

// ═══════════════════════════════════════════
// PUBLIC: DISCOVER (DEBUG)
// ═══════════════════════════════════════════

export async function discover(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {}

  // Test all API endpoints
  for (const [type, paths] of Object.entries(API_PATHS)) {
    const typeResults: Record<string, unknown> = {}

    for (const path of paths) {
      const url = `${BASE}${path}`

      // GET
      const gd = await api(url)
      if (gd) {
        typeResults[`✅ GET ${path}`] = JSON.stringify(gd).slice(0, 200)
      }

      // POST
      const pd = await api(url, { page: 1, pageSize: 10 })
      if (pd) {
        typeResults[`✅ POST ${path}`] = JSON.stringify(pd).slice(0, 200)
      }
    }

    results[type] = Object.keys(typeResults).length > 0 ? typeResults : '❌ no working endpoints'
  }

  // Homepage SSR analysis
  try {
    const html = await get(HOME)
    const ssr = extractSSR(html)
    results['SSR_ANALYSIS'] = {
      type: ssr?.type || 'none',
      buildId: ssr?.buildId || null,
      hasData: ssr ? Object.keys(ssr.data || {}).length > 0 : false,
      topKeys: ssr?.type === 'nextjs'
        ? Object.keys(ssr.data?.props?.pageProps || {}).slice(0, 20)
        : ssr ? Object.keys(ssr.data || {}).slice(0, 20) : [],
      dramaArraysFound: ssr ? findDramaArrays(ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data).length : 0,
    }
  } catch (e) {
    results['SSR_ANALYSIS'] = { error: String(e) }
  }

  // Homepage link analysis
  try {
    const html = await get(HOME)
    const $ = cheerio.load(html)
    const allLinks: string[] = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
        allLinks.push(href)
      }
    })

    const dramaLinks = allLinks.filter(h => /\/(drama|detail|series|video|play|short|watch)\//i.test(h))
    const uniqueDramaLinks = [...new Set(dramaLinks)]

    results['HTML_ANALYSIS'] = {
      totalLinks: allLinks.length,
      dramaLinks: uniqueDramaLinks.length,
      sampleDramaLinks: uniqueDramaLinks.slice(0, 10),
      urlPatterns: [...new Set(uniqueDramaLinks.map(u => u.replace(/\/[^/]+$/, '/[slug]')))].slice(0, 5),
    }
  } catch { /* skip */ }

  return results
}
