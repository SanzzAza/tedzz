export default async function handler(req, res) {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    const GOODSHORT_BASE = 'https://www.goodshort.com';
    
    // Fetch dengan retry
    async function fetchWithRetry(url, retries = 3) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': GOODSHORT_BASE,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };
        
        for (let i = 0; i < retries; i++) {
            try {
                console.log(`[${i + 1}/${retries}] Fetching: ${url}`);
                
                const response = await axios.get(url, {
                    headers,
                    timeout: 30000,
                    maxRedirects: 5,
                    validateStatus: (status) => status < 500
                });
                
                console.log(`Response status: ${response.status}`);
                
                if (response.status === 200) {
                    return response.data;
                }
                
                if (response.status === 404) {
                    return null;
                }
                
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error.message);
                if (i === retries - 1) {
                    return null;
                }
                // Wait sebelum retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return null;
    }
    
    // Scrape Home
    async function scrapeHome(lang = 'id') {
        const html = await fetchWithRetry(`${GOODSHORT_BASE}/${lang}`);
        if (!html) return [];
        
        const $ = cheerio.load(html);
        const dramas = [];
        const seenIds = new Set();
        
        // Cari semua elemen yang punya link + gambar
        $('a').each((i, elem) => {
            const $a = $(elem);
            const href = $a.attr('href');
            
            if (!href) return;
            
            // Extract ID dari href (format: /id/31001241758 atau /31001241758)
            const idMatch = href.match(/\/(\d{10,})/);
            if (!idMatch) return;
            
            const id = idMatch[1];
            if (seenIds.has(id)) return;
            
            // Cari gambar di dalam link
            const $img = $a.find('img').first();
            if (!$img.length) return;
            
            seenIds.add(id);
            
            const title = $a.attr('title') || 
                         $img.attr('alt') || 
                         $a.text().trim() ||
                         'Untitled';
            
            const thumbnail = $img.attr('src') || $img.attr('data-src') || '';
            
            dramas.push({
                id: id,
                title: title.substring(0, 100),
                url: `${GOODSHORT_BASE}${href}`,
                thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `${GOODSHORT_BASE}${thumbnail}` : ''),
                lang: lang
            });
        });
        
        console.log(`Scraped ${dramas.length} dramas from home`);
        return dramas;
    }
    
    // Scrape Book Detail
    async function scrapeBookDetail(bookId, lang = 'id') {
        // Try different URL patterns
        const patterns = [
            `/${lang}/${bookId}`,
            `/${bookId}`,
            `/${lang}/drama/${bookId}`,
            `/drama/${bookId}`
        ];
        
        let html = null;
        let workingUrl = null;
        
        for (const pattern of patterns) {
            const url = `${GOODSHORT_BASE}${pattern}`;
            html = await fetchWithRetry(url);
            
            if (html) {
                workingUrl = url;
                console.log(`Book found at: ${url}`);
                break;
            }
        }
        
        if (!html) {
            console.log(`Book ${bookId} not found in any pattern`);
            return null;
        }
        
        const $ = cheerio.load(html);
        
        // Extract title
        const title = $('h1').first().text().trim() ||
                     $('meta[property="og:title"]').attr('content') ||
                     $('title').text().split('|')[0].split('-')[0].trim();
        
        if (!title || title.length < 2) {
            console.log('No valid title found');
            return null;
        }
        
        // Extract data
        const description = $('meta[property="og:description"]').attr('content') ||
                           $('meta[name="description"]').attr('content') ||
                           $('[class*="intro"], [class*="desc"], [class*="summary"]').first().text().trim() ||
                           '';
        
        const thumbnail = $('meta[property="og:image"]').attr('content') ||
                         $('img').first().attr('src') ||
                         '';
        
        // Extract tags/labels
        const tags = [];
        $('[class*="tag"], [class*="label"], [class*="genre"]').each((i, elem) => {
            const tag = $(elem).text().trim();
            if (tag && tag.length > 1 && tag.length < 50 && !tags.includes(tag)) {
                tags.push(tag);
            }
        });
        
        // Extract chapters/episodes
        const chapters = [];
        const seenChapterIds = new Set();
        
        // Strategi 1: Cari dari list episode
        $('[class*="episode"], [class*="chapter"], [class*="list"]').find('a').each((i, elem) => {
            const $a = $(elem);
            const href = $a.attr('href');
            
            if (!href) return;
            
            const chapterIdMatch = href.match(/\/(\d{10,})/);
            if (!chapterIdMatch) return;
            
            const chapterId = chapterIdMatch[1];
            if (seenChapterIds.has(chapterId)) return;
            
            seenChapterIds.add(chapterId);
            
            const chapterTitle = $a.text().trim() || `Episode ${chapters.length + 1}`;
            const chapterNum = chapterTitle.match(/\d+/);
            
            chapters.push({
                id: chapterId,
                chapter_number: chapterNum ? parseInt(chapterNum[0]) : chapters.length + 1,
                title: chapterTitle,
                url: `${GOODSHORT_BASE}${href}`,
                lang: lang
            });
        });
        
        // Strategi 2: Cari semua link yang kemungkinan episode
        if (chapters.length === 0) {
            $('a').each((i, elem) => {
                const $a = $(elem);
                const href = $a.attr('href');
                const text = $a.text().trim();
                
                if (!href) return;
                
                // Cek apakah text mengandung episode/ep
                if (!text.match(/episode|ep\.?\s*\d+|part\s*\d+/i)) return;
                
                const chapterIdMatch = href.match(/\/(\d{10,})/);
                if (!chapterIdMatch) return;
                
                const chapterId = chapterIdMatch[1];
                if (chapterId === bookId) return; // Skip jika sama dengan book ID
                if (seenChapterIds.has(chapterId)) return;
                
                seenChapterIds.add(chapterId);
                
                const chapterNum = text.match(/\d+/);
                
                chapters.push({
                    id: chapterId,
                    chapter_number: chapterNum ? parseInt(chapterNum[0]) : chapters.length + 1,
                    title: text,
                    url: `${GOODSHORT_BASE}${href}`,
                    lang: lang
                });
            });
        }
        
        // Sort chapters
        chapters.sort((a, b) => a.chapter_number - b.chapter_number);
        
        console.log(`Found ${chapters.length} chapters for book ${bookId}`);
        
        return {
            id: bookId,
            lang: lang,
            title: title,
            description: description,
            thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `${GOODSHORT_BASE}${thumbnail}` : ''),
            tags: tags,
            total_chapters: chapters.length,
            chapters: chapters,
            source_url: workingUrl
        };
    }
    
    // Scrape Chapter/Episode
    async function scrapeChapter(chapterId, lang = 'id') {
        const patterns = [
            `/${lang}/${chapterId}`,
            `/${chapterId}`,
            `/${lang}/episode/${chapterId}`,
            `/episode/${chapterId}`,
            `/${lang}/watch/${chapterId}`,
            `/watch/${chapterId}`
        ];
        
        let html = null;
        let workingUrl = null;
        
        for (const pattern of patterns) {
            const url = `${GOODSHORT_BASE}${pattern}`;
            html = await fetchWithRetry(url);
            
            if (html) {
                workingUrl = url;
                console.log(`Chapter found at: ${url}`);
                break;
            }
        }
        
        if (!html) {
            console.log(`Chapter ${chapterId} not found`);
            return null;
        }
        
        const $ = cheerio.load(html);
        
        const title = $('h1').first().text().trim() ||
                     $('title').text().trim() ||
                     `Episode ${chapterId}`;
        
        const sources = [];
        const seenUrls = new Set();
        
        // Method 1: Video tags
        $('video').each((i, video) => {
            const src = $(video).attr('src');
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                sources.push({
                    type: 'video',
                    quality: 'auto',
                    url: src.startsWith('http') ? src : `${GOODSHORT_BASE}${src}`
                });
            }
            
            $(video).find('source').each((j, source) => {
                const srcUrl = $(source).attr('src');
                const quality = $(source).attr('label') || $(source).attr('res') || 'auto';
                if (srcUrl && !seenUrls.has(srcUrl)) {
                    seenUrls.add(srcUrl);
                    sources.push({
                        type: 'video',
                        quality: quality,
                        url: srcUrl.startsWith('http') ? srcUrl : `${GOODSHORT_BASE}${srcUrl}`
                    });
                }
            });
        });
        
        // Method 2: Iframes
        $('iframe').each((i, iframe) => {
            const src = $(iframe).attr('src');
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                sources.push({
                    type: 'iframe',
                    quality: 'auto',
                    url: src.startsWith('http') ? src : `${GOODSHORT_BASE}${src}`
                });
            }
        });
        
        // Method 3: Extract dari script tags
        const scriptContent = $('script').map((i, elem) => $(elem).html()).get().join('\n');
        
        // Pattern untuk m3u8 dan mp4
        const videoRegex = [
            /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi,
            /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/gi,
            /"file"\s*:\s*"([^"]+)"/gi,
            /"source"\s*:\s*"([^"]+)"/gi,
            /"url"\s*:\s*"([^"]+)"/gi,
            /videoUrl\s*[:=]\s*["']([^"']+)["']/gi,
            /playUrl\s*[:=]\s*["']([^"']+)["']/gi
        ];
        
        videoRegex.forEach(regex => {
            let match;
            while ((match = regex.exec(scriptContent)) !== null) {
                let url = match[1];
                
                if (!url || !url.startsWith('http')) continue;
                if (seenUrls.has(url)) continue;
                
                seenUrls.add(url);
                
                const type = url.includes('.m3u8') ? 'm3u8' : 
                            url.includes('.mp4') ? 'mp4' : 
                            'video';
                
                sources.push({
                    type: type,
                    quality: 'auto',
                    url: url
                });
            }
        });
        
        console.log(`Found ${sources.length} video sources for chapter ${chapterId}`);
        
        return {
            id: chapterId,
            lang: lang,
            title: title,
            total_sources: sources.length,
            sources: sources,
            source_url: workingUrl
        };
    }
    
    // Routes
    const { url, query } = req;
    const pathname = url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    
    try {
        // GET /
        if (parts.length === 0) {
            return res.json({
                service: 'GoodShort Scraper API',
                version: '7.0',
                type: 'Web Scraping',
                source: 'https://www.goodshort.com',
                status: 'online',
                endpoints: {
                    'GET /nav': 'Navigation',
                    'GET /home?lang=id': 'Scrape home page for drama list',
                    'GET /search?q=keyword&lang=id': 'Search dramas',
                    'GET /hot?lang=id': 'Hot dramas (same as home)',
                    'GET /book/{bookId}?lang=id': 'Scrape book detail from goodshort.com',
                    'GET /chapters/{bookId}?lang=id': 'Get chapters only',
                    'GET /play/{chapterId}?lang=id': 'Scrape chapter page for video sources',
                    'GET /m3u8/{chapterId}?lang=id': 'Get best video stream URL'
                },
                note: 'Direct scraping from goodshort.com website',
                example: '/book/31001241758?lang=id'
            });
        }
        
        // GET /nav
        if (parts[0] === 'nav') {
            return res.json({
                status: 'success',
                data: [
                    { id: 'home', title: 'Home', path: '/home' },
                    { id: 'hot', title: 'Hot', path: '/hot' },
                    { id: 'search', title: 'Search', path: '/search' }
                ]
            });
        }
        
        // GET /home
        if (parts[0] === 'home') {
            const lang = query.lang || 'id';
            const dramas = await scrapeHome(lang);
            
            return res.json({
                status: 'success',
                lang: lang,
                total: dramas.length,
                data: dramas
            });
        }
        
        // GET /search
        if (parts[0] === 'search') {
            const q = query.q || '';
            const lang = query.lang || 'id';
            
            if (!q) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" required'
                });
            }
            
            const all = await scrapeHome(lang);
            const results = all.filter(d => d.title.toLowerCase().includes(q.toLowerCase()));
            
            return res.json({
                status: 'success',
                query: q,
                lang: lang,
                total: results.length,
                data: results
            });
        }
        
        // GET /hot
        if (parts[0] === 'hot') {
            const lang = query.lang || 'id';
            const dramas = await scrapeHome(lang);
            
            return res.json({
                status: 'success',
                lang: lang,
                total: dramas.slice(0, 10).length,
                data: dramas.slice(0, 10)
            });
        }
        
        // GET /book/:bookId
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'id';
            
            const book = await scrapeBookDetail(bookId, lang);
            
            if (!book) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found on goodshort.com',
                    book_id: bookId,
                    lang: lang
                });
            }
            
            return res.json({
                status: 'success',
                data: book
            });
        }
        
        // GET /chapters/:bookId
        if (parts[0] === 'chapters' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'id';
            
            const book = await scrapeBookDetail(bookId, lang);
            
            if (!book) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            return res.json({
                status: 'success',
                book_id: bookId,
                book_title: book.title,
                lang: lang,
                total: book.chapters.length,
                data: book.chapters
            });
        }
        
        // GET /play/:chapterId
        if (parts[0] === 'play' && parts[1]) {
            const chapterId = parts[1];
            const lang = query.lang || 'id';
            
            const chapter = await scrapeChapter(chapterId, lang);
            
            if (!chapter) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chapter not found on goodshort.com',
                    chapter_id: chapterId
                });
            }
            
            return res.json({
                status: 'success',
                data: chapter
            });
        }
        
        // GET /m3u8/:chapterId
        if (parts[0] === 'm3u8' && parts[1]) {
            const chapterId = parts[1];
            const lang = query.lang || 'id';
            
            const chapter = await scrapeChapter(chapterId, lang);
            
            if (!chapter || chapter.sources.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No video sources found'
                });
            }
            
            // Priority: m3u8 > mp4 > video
            const m3u8 = chapter.sources.find(s => s.type === 'm3u8');
            const mp4 = chapter.sources.find(s => s.type === 'mp4');
            const best = m3u8 || mp4 || chapter.sources[0];
            
            return res.json({
                status: 'success',
                data: {
                    id: chapterId,
                    stream_url: best.url,
                    type: best.type,
                    quality: best.quality,
                    all_sources: chapter.sources
                }
            });
        }
        
        return res.status(404).json({
            status: 'error',
            message: 'Endpoint not found',
            path: pathname
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
}
