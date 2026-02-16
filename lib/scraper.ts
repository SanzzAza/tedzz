import * as cheerio from 'cheerio'
import type { DramaCard, DramaDetail, Episode, StreamInfo } from './types'

// ═══ CONFIG ═══
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

// ═══ HELPERS ═══

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
  } catch { return null }
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
    return ['title', 'name', 'cover', 'image', 'poster', 'coverUrl', 'id', 'drama_id'].filter(x => ks.includes(x)).length >= 2
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findEps(data: any): any[][] {
  return deep(data, (k, v) =>
    ['episodes', 'episodeList', 'episode_list', 'videoList', 'video_list', 'playlist', 'chapterList'].includes(k)
    && Array.isArray(v) && v.length > 0
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findStreams(data: any): string[] {
  const u = deep(data, (k, v) => {
    if (typeof v !== 'string') return false
    return ['playUrl', 'videoUrl', 'streamUrl', 'video_url', 'play_url', 'hls_url', 'mp4_url', 'src', 'source'].includes(k)
      && (/\.(m3u8|mp4|ts)/.test(v) || /video|stream|play|media|cdn/.test(v))
  }) as string[]
  return [...new Set(u)]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCard(i: any): DramaCard {
  const id = String(i.id || i.drama_id || i.videoId || i.video_id || i.sid || '')
  const title = String(i.title || i.name || i.drama_name || i.videoName || '')
  const cover = String(i.cover || i.coverUrl || i.cover_url || i.image || i.poster || i.img || i.pic || '')
  const s = String(i.slug || i.id || i.drama_id || '')
  const u = String(i.url || i.detailUrl || i.detail_url || i.shareUrl || '')
  return {
    id, slug: s, title, cover: abs(cover),
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

// ═══ SSR EXTRACTION ═══

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSSR(raw: string): { type: string; data: any; buildId?: string } | null {
  const $ = cheerio.load(raw)

  // Next.js
  const ns = $('#__NEXT_DATA__').html()
  if (ns) {
    try { const d = JSON.parse(ns); return { type: 'nextjs', data: d, buildId: d.buildId } }
    catch { /* skip */ }
  }

  // Nuxt / inline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let found: any = null
  $('script').each((_, el) => {
    const t = $(el).html() || ''
    const patterns = [
      /window\.__NUXT__\s*=\s*(.+?);\s*$/s,
      /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
      /window\.__DATA__\s*=\s*({.+?});/s,
      /window\.__PRELOADED_STATE__\s*=\s*({.+?});/s,
    ]
    for (const p of patterns) {
      const m = t.match(p)
      if (m) { try { found = JSON.parse(m[1]) } catch { /* skip */ } }
    }
  })
  if (found) return { type: 'inline', data: found }

  return null
}

// ═══ HTML PARSERS ═══

function parseCards($: cheerio.CheerioAPI): DramaCard[] {
  const cards: DramaCard[] = []
  const seen = new Set<string>()

  $('a[href]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''
    if (!/\/(drama|detail|series|video|play|short|watch|id)\//i.test(href)) return
    if (/\/(login|register|about|help|faq|terms|privacy|download)/i.test(href)) return

    const full = abs(href)
    if (seen.has(full)) return

    const $img = $a.find('img').first()
    const title = (
      $img.attr('alt') ||
      $a.find('[class*="title"],[class*="name"],h2,h3,h4,p').first().text().trim() ||
      $a.attr('title') || ''
    ).trim()

    if (!title || title.length < 2) return

    const cover = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || ''
    seen.add(full)
    cards.push({ id: sl(href), slug: sl(href), title, cover: abs(cover), url: full })
  })

  return cards
}

function parseEpsHTML($: cheerio.CheerioAPI): Episode[] {
  const eps: Episode[] = []
  const sels = ['[class*="episode"]', '[class*="ep-list"]', '[class*="playlist"]', '[class*="video-list"]', '[class*="chapter"]']

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
        url: abs(href), streamUrl: '',
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
  return {
    title: $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text().trim() || '',
    cover: abs($('meta[property="og:image"]').attr('content') || $('[class*="cover"] img,[class*="poster"] img').first().attr('src') || ''),
    description: $('[class*="desc"],[class*="synopsis"],[class*="summary"],[class*="intro"]').first().text().trim() || $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
    genreList: $('[class*="genre"] a,[class*="tag"] a,[class*="category"] a').map((_, el) => $(el).text().trim()).get().filter(Boolean),
    rating: parseFloat($('[class*="rating"],[class*="score"]').first().text().match(/([\d.]+)/)?.[1] || '0'),
    views: $('[class*="view"],[class*="play-count"]').first().text().trim(),
    episodeList: parseEpsHTML($),
  }
}

function extractStreamsHTML(raw: string): string[] {
  const urls: string[] = []
  const m3 = raw.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g)
  if (m3) urls.push(...m3)
  const m4 = raw.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/g)
  if (m4) urls.push(...m4)

  const kv = /(?:playUrl|videoUrl|streamUrl|video_url|play_url|hls_url|mp4_url|src|source|url)\s*[=:]\s*["'](https?:\/\/[^"']+)["']/gi
  let m
  while ((m = kv.exec(raw)) !== null) {
    if (/\.(m3u8|mp4|ts)|video|stream|play|media|cdn/i.test(m[1])) urls.push(m[1])
  }
  return [...new Set(urls)]
}

// ═══ API PATHS ═══

const PATHS = {
  HOME: ['/api/home', '/api/home/data', '/api/home/index', '/api/index', '/api/init', '/api/app/config', '/api/v1/home', '/api/v2/home'],
  LIST: ['/api/drama/list', '/api/v1/drama/list', '/api/video/list', '/api/v1/video/list', '/api/short/list', '/api/series/list', '/api/home/recommend'],
  DETAIL: ['/api/drama/detail', '/api/v1/drama/detail', '/api/video/detail', '/api/v1/video/detail', '/api/short/detail', '/api/series/detail'],
  EPISODES: ['/api/drama/episodes', '/api/v1/drama/episodes', '/api/episode/list', '/api/v1/episode/list', '/api/video/episode'],
  STREAM: ['/api/video/play', '/api/v1/video/play', '/api/episode/play', '/api/video/url', '/api/stream/url'],
  SEARCH: ['/api/search', '/api/v1/search', '/api/drama/search', '/api/video/search'],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryAPIs(type: keyof typeof PATHS, params?: Record<string, unknown>): Promise<{ ep: string; data: any } | null> {
  for (const p of PATHS[type]) {
    const u = `${BASE}${p}`
    if (params) {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const d = await api(`${u}?${qs}`)
      if (d) return { ep: `GET ${p}?${qs}`, data: d }
    } else {
      const d = await api(u)
      if (d) return { ep: `GET ${p}`, data: d }
    }
    const pd = await api(u, params || { page: 1, pageSize: 20 })
    if (pd) return { ep: `POST ${p}`, data: pd }
  }
  return null
}

// ═══════════════════════════════════════════
// PUBLIC FUNCTIONS
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

  // 1. SSR
  if (ssr) {
    source = ssr.type
    const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
    for (const arr of findDramas(root)) {
      dramas.push(...arr.map(toCard).filter((d: DramaCard) => d.title))
    }

    // Sections
    if (root && typeof root === 'object') {
      for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          // Direct drama arrays
          const firstKeys = Object.keys(value[0] as Record<string, unknown>)
          if (['title', 'name', 'cover', 'id'].some(k => firstKeys.includes(k))) {
            const mapped = value.map(toCard).filter((d: DramaCard) => d.title)
            if (mapped.length > 0) sections.push({ title: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(), dramas: mapped })
          }
          // Nested sections: [{title, list:[...]}, ...]
          for (const sec of value) {
            if (sec && typeof sec === 'object' && 'title' in sec) {
              const s = sec as Record<string, unknown>
              const lk = Object.keys(s).find(k => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0)
              if (lk) {
                const mapped = (s[lk] as unknown[]).map(toCard).filter((d: DramaCard) => d.title)
                if (mapped.length > 0) sections.push({ title: String(s.title), dramas: mapped })
              }
            }
          }
        }
      }
    }

    // Next.js data routes
    if (ssr.buildId) {
      for (const p of [`/_next/data/${ssr.buildId}/${LANG}.json`, `/_next/data/${ssr.buildId}/index.json`]) {
        const d = await api(`${BASE}${p}`)
        if (d) {
          for (const arr of findDramas(d)) dramas.push(...arr.map(toCard).filter((x: DramaCard) => x.title))
          source = 'nextjs_data'
          break
        }
      }
    }
  }

  // 2. API
  if (dramas.length === 0) {
    const r = await tryAPIs('HOME')
    if (r) { source = r.ep; for (const arr of findDramas(r.data)) dramas.push(...arr.map(toCard).filter((x: DramaCard) => x.title)) }
    const r2 = await tryAPIs('LIST', { page: 1, pageSize: 30 })
    if (r2) { for (const arr of findDramas(r2.data)) dramas.push(...arr.map(toCard).filter((x: DramaCard) => x.title)) }
  }

  // 3. HTML
  dramas.push(...parseCards($))

  // Banners
  $('[class*="banner"] a,[class*="swiper"] a,[class*="carousel"] a,[class*="slider"] a').each((_, el) => {
    const $a = $(el); const $img = $a.find('img').first(); const href = $a.attr('href')
    if ($img.length && href) banners.push({ title: $img.attr('alt') || '', image: abs($img.attr('src') || $img.attr('data-src') || ''), url: abs(href) })
  })

  // Categories
  $('a[href*="category"],a[href*="genre"],a[href*="type"],[class*="category"] a,[class*="genre"] a,[class*="filter"] a').each((_, el) => {
    const t = $(el).text().trim(); const href = $(el).attr('href') || ''
    if (t && t.length < 30 && href) categories.push({ name: t, slug: sl(href) || t.toLowerCase().replace(/\s+/g, '-') })
  })

  // Sections from HTML
  if (sections.length === 0) {
    $('section,[class*="section"],[class*="module"],[class*="block"]').each((_, el) => {
      const $s = $(el); const title = $s.find('h2,h3,[class*="title"]').first().text().trim()
      if (!title) return
      const d: DramaCard[] = []
      $s.find('a[href]').each((_, a) => {
        const href = $(a).attr('href') || ''
        if (!/\/(drama|detail|series|video|play|short|watch)\//i.test(href)) return
        const $img = $(a).find('img').first()
        const t = ($img.attr('alt') || $(a).text().trim().split('\n')[0]?.trim() || '').trim()
        if (t) d.push({ id: sl(href), slug: sl(href), title: t, cover: abs($img.attr('src') || ''), url: abs(href) })
      })
      if (d.length > 0) sections.push({ title, dramas: d })
    })
  }

  // Dedupe
  const seen = new Set<string>()
  dramas = dramas.filter(d => { const k = d.title + '|' + d.url; if (seen.has(k) || !d.title) return false; seen.add(k); return true })

  return { banners, sections, categories, allDramas: dramas, source }
}

export async function scrapeDramas(page = 1, category?: string) {
  const params: Record<string, unknown> = { page, pageSize: 20, size: 20, limit: 20 }
  if (category) Object.assign(params, { category, categoryId: category, genre: category, type: category })

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

  for (const path of ['drama', 'dramas', 'explore', 'all', 'browse', 'library']) {
    try {
      const raw = await html(`${HOME}/${path}?page=${page}`)
      const $ = cheerio.load(raw)
      const ssr = extractSSR(raw)
      let dramas: DramaCard[] = []
      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        for (const arr of findDramas(root)) dramas.push(...arr.map(toCard).filter((d: DramaCard) => d.title))
      }
      if (dramas.length === 0) dramas = parseCards($)
      if (dramas.length > 0) return { dramas, hasMore: dramas.length >= 10, source: `${HOME}/${path}` }
    } catch { continue }
  }

  const home = await scrapeHome()
  return { dramas: home.allDramas, hasMore: false, source: 'homepage_fallback' }
}

export async function scrapeDramaDetail(dramaSlug: string): Promise<DramaDetail | null> {
  const urls = [
    `${HOME}/drama/${dramaSlug}`, `${HOME}/detail/${dramaSlug}`, `${HOME}/series/${dramaSlug}`,
    `${HOME}/video/${dramaSlug}`, `${HOME}/short/${dramaSlug}`, `${HOME}/${dramaSlug}`,
    `${BASE}/drama/${dramaSlug}`, `${BASE}/detail/${dramaSlug}`,
  ]
  if (dramaSlug.startsWith('http')) urls.unshift(dramaSlug)

  // API
  for (const path of PATHS.DETAIL) {
    for (const params of [{ id: dramaSlug }, { dramaId: dramaSlug }, { slug: dramaSlug }, { videoId: dramaSlug }]) {
      for (const d of [await api(`${BASE}${path}`, params), await api(`${BASE}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`)]) {
        if (!d) continue
        const det = d.data || d.result || d
        if (det && (det.title || det.name)) {
          const drama: DramaDetail = {
            ...toCard(det), originalTitle: String(det.originalTitle || det.original_title || ''),
            description: String(det.description || det.desc || det.synopsis || det.intro || ''),
            genreList: [].concat(det.genre || det.category || []).map(String).filter(Boolean),
            tags: [].concat(det.tags || []).map(String), totalEpisodes: Number(det.totalEpisodes || det.episodeCount || 0),
            language: String(det.language || det.lang || ''), year: String(det.year || ''),
            cast: [].concat(det.cast || det.actors || []).map(String), episodeList: [],
          }
          const ea = findEps(det)
          if (ea.length > 0) drama.episodeList = ea[0].map(toEp)
          if (drama.episodeList.length === 0) drama.episodeList = await fetchEps(dramaSlug)
          drama.totalEpisodes = drama.totalEpisodes || drama.episodeList.length
          return drama
        }
      }
    }
  }

  // HTML
  for (const url of urls) {
    try {
      const raw = await html(url)
      const $ = cheerio.load(raw)
      const ssr = extractSSR(raw)
      const drama: DramaDetail = {
        id: dramaSlug, slug: dramaSlug, title: '', originalTitle: '', cover: '', url,
        description: '', genreList: [], tags: [], totalEpisodes: 0, rating: 0, views: '', status: '',
        language: '', year: '', cast: [], episodeList: [],
      }

      if (ssr) {
        const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data
        const cands = deep(root, k => ['dramaDetail', 'drama', 'detail', 'videoDetail', 'seriesDetail', 'data', 'info'].includes(k))
        for (const c of cands) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (c && typeof c === 'object' && !Array.isArray(c) && ((c as any).title || (c as any).name)) {
            Object.assign(drama, toCard(c))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cc = c as any
            drama.description = String(cc.description || cc.desc || cc.synopsis || '')
            drama.originalTitle = String(cc.originalTitle || cc.original_title || '')
            drama.genreList = [].concat(cc.genre || cc.category || []).map(String).filter(Boolean)
            drama.tags = [].concat(cc.tags || []).map(String)
            drama.language = String(cc.language || '')
            drama.year = String(cc.year || '')
            drama.cast = [].concat(cc.cast || cc.actors || []).map(String)
            break
          }
        }
        const ea = findEps(root)
        if (ea.length > 0) drama.episodeList = ea[0].map(toEp)
      }

      if (!drama.title) {
        const h = parseDetailHTML($)
        drama.title = h.title || ''; drama.cover = h.cover || drama.cover
        drama.description = h.description || drama.description
        drama.genreList = h.genreList || drama.genreList; drama.rating = h.rating || drama.rating
        drama.views = h.views || drama.views
      }

      if (drama.episodeList.length === 0) drama.episodeList = parseEpsHTML($)
      if (drama.episodeList.length === 0) {
        const s = extractStreamsHTML(raw)
        if (s.length > 0) drama.episodeList = [{ number: 1, title: 'Episode 1', url, streamUrl: s[0], thumbnail: '', duration: '', isFree: true, isVip: false }]
      }
      if (drama.episodeList.length === 0) drama.episodeList = await fetchEps(dramaSlug)

      drama.totalEpisodes = drama.totalEpisodes || drama.episodeList.length
      drama.url = url
      if (drama.title) return drama
    } catch { continue }
  }

  return null
}

