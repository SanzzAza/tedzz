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
    
    // Helper: Direct scrape
    async function scrapeDirectUrl(url) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
            'Referer': 'https://www.goodshort.com/'
        };
        
        try {
            const response = await axios.get(url, { 
                headers, 
                timeout: 20000,
                maxRedirects: 5
            });
            
            return cheerio.load(response.data);
        } catch (error) {
            console.error('Error scraping:', url, error.message);
            return null;
        }
    }
    
    // Helper: Scrape Home
    async function scrapeHome(lang = 'id') {
        const baseUrl = 'https://www.goodshort.com';
        const $ = await scrapeDirectUrl(`${baseUrl}/${lang}`);
        
        if (!$) return [];
        
        const dramas = [];
        const seenIds = new Set();
        
        $('a').each((i, elem) => {
            const $link = $(elem);
            const href = $link.attr('href') || '';
            const $img = $link.find('img').first();
            
            if (!$img.length || !href) return;
            
            const title = $link.attr('title') || 
                         $img.attr('alt') || 
                         $link.text().trim();
            
            if (!title || title.length < 3) return;
            
            // Extract ID dari URL
            // Format: /id/drama/31001241758 atau /drama/31001241758
            const idMatch = href.match(/\/(\d+)/);
            const id = idMatch ? idMatch[1] : null;
            
            if (!id || seenIds.has(id)) return;
            seenIds.add(id);
            
            const thumbnail = $img.attr('src') || $img.attr('data-src') || '';
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            
            dramas.push({
                id: id,
                title: title,
                url: fullUrl,
                thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `${baseUrl}${thumbnail}` : ''),
                lang: lang
            });
        });
        
        return dramas;
    }
    
    // Helper: Scrape Book Detail
    async function scrapeBookDetail(id, lang = 'id') {
        const baseUrl = 'https://www.goodshort.com';
        
        // Coba berbagai kemungkinan URL pattern
        const possibleUrls = [
            `${baseUrl}/${lang}/drama/${id}`,
            `${baseUrl}/drama/${id}`,
            `${baseUrl}/${lang}/series/${id}`,
            `${baseUrl}/series/${id}`,
            `${baseUrl}/${lang}/video/${id}`,
            `${baseUrl}/video/${id}`
        ];
        
        for (const url of possibleUrls) {
            const $ = await scrapeDirectUrl(url);
            if ($) {
                const data = extractBookData($, url, id, lang);
                if (data && data.title !== 'Unknown') {
                    return data;
                }
            }
        }
        
        return null;
    }
    
    function extractBookData($, sourceUrl, id, lang) {
        const baseUrl = 'https://www.goodshort.com';
        
        const title = $('h1').first().text().trim() || 
                     $('meta[property="og:title"]').attr('content') || 
                     $('title').text().split('-')[0].trim() ||
                     'Unknown';
        
        if (title === 'Unknown' || title === '') return null;
        
        const description = $('meta[property="og:description"]').attr('content') ||
                           $('meta[name="description"]').attr('content') ||
                           $('[class*="desc"], [class*="summary"], [class*="intro"]').first().text().trim() ||
                           '';
        
        const thumbnail = $('meta[property="og:image"]').attr('content') ||
                         $('img[class*="cover"], img[class*="poster"]').first().attr('src') ||
                         $('img').first().attr('src') ||
                         '';
        
        // Extract additional info
        const author = $('[class*="author"]').first().text().trim() || '';
        const status = $('[class*="status"]').first().text().trim() || '';
        const rating = $('[class*="rating"], [class*="score"]').first().text().trim() || '';
        const views = $('[class*="view"], [class*="read"]').first().text().trim() || '';
        
        // Extract tags
        const tags = [];
        $('[class*="tag"], [class*="genre"], [class*="category"] a, [class*="label"]').each((i, elem) => {
            const tag = $(elem).text().trim();
            if (tag && tag.length > 1 && !tags.includes(tag)) {
                tags.push(tag);
            }
        });
        
        // Extract chapters/episodes
        const chapters = [];
        const seenChapterIds = new Set();
        
        $('a').each((i, elem) => {
            const $elem = $(elem);
            const href = $elem.attr('href') || '';
            const text = $elem.text().trim();
            
            // Filter episode links
            const isEpisode = href.includes('/episode') || 
                            href.includes('/ep') || 
                            href.includes('/watch') ||
                            text.match(/episode|ep\s*\d+|part\s*\d+|chapter\s*\d+/i);
            
            if (!isEpisode) return;
            
            // Extract chapter ID
            const chapterIdMatch = href.match(/\/(\d+)/);
            const chapterId = chapterIdMatch ? chapterIdMatch[1] : null;
            
            if (!chapterId || seenChapterIds.has(chapterId)) return;
            seenChapterIds.add(chapterId);
            
            // Extract episode number
            const numMatch = text.match(/\d+/);
            const episodeNum = numMatch ? parseInt(numMatch[0]) : chapters.length + 1;
            
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            
            chapters.push({
                id: chapterId,
                chapter_number: episodeNum,
                title: text || `Episode ${episodeNum}`,
                url: fullUrl,
                lang: lang
            });
        });
        
        // Sort chapters by number
        chapters.sort((a, b) => a.chapter_number - b.chapter_number);
        
        return {
            id: id,
            lang: lang,
            title,
            description,
            thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `${baseUrl}${thumbnail}` : ''),
            author,
            status,
            rating,
            views,
            tags,
            total_chapters: chapters.length,
            chapters,
            source_url: sourceUrl
        };
    }
    
    // Helper: Scrape Chapter Detail
    async function scrapeChapterDetail(chapterId, lang = 'id') {
        const baseUrl = 'https://www.goodshort.com';
        
        const possibleUrls = [
            `${baseUrl}/${lang}/episode/${chapterId}`,
            `${baseUrl}/episode/${chapterId}`,
            `${baseUrl}/${lang}/ep/${chapterId}`,
            `${baseUrl}/ep/${chapterId}`,
            `${baseUrl}/${lang}/watch/${chapterId}`,
            `${baseUrl}/watch/${chapterId}`
        ];
        
        for (const url of possibleUrls) {
            const $ = await scrapeDirectUrl(url);
            if ($) {
                const data = extractChapterData($, url, chapterId, lang);
                if (data && data.sources.length > 0) {
                    return data;
                }
            }
        }
        
        return null;
    }
    
    function extractChapterData($, sourceUrl, chapterId, lang) {
        const title = $('h1').first().text().trim() || 
                     $('h2').first().text().trim() || 
                     $('title').text().trim() || 
                     `Episode ${chapterId}`;
        
        const sources = [];
        const seenUrls = new Set();
        
        // Method 1: Video tags
        $('video').each((i, video) => {
            const src = $(video).attr('src');
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                sources.push({ type: 'video', quality: 'auto', url: src });
            }
            
            $(video).find('source').each((j, source) => {
                const sourceSrc = $(source).attr('src');
                const quality = $(source).attr('label') || $(source).attr('res') || 'auto';
                if (sourceSrc && !seenUrls.has(sourceSrc)) {
                    seenUrls.add(sourceSrc);
                    sources.push({ type: 'video', quality, url: sourceSrc });
                }
            });
        });
        
        // Method 2: Iframes
        $('iframe').each((i, iframe) => {
            const src = $(iframe).attr('src');
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                sources.push({ type: 'iframe', quality: 'auto', url: src });
            }
        });
        
        // Method 3: Script parsing
        $('script').each((i, script) => {
            const content = $(script).html() || '';
            
            const patterns = [
                { regex: /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g, type: 'm3u8' },
                { regex: /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g, type: 'mp4' },
                { regex: /"file"\s*:\s*"([^"]+)"/g, type: 'auto' },
                { regex: /"source"\s*:\s*"([^"]+)"/g, type: 'auto' },
                { regex: /"url"\s*:\s*"([^"]+)"/g, type: 'auto' }
            ];
            
            patterns.forEach(({ regex, type }) => {
                let match;
                while ((match = regex.exec(content)) !== null) {
                    let url = match[1] || match[0];
                    url = url.replace(/^["']|["']$/g, '').trim();
                    
                    if (url.startsWith('http') && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        const finalType = type === 'auto' ? detectVideoType(url) : type;
                        sources.push({ type: finalType, quality: 'auto', url });
                    }
                }
            });
        });
        
        return {
            id: chapterId,
            lang: lang,
            title,
            total_sources: sources.length,
            sources,
            source_url: sourceUrl
        };
    }
    
    function detectVideoType(url) {
        if (url.includes('.m3u8')) return 'm3u8';
        if (url.includes('.mp4')) return 'mp4';
        if (url.includes('.webm')) return 'webm';
        return 'video';
    }
    
    // Parse URL and query params
    const { url, query } = req;
    const urlParts = url.split('?')[0].split('/').filter(Boolean);
    
    try {
        // Route: GET /
        if (url === '/' || url === '' || urlParts.length === 0) {
            return res.status(200).json({
                service: 'GoodShort API',
                version: '4.0',
                endpoints: {
                    'GET /nav': 'Navigation menu',
                    'GET /home?lang={lang}': 'Get dramas (default lang=id)',
                    'GET /search?q={query}&lang={lang}': 'Search dramas',
                    'GET /hot?lang={lang}': 'Trending dramas',
                    'GET /book/{id}?lang={lang}': 'Drama detail by ID',
                    'GET /chapters/{id}?lang={lang}': 'Get chapters by drama ID',
                    'GET /play/{chapterId}?lang={lang}': 'Play chapter',
                    'GET /m3u8/{chapterId}?lang={lang}': 'Get stream URL'
                },
                usage: {
                    lang: 'Language code (id, en, etc)',
                    id: 'Drama ID number (e.g., 31001241758)',
                    chapterId: 'Chapter/Episode ID'
                },
                example: 'GET /book/31001241758?lang=id'
            });
        }
        
        // Route: GET /nav
        if (urlParts[0] === 'nav') {
            return res.status(200).json({
                status: 'success',
                data: [
                    { id: 'home', title: 'Home', url: '/home' },
                    { id: 'hot', title: 'Trending', url: '/hot' },
                    { id: 'search', title: 'Search', url: '/search' }
                ]
            });
        }
        
        // Route: GET /home
        if (urlParts[0] === 'home') {
            const lang = query.lang || 'id';
            const dramas = await scrapeHome(lang);
            return res.status(200).json({
                status: 'success',
                lang: lang,
                total: dramas.length,
                data: dramas
            });
        }
        
        // Route: GET /search
        if (urlParts[0] === 'search') {
            const q = query.q || '';
            const lang = query.lang || 'id';
            
            if (!q) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" required'
                });
            }
            
            const allDramas = await scrapeHome(lang);
            const results = allDramas.filter(d => 
                d.title.toLowerCase().includes(q.toLowerCase())
            );
            
            return res.status(200).json({
                status: 'success',
                query: q,
                lang: lang,
                total: results.length,
                data: results
            });
        }
        
        // Route: GET /hot
        if (urlParts[0] === 'hot') {
            const lang = query.lang || 'id';
            const dramas = await scrapeHome(lang);
            return res.status(200).json({
                status: 'success',
                lang: lang,
                total: dramas.slice(0, 10).length,
                data: dramas.slice(0, 10)
            });
        }
        
        // Route: GET /book/:id
        if (urlParts[0] === 'book' && urlParts[1]) {
            const id = urlParts[1];
            const lang = query.lang || 'id';
            
            const bookDetail = await scrapeBookDetail(id, lang);
            
            if (!bookDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found',
                    id: id,
                    lang: lang
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: bookDetail
            });
        }
        
        // Route: GET /chapters/:id
        if (urlParts[0] === 'chapters' && urlParts[1]) {
            const id = urlParts[1];
            const lang = query.lang || 'id';
            
            const bookDetail = await scrapeBookDetail(id, lang);
            
            if (!bookDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                book_id: id,
                book_title: bookDetail.title,
                lang: lang,
                total: bookDetail.chapters.length,
                data: bookDetail.chapters
            });
        }
        
        // Route: GET /play/:chapterId
        if (urlParts[0] === 'play' && urlParts[1]) {
            const chapterId = urlParts[1];
            const lang = query.lang || 'id';
            
            const chapterDetail = await scrapeChapterDetail(chapterId, lang);
            
            if (!chapterDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chapter not found',
                    chapter_id: chapterId,
                    lang: lang
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: chapterDetail
            });
        }
        
        // Route: GET /m3u8/:chapterId
        if (urlParts[0] === 'm3u8' && urlParts[1]) {
            const chapterId = urlParts[1];
            const lang = query.lang || 'id';
            
            const chapterDetail = await scrapeChapterDetail(chapterId, lang);
            
            if (!chapterDetail || chapterDetail.sources.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Stream not found'
                });
            }
            
            // Prioritize m3u8
            const m3u8 = chapterDetail.sources.find(s => s.type === 'm3u8');
            const stream = m3u8 || chapterDetail.sources[0];
            
            return res.status(200).json({
                status: 'success',
                data: {
                    id: chapterId,
                    stream_url: stream.url,
                    type: stream.type,
                    quality: stream.quality,
                    all_sources: chapterDetail.sources
                }
            });
        }
        
        return res.status(404).json({
            status: 'error',
            message: 'Endpoint not found',
            requested_url: url
        });
        
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
}
