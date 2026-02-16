import * as cheerio from 'cheerio'
import type { DramaCard, DramaDetail, Episode, StreamInfo } from './types'

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const BASE = 'https://www.goodshort.com'
const LANG = 'id'
const HOME = `${BASE}/${LANG}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const HDR: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en;q=0.7',
  'Referer': HOME,
}

const API_HDR: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9',
  'Referer': HOME,
  'Origin': BASE,
}

// ═══════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════

async function html(url: string): Promise<string> {
  const r = await fetch(url, { headers: HDR, next: { revalidate: 300 } })
  if (!r.ok) throw new Error(`HTTP ${r.status} → ${url}`)
  return r.text()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(url: string, body?: unknown): Promise<any> {
  try {
    const o: RequestInit = { headers: { ...API_HDR } }
    if (body) {
      o.method = 'POST'
      o.body = JSON.stringify(body)
      ;(o.headers as Record<string, string>)['Content-Type'] = 'application/json'
    }
    const r = await fetch(url, o)
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('json')) return null
    return r.json()
  } catch {
    return null
  }
}

function abs(h: string): string {
  if (!h) return ''
  if (h.startsWith('http')) return h
  if (h.startsWith('//')) return 'https:' + h
  return BASE + (h.startsWith('/') ? '' : '/') + h
}

function sl(url: string): string {
  return url.replace(/\/$/, '').split('/').pop() || ''
}

// ═══════════════════════════════════════════
// DEEP SEARCH HELPERS
// ═══════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deep(obj: any, test: (k: string, v: unknown) => boolean, d = 0): any[] {
  const out: unknown[] = []
  if (d > 15 || !obj) return out
  if (Array.isArray(obj)) {
    for (const i of obj) out.push(...deep(i, test, d + 1))
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (test(k, v)) out.push(v)
      out.push(...deep(v, test, d + 1))
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDramas(data: any): any[][] {
  return deep(data, (_k, v) => {
    if (!Array.isArray(v) || v.length === 0 || typeof v[0] !== 'object') return false
    const ks = Object.keys(v[0])
    const matches = ['title', 'name', 'cover', 'image', 'poster', 'coverUrl', 'id', 'drama_id'].filter(x => ks.includes(x))
    return matches.length >= 2
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findEps(data: any): any[][] {
  return deep(data, (k, v) =>
    ['episodes', 'episodeList', 'episode_list', 'videoList', 'video_list', 'playlist', 'chapterList'].includes(k) &&
    Array.isArray(v) &&
    v.length > 0
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findStreams(data: any): string[] {
  const u = deep(data, (k, v) => {
    if (typeof v !== 'string') return false
    const validKeys = ['playUrl', 'videoUrl', 'streamUrl', 'video_url', 'play_url', 'hls_url', 'mp4_url', 'src', 'source']
    return validKeys.includes(k) && (/\.(m3u8|mp4|ts)/.test(v) || /video|stream|play|media|cdn/.test(v))
  }) as string[]
  return [...new Set(u)]
}

// ═══════════════════════════════════════════
// DATA NORMALIZERS
// ═══════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCard(i: any): DramaCard {
  const id = String(i.id || i.drama_id || i.videoId || i.video_id || i.sid || '')
  const title = String(i.title || i.name || i.drama_name || i.videoName || '')
  const cover = String(i.cover || i.coverUrl || i.cover_url || i.image || i.poster || i.img || i.pic || '')
  const s = String(i.slug || i.id || i.drama_id || '')
  const u = String(i.url || i.detailUrl || i.detail_url || i.shareUrl || '')
  return {
    id,
    slug: s,
    title,
    cover: abs(cover),
    url: u ? abs(u) : `${HOME}/drama/${s || id}`,
    episodes: Number(i.totalEpisodes || i.episodeCount || i.episode_count || i.total_episodes || 0),
    rating: Number(i.rating || i.score || 0),
    genre: String(i.genre || i.category || i.categoryName || i.tag || ''),
    views: String(i.views || i.playCount || i.play_count || i.viewCount || ''),
    status: String(i.status || ''),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEp(i: any, idx: number): Episode {
  return {
    number: Number(i.number || i.episode || i.ep || i.sort || i.index || i.order || idx + 1),
    title: String(i.title || i.name || i.episodeName || `Episode ${idx + 1}`),
    url: abs(String(i.url || i.detailUrl || i.detail_url || i.pageUrl || '')),
    streamUrl: String(i.streamUrl || i.videoUrl || i.playUrl || i.video_url || i.play_url || i.hls || i.mp4 || ''),
    thumbnail: abs(String(i.thumbnail || i.cover || i.image || i.thumb || '')),
    duration: String(i.duration || i.time || ''),
    isFree: i.isFree !== undefined ? Boolean(i.isFree) : !i.isVip && !i.vip && !i.locked,
    isVip: Boolean(i.isVip || i.vip || i.locked || i.is_vip || false),
  }
}

// ═══════════════════════════════════════════
// SSR DATA EXTRACTION
// ═══════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSSR(raw: string): { type: string; data: any; buildId?: string } | null {
  const $ = cheerio.load(raw)

  // Next.js __NEXT_DATA__
  const ns = $('#__NEXT_DATA__').html()
  if (ns) {
    try {
      const d = JSON.parse(ns)
      return { type: 'nextjs', data: d, buildId: d.buildId }
    } catch {
      /* skip */
    }
  }

  // Nuxt / inline data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let found: any = null
  $('script').each((_, el) => {
    const t = $(el).html() || ''
    
    // Pattern tanpa flag 's', pakai [\s\S] untuk match newline
    const patterns = [
      /window\.__NUXT__\s*=\s*([\s\S]+?);\s*$/,
      /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\});/,
      /window\.__DATA__\s*=\s*(\{[\s\S]+?\});/,
      /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]+?\});/,
    ]
    
    for (const p of patterns) {
      const m = t.match(p)
      if (m && m[1]) {
        try {
          found = JSON.parse(m[1])
          return false // break .each()
        } catch {
          /* skip */
        }
      }
    }
  })
  
  if (found) return { type: 'inline', data: found }

  return null
}

// ═══════════════════════════════════════════
// HTML PARSERS
// ═══════════════════════════════════════════

function parseCards($: cheerio.CheerioAPI): DramaCard[] {
  const cards: DramaCard[] = []
  const seen = new Set<string>()

  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''
    
    // Check if drama URL
    if (!/\/(drama|detail|series|video|play|short|watch|id)\//i.test(href)) return
    // Skip non-drama pages
    if (/\/(login|register|about|help|faq|terms|privacy|download)/i.test(href)) return

    const full = abs(href)
    if (seen.has(full)) return

    const $img = $a.find('img').first()
    const title = (
      $img.attr('alt') ||
      $a.find('[class*="title"],[class*="name"],h2,h3,h4,p').first().text().trim() ||
      $a.attr('title') ||
      ''
    ).trim()

    if (!title || title.length < 2) return

    const cover = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || ''
    seen.add(full)
    
    cards.push({
      id: sl(href),
      slug: sl(href),
      title,
      cover: abs(cover),
      url: full,
    })
  })

  return cards
}

function parseEpsHTML($: cheerio.CheerioAPI): Episode[] {
  const eps: Episode[] = []
  const sels = [
    '[class*="episode"]',
    '[class*="ep-list"]',
    '[class*="playlist"]',
    '[class*="video-list"]',
    '[class*="chapter"]',
  ]

  for (const sel of sels) {
    const $c = $(sel).first()
    if (!$c.length) continue
    
    $c.find('a[href],button,[role="button"],li').each((i, el) => {
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
        duration: $el.find('[class*="duration"],[class*="time"]').text().trim(),
        isFree: !$el.find('[class*="vip"],[class*="lock"],[class*="coin"]').length,
        isVip: !!$el.find('[class*="vip"],[class*="lock"]').length,
      })
    })
    
    if (eps.length > 0) break
  }
  
  return eps
}

function parseDetailHTML($: cheerio.CheerioAPI): Partial<DramaDetail> {
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    ''

  const cover = abs(
    $('meta[property="og:image"]').attr('content') ||
    $('[class*="cover"] img,[class*="poster"] img').first().attr('src') ||
    ''
  )

  const description =
    $('[class*="desc"],[class*="synopsis"],[class*="summary"],[class*="intro"]').first().text().trim() ||
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''

  const genreList = $('[class*="genre"] a,[class*="tag"] a,[class*="category"] a')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)

  const ratingText = $('[class*="rating"],[class*="score"]').first().text()
  const ratingMatch = ratingText.match(/([\d.]+)/)
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0

  const views = $('[class*="view"],[class*="play-count"]').first().text().trim()

  return {
    title,
    cover,
    description,
    genreList,
    rating,
    views,
    episodeList: parseEpsHTML($),
  }
}

function extractStreamsHTML(raw: string): string[] {
  const urls: string[] = []

  // m3u8 URLs
  const m3u8Matches = raw.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)
  if (m3u8Matches) urls.push(...m3u8Matches)

  // mp4 URLs
  const mp4Matches = raw.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/g)
  if (mp4Matches) urls.push(...mp4Matches)

  // Key-value patterns
  const kvPattern = /(?:playUrl|videoUrl|streamUrl|video_url|play_url|hls_url|mp4_url|src|source|url)\s*[=:]\s*["'](https?:\/\/[^"']+)["']/gi
  let m
  while ((m = kvPattern.exec(raw)) !== null) {
    if (/\.(m3u8|mp4|ts)|video|stream|play|media|cdn/i.test(m[1])) {
      urls.push(m[1])
    }
  }

  return [...new Set(urls)]
}

// ═══════════════════════════════════════════
// API PATHS
// ═══════════════════════════════════════════

const PATHS = {
  HOME: [
    '/api/home',
    '/api/home/data',
    '/api/home/index',
    '/api/index',
    '/api/init',
    '/api/app/config',
    '/api/v1/home',
    '/api/v2/home',
  ],
  LIST: [
    '/api/drama/list',
    '/api/v1/drama/list',
    '/api/video/list',
    '/api/v1/video/list',
    '/api/short/list',
    '/api/series/list',
    '/api/home/recommend',
  ],
  DETAIL: [
    '/api/drama/detail',
    '/api/v1/drama/detail',
    '/api/video/detail',
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryAPIs(type: keyof typeof PATHS, params?: Record<string, unknown>): Promise<{ ep: string; data: any } | null> {
  for (const p of PATHS[type]) {
    const u = `${BASE}${p}`

    // Try GET with params
    if (params) {
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
      const d = await api(`${u}?${qs}`)
      if (d) return { ep: `GET ${p}?${qs}`, data: d }
    } else {
      const d = await api(u)
      if (d) return { ep: `GET ${p}`, data: d }
    }

    // Try POST
    const pd = await api(u, params || { page: 1, pageSize: 20 })
    if (pd) return { ep: `POST ${p}`, data: pd }
  }
  
  return null
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE HOME
// ═══════════════════════════════════════════

export async function scrapeHome() {
  const raw = await html(HOME)
  const $ = cheerio.load(raw)
  const ssr = extractSSR(raw)

  let dramas: DramaCard[] = []
  const sections: { title: string; dramas: DramaCard[] }[] = []
  const banners: { title: string; image: string; url: string }[] = []
  const categories: { name: string; slug: string }[] = []
  let source = 'html'

  // 1. Extract from SSR data
  if (ssr) {
    source = ssr.type
    const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data

    // Find drama arrays
    for (const arr of findDramas(root)) {
      const mapped = arr.map(toCard).filter((d: DramaCard) => d.title)
      dramas.push(...mapped)
    }

    // Build sections from object keys
    if (root && typeof root === 'object') {
      for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          const firstKeys = Object.keys(value[0] as Record<string, unknown>)
          
          // Check if it's a drama array
          if (['title', 'name', 'cover', 'id'].some(k => firstKeys.includes(k))) {
            const mapped = value.map(toCard).filter((d: DramaCard) => d.title)
            if (mapped.length > 0) {
              sections.push({
                title: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
                dramas: mapped,
              })
            }
          }

          // Check for nested sections: [{title, list:[...]}, ...]
          for (const sec of value) {
            if (sec && typeof sec === 'object' && 'title' in sec) {
              const s = sec as Record<string, unknown>
              const listKey = Object.keys(s).find(
                k => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0
              )
              if (listKey) {
                const mapped = (s[listKey] as unknown[]).map(toCard).filter((d: DramaCard) => d.title)
                if (mapped.length > 0) {
                  sections.push({ title: String(s.title), dramas: mapped })
                }
              }
            }
          }
        }
      }
    }

    // Try Next.js data routes
    if (ssr.buildId) {
      const nextPaths = [
        `/_next/data/${ssr.buildId}/${LANG}.json`,
        `/_next/data/${ssr.buildId}/index.json`,
      ]
      for (const p of nextPaths) {
        const d = await api(`${BASE}${p}`)
        if (d) {
          for (const arr of findDramas(d)) {
            dramas.push(...arr.map(toCard).filter((x: DramaCard) => x.title))
          }
          source = 'nextjs_data'
          break
        }
      }
    }
  }

  // 2. Try API endpoints
  if (dramas.length === 0) {
    const r = await tryAPIs('HOME')
    if (r) {
      source = r.ep
      for (const arr of findDramas(r.data)) {
        dramas.push(...arr.map(toCard).filter((x: DramaCard) => x.title))
      }
    }

    const r2 = await tryAPIs('LIST', { page: 1, pageSize: 30 })
    if (r2) {
      for (const arr of findDramas(r2.data)) {
        dramas.push(...arr.map(toCard).filter((x: DramaCard) => x.title))
      }
    }
  }

  // 3. Parse HTML cards
  dramas.push(...parseCards($))

  // 4. Parse banners
  $('[class*="banner"] a,[class*="swiper"] a,[class*="carousel"] a,[class*="slider"] a').each((_, el) => {
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

  // 5. Parse categories
  $('a[href*="category"],a[href*="genre"],a[href*="type"],[class*="category"] a,[class*="genre"] a,[class*="filter"] a').each((_, el) => {
    const t = $(el).text().trim()
    const href = $(el).attr('href') || ''
    if (t && t.length < 30 && href) {
      categories.push({
        name: t,
        slug: sl(href) || t.toLowerCase().replace(/\s+/g, '-'),
      })
    }
  })

  // 6. Build sections from HTML if empty
  if (sections.length === 0) {
    $('section,[class*="section"],[class*="module"],[class*="block"]').each((_, el) => {
      const $s = $(el)
      const title = $s.find('h2,h3,[class*="title"]').first().text().trim()
      if (!title) return

      const d: DramaCard[] = []
      $s.find('a[href]').each((_, a) => {
        const href = $(a).attr('href') || ''
        if (!/\/(drama|detail|series|video|play|short|watch)\//i.test(href)) return
        const $img = $(a).find('img').first()
        const t = ($img.attr('alt') || $(a).text().trim().split('\n')[0]?.trim() || '').trim()
        if (t) {
          d.push({
            id: sl(href),
            slug: sl(href),
            title: t,
            cover: abs($img.attr('src') || ''),
            url: abs(href),
          })
        }
      })

      if (d.length > 0) sections.push({ title, dramas: d })
    })
  }

  // 7. Dedupe dramas
  const seen = new Set<string>()
  dramas = dramas.filter(d => {
    const k = d.title + '|' + d.url
    if (seen.has(k) || !d.title) return false
    seen.add(k)
    return true
  })

  return { banners, sections, categories, allDramas: dramas, source }
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE DRAMAS (PAGINATED)
// ═══════════════════════════════════════════

export async function scrapeDramas(page = 1, category?: string) {
  const params: Record<string, unknown> = { page, pageSize: 20, size: 20, limit: 20 }
  if (category) {
    Object.assign(params, { category, categoryId: category, genre: category, type: category })
  }

  // Try API endpoints
  for (const type of ['LIST', 'HOME'] as const) {
    const r = await tryAPIs(type, params)
    if (r) {
      const arrs = findDramas(r.data)
      if (arrs.length > 0) {
        const dramas = arrs[0].map(toCard).filter((d: DramaCard) => d.title)
        return { dramas, hasMore: dramas.length >= 15, source: r.ep }
      }
    }
  }

  // Try HTML pages
  const pagePaths = ['drama', 'dramas', 'explore', 'all', 'browse', 'library']
  for (const path of pagePaths) {
    try {
      const raw = await html(`${HOME}/${path}?page=${page}`)
      const $ = cheerio.load(raw)
      const ssr = extractSSR(raw)
      
      let dramas: DramaCard[] = []
      
      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        for (const arr of findDramas(root)) {
          dramas.push(...arr.map(toCard).filter((d: DramaCard) => d.title))
        }
      }
      
      if (dramas.length === 0) {
        dramas = parseCards($)
      }
      
      if (dramas.length > 0) {
        return { dramas, hasMore: dramas.length >= 10, source: `${HOME}/${path}` }
      }
    } catch {
      continue
    }
  }

  // Fallback to homepage
  const home = await scrapeHome()
  return { dramas: home.allDramas, hasMore: false, source: 'homepage_fallback' }
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE DRAMA DETAIL
// ═══════════════════════════════════════════

export async function scrapeDramaDetail(dramaSlug: string): Promise<DramaDetail | null> {
  // Build possible URLs
  const urls = [
    `${HOME}/drama/${dramaSlug}`,
    `${HOME}/detail/${dramaSlug}`,
    `${HOME}/series/${dramaSlug}`,
    `${HOME}/video/${dramaSlug}`,
    `${HOME}/short/${dramaSlug}`,
    `${HOME}/${dramaSlug}`,
    `${BASE}/drama/${dramaSlug}`,
    `${BASE}/detail/${dramaSlug}`,
  ]
  
  if (dramaSlug.startsWith('http')) {
    urls.unshift(dramaSlug)
  }

  // Try API endpoints
  for (const path of PATHS.DETAIL) {
    const paramsList = [
      { id: dramaSlug },
      { dramaId: dramaSlug },
      { slug: dramaSlug },
      { videoId: dramaSlug },
    ]

    for (const params of paramsList) {
      // Try POST
      const postData = await api(`${BASE}${path}`, params)
      if (postData) {
        const det = postData.data || postData.result || postData
        if (det && (det.title || det.name)) {
          const drama: DramaDetail = {
            ...toCard(det),
            originalTitle: String(det.originalTitle || det.original_title || ''),
            description: String(det.description || det.desc || det.synopsis || det.intro || ''),
            genreList: ([] as string[]).concat(det.genre || det.category || []).map(String).filter(Boolean),
            tags: ([] as string[]).concat(det.tags || []).map(String),
            totalEpisodes: Number(det.totalEpisodes || det.episodeCount || 0),
            language: String(det.language || det.lang || ''),
            year: String(det.year || ''),
            cast: ([] as string[]).concat(det.cast || det.actors || []).map(String),
            episodeList: [],
          }

          // Get episodes from same response
          const ea = findEps(det)
          if (ea.length > 0) {
            drama.episodeList = ea[0].map(toEp)
          }

          // Fetch episodes separately if needed
          if (drama.episodeList.length === 0) {
            drama.episodeList = await fetchEps(dramaSlug)
          }

          drama.totalEpisodes = drama.totalEpisodes || drama.episodeList.length
          return drama
        }
      }

      // Try GET
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
      const getData = await api(`${BASE}${path}?${qs}`)
      if (getData) {
        const det = getData.data || getData.result || getData
        if (det && (det.title || det.name)) {
          const drama: DramaDetail = {
            ...toCard(det),
            originalTitle: String(det.originalTitle || det.original_title || ''),
            description: String(det.description || det.desc || det.synopsis || det.intro || ''),
            genreList: ([] as string[]).concat(det.genre || det.category || []).map(String).filter(Boolean),
            tags: ([] as string[]).concat(det.tags || []).map(String),
            totalEpisodes: Number(det.totalEpisodes || det.episodeCount || 0),
            language: String(det.language || det.lang || ''),
            year: String(det.year || ''),
            cast: ([] as string[]).concat(det.cast || det.actors || []).map(String),
            episodeList: [],
          }

          const ea = findEps(det)
          if (ea.length > 0) {
            drama.episodeList = ea[0].map(toEp)
          }

          if (drama.episodeList.length === 0) {
            drama.episodeList = await fetchEps(dramaSlug)
          }

          drama.totalEpisodes = drama.totalEpisodes || drama.episodeList.length
          return drama
        }
      }
    }
  }

  // Try HTML scraping
  for (const url of urls) {
    try {
      const raw = await html(url)
      const $ = cheerio.load(raw)
      const ssr = extractSSR(raw)

      const drama: DramaDetail = {
        id: dramaSlug,
        slug: dramaSlug,
        title: '',
        originalTitle: '',
        cover: '',
        url,
        description: '',
        genreList: [],
        tags: [],
        totalEpisodes: 0,
        rating: 0,
        views: '',
        status: '',
        language: '',
        year: '',
        cast: [],
        episodeList: [],
      }

      // Extract from SSR data
      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        const candidates = deep(root, k =>
          ['dramaDetail', 'drama', 'detail', 'videoDetail', 'seriesDetail', 'data', 'info'].includes(k)
        )

        for (const c of candidates) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (c && typeof c === 'object' && !Array.isArray(c) && ((c as any).title || (c as any).name)) {
            Object.assign(drama, toCard(c))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cc = c as any
            drama.description = String(cc.description || cc.desc || cc.synopsis || '')
            drama.originalTitle = String(cc.originalTitle || cc.original_title || '')
            drama.genreList = ([] as string[]).concat(cc.genre || cc.category || []).map(String).filter(Boolean)
            drama.tags = ([] as string[]).concat(cc.tags || []).map(String)
            drama.language = String(cc.language || '')
            drama.year = String(cc.year || '')
            drama.cast = ([] as string[]).concat(cc.cast || cc.actors || []).map(String)
            break
          }
        }

        // Episodes from SSR
        const ea = findEps(root)
        if (ea.length > 0) {
          drama.episodeList = ea[0].map(toEp)
        }
      }

      // Fallback to HTML parsing
      if (!drama.title) {
        const h = parseDetailHTML($)
        drama.title = h.title || ''
        drama.cover = h.cover || drama.cover
        drama.description = h.description || drama.description
        drama.genreList = h.genreList || drama.genreList
        drama.rating = h.rating || drama.rating
        drama.views = h.views || drama.views
      }

      if (drama.episodeList.length === 0) {
        drama.episodeList = parseEpsHTML($)
      }

      // Try extracting stream URLs from page
      if (drama.episodeList.length === 0) {
        const s = extractStreamsHTML(raw)
        if (s.length > 0) {
          drama.episodeList = [{
            number: 1,
            title: 'Episode 1',
            url,
            streamUrl: s[0],
            thumbnail: '',
            duration: '',
            isFree: true,
            isVip: false,
          }]
        }
      }

      // Fetch episodes via API
      if (drama.episodeList.length === 0) {
        drama.episodeList = await fetchEps(dramaSlug)
      }

      drama.totalEpisodes = drama.totalEpisodes || drama.episodeList.length
      drama.url = url

      if (drama.title) return drama
    } catch {
      continue
    }
  }

  return null
}

// ═══════════════════════════════════════════
// FETCH EPISODES
// ═══════════════════════════════════════════

async function fetchEps(dramaId: string): Promise<Episode[]> {
  for (const path of PATHS.EPISODES) {
    const paramsList = [
      { id: dramaId },
      { dramaId },
      { videoId: dramaId },
      { sid: dramaId },
      { slug: dramaId },
    ]

    for (const params of paramsList) {
      // POST
      const d = await api(`${BASE}${path}`, params)
      if (d) {
        const ea = findEps(d)
        if (ea.length > 0) return ea[0].map(toEp)
        
        const obj = d.data || d.result || d.list || d.episodes || d
        if (Array.isArray(obj) && obj.length > 0) {
          return obj.map(toEp)
        }
      }

      // GET
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) {
        const ea = findEps(gd)
        if (ea.length > 0) return ea[0].map(toEp)
      }
    }
  }
  
  return []
}

// ═══════════════════════════════════════════
// PUBLIC: SCRAPE STREAM URL
// ═══════════════════════════════════════════

export async function scrapeStream(dramaSlug: string, ep: number): Promise<StreamInfo> {
  const result: StreamInfo = { episodeUrl: '', streams: [] }

  // Get drama detail
  const drama = await scrapeDramaDetail(dramaSlug)
  if (!drama) return result

  // Find episode
  const episode = drama.episodeList.find(e => e.number === ep) || drama.episodeList[ep - 1]
  if (!episode) return result

  result.episodeUrl = episode.url

  // Use existing stream URL
  if (episode.streamUrl) {
    result.streams.push({
      url: episode.streamUrl,
      type: episode.streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
      quality: 'auto',
    })
  }

  // Try stream API endpoints
  for (const path of PATHS.STREAM) {
    const paramsList = [
      { id: episode.number, dramaId: dramaSlug },
      { episodeId: `${dramaSlug}_${ep}` },
      { videoId: dramaSlug, episode: ep },
    ]

    for (const params of paramsList) {
      const d = await api(`${BASE}${path}`, params)
      if (d) {
        for (const u of findStreams(d)) {
          result.streams.push({
            url: u,
            type: u.includes('.m3u8') ? 'hls' : 'mp4',
            quality: 'auto',
          })
        }
      }
    }
  }

  // Scrape episode page
  if (episode.url && result.streams.length === 0) {
    try {
      const raw = await html(episode.url)
      const ssr = extractSSR(raw)

      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        for (const u of findStreams(root)) {
          result.streams.push({
            url: u,
            type: u.includes('.m3u8') ? 'hls' : 'mp4',
            quality: 'auto',
          })
        }
      }

      for (const u of extractStreamsHTML(raw)) {
        result.streams.push({
          url: u,
          type: u.includes('.m3u8') ? 'hls' : 'mp4',
          quality: 'auto',
        })
      }
    } catch {
      /* skip */
    }
  }

  // Dedupe and sort streams
  const seen = new Set<string>()
  result.streams = result.streams.filter(s => {
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
  result.streams.sort((a, b) => (a.type === 'hls' ? -1 : b.type === 'hls' ? 1 : 0))

  return result
}

// ═══════════════════════════════════════════
// PUBLIC: SEARCH
// ═══════════════════════════════════════════

export async function scrapeSearch(query: string, page = 1) {
  // Try search API endpoints
  for (const path of PATHS.SEARCH) {
    const paramsList = [
      { keyword: query, page, pageSize: 20 },
      { q: query, page, size: 20 },
      { search: query, page },
      { query, page },
      { key: query, page },
      { wd: query, page },
    ]

    for (const params of paramsList) {
      // POST
      const pd = await api(`${BASE}${path}`, params)
      if (pd) {
        const a = findDramas(pd)
        if (a.length > 0) {
          const d = a[0].map(toCard).filter((x: DramaCard) => x.title)
          return { dramas: d, total: d.length, source: `POST ${path}` }
        }
      }

      // GET
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) {
        const a = findDramas(gd)
        if (a.length > 0) {
          const d = a[0].map(toCard).filter((x: DramaCard) => x.title)
          return { dramas: d, total: d.length, source: `GET ${path}` }
        }
      }
    }
  }

  // Try HTML search pages
  const searchUrls = [
    `${HOME}/search?q=${encodeURIComponent(query)}`,
    `${HOME}/search?keyword=${encodeURIComponent(query)}`,
    `${HOME}/search/${encodeURIComponent(query)}`,
    `${BASE}/search?q=${encodeURIComponent(query)}`,
  ]

  for (const u of searchUrls) {
    try {
      const raw = await html(u)
      const $ = cheerio.load(raw)
      const ssr = extractSSR(raw)

      let dramas: DramaCard[] = []

      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        for (const arr of findDramas(root)) {
          dramas.push(...arr.map(toCard).filter((d: DramaCard) => d.title))
        }
      }

      if (dramas.length === 0) {
        dramas = parseCards($)
      }

      if (dramas.length > 0) {
        return { dramas, total: dramas.length, source: u }
      }
    } catch {
      continue
    }
  }

  return { dramas: [], total: 0, source: 'none' }
}

// ═══════════════════════════════════════════
// PUBLIC: DISCOVER (DEBUG)
// ═══════════════════════════════════════════

export async function discover() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: Record<string, any> = {}

  // Test all API endpoints
  for (const [type, paths] of Object.entries(PATHS)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: Record<string, any> = {}

    for (const p of paths) {
      const u = `${BASE}${p}`

      // GET
      const gd = await api(u)
      if (gd) {
        r[`✅ GET ${p}`] = JSON.stringify(gd).slice(0, 300)
      }

      // POST
      const pd = await api(u, { page: 1, pageSize: 10 })
      if (pd) {
        r[`✅ POST ${p}`] = JSON.stringify(pd).slice(0, 300)
      }
    }

    results[type] = Object.keys(r).length > 0 ? r : '❌ none'
  }

  // Analyze homepage
  try {
    const raw = await html(HOME)
    const ssr = extractSSR(raw)
    const $ = cheerio.load(raw)

    // Collect all links
    const allLinks: string[] = []
    $('a[href]').each((_, el) => {
      const h = $(el).attr('href') || ''
      if (h && !h.startsWith('#')) allLinks.push(h)
    })

    const dramaLinks = [...new Set(
      allLinks.filter(h => /\/(drama|detail|series|video|play|short|watch)\//i.test(h))
    )]

    results['SSR'] = {
      type: ssr?.type || 'none',
      buildId: ssr?.buildId || null,
      topKeys: ssr?.type === 'nextjs'
        ? Object.keys(ssr.data?.props?.pageProps || {}).slice(0, 20)
        : ssr
          ? Object.keys(ssr.data || {}).slice(0, 20)
          : [],
      dramaArrays: ssr
        ? findDramas(ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data).length
        : 0,
    }

    results['HTML'] = {
      totalLinks: allLinks.length,
      dramaLinks: dramaLinks.length,
      samples: dramaLinks.slice(0, 15),
    }
  } catch (e) {
    results['SSR'] = { error: String(e) }
  }

  return results
}