async function fetchEps(dramaId: string): Promise<Episode[]> {
  for (const path of PATHS.EPISODES) {
    for (const params of [{ id: dramaId }, { dramaId }, { videoId: dramaId }, { sid: dramaId }, { slug: dramaId }]) {
      const d = await api(`${BASE}${path}`, params)
      if (d) {
        const ea = findEps(d)
        if (ea.length > 0) return ea[0].map(toEp)
        const obj = d.data || d.result || d.list || d.episodes || d
        if (Array.isArray(obj) && obj.length > 0) return obj.map(toEp)
      }
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) { const ea = findEps(gd); if (ea.length > 0) return ea[0].map(toEp) }
    }
  }
  return []
}

export async function scrapeStream(dramaSlug: string, ep: number): Promise<StreamInfo> {
  const result: StreamInfo = { episodeUrl: '', streams: [] }
  const drama = await scrapeDramaDetail(dramaSlug)
  if (!drama) return result

  const episode = drama.episodeList.find(e => e.number === ep) || drama.episodeList[ep - 1]
  if (!episode) return result

  result.episodeUrl = episode.url
  if (episode.streamUrl) result.streams.push({ url: episode.streamUrl, type: episode.streamUrl.includes('.m3u8') ? 'hls' : 'mp4', quality: 'auto' })

  // API
  for (const path of PATHS.STREAM) {
    for (const params of [{ id: episode.number, dramaId: dramaSlug }, { episodeId: `${dramaSlug}_${ep}` }, { videoId: dramaSlug, episode: ep }]) {
      const d = await api(`${BASE}${path}`, params)
      if (d) for (const u of findStreams(d)) result.streams.push({ url: u, type: u.includes('.m3u8') ? 'hls' : 'mp4', quality: 'auto' })
    }
  }

  // Scrape page
  if (episode.url && result.streams.length === 0) {
    try {
      const raw = await html(episode.url)
      const ssr = extractSSR(raw)
      if (ssr) for (const u of findStreams(ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data)) result.streams.push({ url: u, type: u.includes('.m3u8') ? 'hls' : 'mp4', quality: 'auto' })
      for (const u of extractStreamsHTML(raw)) result.streams.push({ url: u, type: u.includes('.m3u8') ? 'hls' : 'mp4', quality: 'auto' })
    } catch { /* skip */ }
  }

  // Dedupe & sort
  const seen = new Set<string>()
  result.streams = result.streams.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true })
  result.streams.sort((a, b) => a.type === 'hls' ? -1 : b.type === 'hls' ? 1 : 0)

  return result
}

export async function scrapeSearch(query: string, page = 1) {
  for (const path of PATHS.SEARCH) {
    for (const params of [
      { keyword: query, page, pageSize: 20 }, { q: query, page, size: 20 },
      { search: query, page }, { query, page }, { key: query, page }, { wd: query, page },
    ]) {
      const pd = await api(`${BASE}${path}`, params)
      if (pd) { const a = findDramas(pd); if (a.length > 0) { const d = a[0].map(toCard).filter((x: DramaCard) => x.title); return { dramas: d, total: d.length, source: `POST ${path}` } } }
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      const gd = await api(`${BASE}${path}?${qs}`)
      if (gd) { const a = findDramas(gd); if (a.length > 0) { const d = a[0].map(toCard).filter((x: DramaCard) => x.title); return { dramas: d, total: d.length, source: `GET ${path}` } } }
    }
  }

  for (const u of [`${HOME}/search?q=${encodeURIComponent(query)}`, `${HOME}/search?keyword=${encodeURIComponent(query)}`, `${HOME}/search/${encodeURIComponent(query)}`, `${BASE}/search?q=${encodeURIComponent(query)}`]) {
    try {
      const raw = await html(u)
      const $ = cheerio.load(raw)
      const ssr = extractSSR(raw)
      let dramas: DramaCard[] = []
      if (ssr) { const root = ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data; for (const arr of findDramas(root)) dramas.push(...arr.map(toCard).filter((d: DramaCard) => d.title)) }
      if (dramas.length === 0) dramas = parseCards($)
      if (dramas.length > 0) return { dramas, total: dramas.length, source: u }
    } catch { continue }
  }

  return { dramas: [], total: 0, source: 'none' }
}

export async function discover() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: Record<string, any> = {}

  for (const [type, paths] of Object.entries(PATHS)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: Record<string, any> = {}
    for (const p of paths) {
      const u = `${BASE}${p}`
      const gd = await api(u)
      if (gd) r[`✅ GET ${p}`] = JSON.stringify(gd).slice(0, 300)
      const pd = await api(u, { page: 1, pageSize: 10 })
      if (pd) r[`✅ POST ${p}`] = JSON.stringify(pd).slice(0, 300)
    }
    results[type] = Object.keys(r).length > 0 ? r : '❌ none'
  }

  try {
    const raw = await html(HOME)
    const ssr = extractSSR(raw)
    const $ = cheerio.load(raw)
    const allLinks: string[] = []
    $('a[href]').each((_, el) => { const h = $(el).attr('href') || ''; if (h && !h.startsWith('#')) allLinks.push(h) })
    const dramaLinks = [...new Set(allLinks.filter(h => /\/(drama|detail|series|video|play|short|watch)\//i.test(h)))]

    results['SSR'] = {
      type: ssr?.type || 'none',
      buildId: ssr?.buildId || null,
      topKeys: ssr?.type === 'nextjs' ? Object.keys(ssr.data?.props?.pageProps || {}).slice(0, 20) : ssr ? Object.keys(ssr.data || {}).slice(0, 20) : [],
      dramaArrays: ssr ? findDramas(ssr.type === 'nextjs' ? ssr.data?.props?.pageProps : ssr.data).length : 0,
    }
    results['HTML'] = {
      totalLinks: allLinks.length,
      dramaLinks: dramaLinks.length,
      samples: dramaLinks.slice(0, 15),
    }
  } catch (e) { results['SSR'] = { error: String(e) } }

  return results
}
