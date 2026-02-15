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
    
    // Helper: Direct scrape any URL
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
            console.error('Error scraping URL:', url, error.message);
            return null;
        }
    }
    
    // Helper: Scrape Home
    async function scrapeHome() {
        const baseUrl = 'https://www.goodshort.com';
        const $ = await scrapeDirectUrl(`${baseUrl}/id`);
        
        if (!$) return [];
        
        const dramas = [];
        const seenUrls = new Set();
        
        // Strategi 1: Cari semua link dengan img
        $('a').each((i, elem) => {
            const $link = $(elem);
            const href = $link.attr('href') || '';
            const $img = $link.find('img').first();
            
            if (!$img.length || !href) return;
            
            const title = $link.attr('title') || 
                         $img.attr('alt') || 
                         $link.find('[class*="title"], [class*="name"]').text().trim() ||
                         $link.text().trim().substring(0, 100);
            
            if (!title || title.length < 3) return;
            
            const fullHref = href.startsWith('http') ? href : `${baseUrl}${href}`;
            
            if (seenUrls.has(fullHref)) return;
            seenUrls.add(fullHref);
            
            const thumbnail = $img.attr('src') || $img.attr('data-src') || '';
            
            dramas.push({
                id: href,
                title: title,
                url: fullHref,
                thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `${baseUrl}${thumbnail}` : ''),
                raw_href: href
            });
        });
        
        return dramas;
    }
    
    // Helper: Scrape Book/Drama Detail
    async function scrapeBookDetail(bookIdOrUrl) {
        const baseUrl = 'https://www.goodshort.com';
        
        // Jika sudah full URL, langsung gunakan
        let targetUrl = bookIdOrUrl;
        if (!bookIdOrUrl.startsWith('http')) {
            // Coba berbagai kemungkinan
            targetUrl = bookIdOrUrl.startsWith('/') ? `${baseUrl}${bookIdOrUrl}` : `${baseUrl}/id/${bookIdOrUrl}`;
        }
        
        const $ = await scrapeDirectUrl(targetUrl);
        
        if (!$) {
            // Coba URL alternatif jika gagal
            const altUrl = `${baseUrl}${bookIdOrUrl}`;
            const $alt = await scrapeDirectUrl(altUrl);
            if (!$alt) return null;
            return extractBookData($alt, altUrl, bookIdOrUrl);
        }
        
        return extractBookData($, targetUrl, bookIdOrUrl);
    }
    
    function extractBookData($, sourceUrl, originalId) {
        const baseUrl = 'https://www.goodshort.com';
        
        // Extract title
        const title = $('h1').first().text().trim() || 
                     $('meta[property="og:title"]').attr('content') || 
                     $('title').text().trim() || 
                     'Unknown';
        
        // Extract description
        const description = $('meta[property="og:description"]').attr('content') ||
                           $('meta[name="description"]').attr('content') ||
                           $('[class*="desc"], [class*="summary"], [class*="synopsis"]').first().text().trim() ||
                           $('p').first().text().trim() ||
                           '';
        
        // Extract thumbnail
        const thumbnail = $('meta[property="og:image"]').attr('content') ||
                         $('img').first().attr('src') ||
                         '';
        
        // Extract rating
        const rating = $('[class*="rating"], [class*="score"]').first().text().trim() || '';
        
        // Extract tags/genres
        const tags = [];
        $('[class*="tag"], [class*="genre"], [class*="category"] a, [class*="tag"] span').each((i, elem) => {
            const tag = $(elem).text().trim();
            if (tag && !tags.includes(tag)) {
                tags.push(tag);
            }
        });
        
        // Extract episodes/chapters
        const chapters = [];
        const seenChapterUrls = new Set();
        
        // Cari semua link yang mungkin episode
        $('a').each((i, elem) => {
            const $elem = $(elem);
            const href = $elem.attr('href') || '';
            const text = $elem.text().trim();
            
            // Filter hanya link episode
            const isEpisode = href.includes('/episode') || 
                            href.includes('/ep') || 
                            href.includes('/watch') ||
                            text.match(/episode|ep\s*\d+|part\s*\d+/i);
            
            if (!isEpisode || seenChapterUrls.has(href)) return;
            
            seenChapterUrls.add(href);
            
            // Extract episode number
            const numMatch = text.match(/\d+/);
            const episodeNum = numMatch ? parseInt(numMatch[0]) : chapters.length + 1;
            
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            
            chapters.push({
                id: href,
                chapter_number: episodeNum,
                title: text || `Episode ${episodeNum}`,
                url: fullUrl
            });
        });
        
        // Sort chapters
        chapters.sort((a, b) => a.chapter_number - b.chapter_number);
        
        return {
            id: originalId,
            title,
            description,
            thumbnail: thumbnail.startsWith('http') ? thumbnail : (thumbnail ? `${baseUrl}${thumbnail}` : ''),
            rating,
            tags,
            total_chapters: chapters.length,
            chapters,
            source_url: sourceUrl
        };
    }
    
    // Helper: Scrape Chapter/Episode Detail
    async function scrapeChapterDetail(chapterIdOrUrl) {
        const baseUrl = 'https://www.goodshort.com';
        
        let targetUrl = chapterIdOrUrl;
        if (!chapterIdOrUrl.startsWith('http')) {
            targetUrl = chapterIdOrUrl.startsWith('/') ? `${baseUrl}${chapterIdOrUrl}` : `${baseUrl}/id/episode/${chapterIdOrUrl}`;
        }
        
        const $ = await scrapeDirectUrl(targetUrl);
        
        if (!$) {
            const altUrl = `${baseUrl}${chapterIdOrUrl}`;
            const $alt = await scrapeDirectUrl(altUrl);
            if (!$alt) return null;
            return extractChapterData($alt, altUrl, chapterIdOrUrl);
        }
        
        return extractChapterData($, targetUrl, chapterIdOrUrl);
    }
    
    function extractChapterData($, sourceUrl, originalId) {
        const title = $('h1').first().text().trim() || 
                     $('h2').first().text().trim() || 
                     $('title').text().trim() || 
                     'Episode';
        
        const sources = [];
        
        // Method 1: Video tags
        $('video').each((i, video) => {
            const src = $(video).attr('src');
            if (src) sources.push({ type: 'video', quality: 'auto', url: src });
            
            $(video).find('source').each((j, source) => {
                const sourceSrc = $(source).attr('src');
                const quality = $(source).attr('label') || $(source).attr('res') || 'auto';
                if (sourceSrc) sources.push({ type: 'video', quality, url: sourceSrc });
            });
        });
        
        // Method 2: Iframes
        $('iframe').each((i, iframe) => {
            const src = $(iframe).attr('src');
            if (src) sources.push({ type: 'iframe', quality: 'auto', url: src });
        });
        
        // Method 3: Parse scripts untuk video URLs
        $('script').each((i, script) => {
            const content = $(script).html() || '';
            
            // Pattern untuk berbagai format video
            const patterns = [
                { regex: /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g, type: 'm3u8' },
                { regex: /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g, type: 'mp4' },
                { regex: /https?:\/\/[^\s"'<>]+\.webm[^\s"'<>]*/g, type: 'webm' },
                { regex: /"file"\s*:\s*"([^"]+)"/g, type: 'auto' },
                { regex: /"source"\s*:\s*"([^"]+)"/g, type: 'auto' },
                { regex: /"url"\s*:\s*"([^"]+)"/g, type: 'auto' },
                { regex: /src:\s*["']([^"']+)["']/g, type: 'auto' }
            ];
            
            patterns.forEach(({ regex, type }) => {
                let match;
                while ((match = regex.exec(content)) !== null) {
                    let url = match[1] || match[0];
                    // Clean up URL
                    url = url.replace(/^["']|["']$/g, '').trim();
                    
                    if (url.startsWith('http')) {
                        const finalType = type === 'auto' ? detectVideoType(url) : type;
                        sources.push({ type: finalType, quality: 'auto', url });
                    }
                }
            });
        });
        
        // Remove duplicates
        const uniqueSources = [];
        const seenUrls = new Set();
        sources.forEach(source => {
            if (!seenUrls.has(source.url)) {
                seenUrls.add(source.url);
                uniqueSources.push(source);
            }
        });
        
        return {
            id: originalId,
            title,
            total_sources: uniqueSources.length,
            sources: uniqueSources,
            source_url: sourceUrl
        };
    }
    
    function detectVideoType(url) {
        if (url.includes('.m3u8')) return 'm3u8';
        if (url.includes('.mp4')) return 'mp4';
        if (url.includes('.webm')) return 'webm';
        if (url.includes('.flv')) return 'flv';
        return 'video';
    }
    
    // Helper: Get M3U8 Stream
    async function getM3U8Stream(chapterId) {
        const chapterDetail = await scrapeChapterDetail(chapterId);
        
        if (!chapterDetail || !chapterDetail.sources.length) {
            return { id: chapterId, stream_url: null, error: 'Stream not found' };
        }
        
        // Prioritas: m3u8 > mp4 > video > iframe
        const priority = ['m3u8', 'mp4', 'webm', 'video', 'iframe'];
        
        for (const type of priority) {
            const source = chapterDetail.sources.find(s => s.type === type);
            if (source) {
                return {
                    id: chapterId,
                    stream_url: source.url,
                    type: source.type,
                    quality: source.quality
                };
            }
        }
        
        // Fallback: return first source
        return {
            id: chapterId,
            stream_url: chapterDetail.sources[0].url,
            type: chapterDetail.sources[0].type,
            quality: chapterDetail.sources[0].quality
        };
    }
    
    // Parse URL
    const { url } = req;
    const urlParts = url.split('?')[0].split('/').filter(Boolean);
    
    try {
        // Route: GET /
        if (url === '/' || url === '') {
            return res.status(200).json({
                service: 'GoodShort API',
                version: '3.0',
                endpoints: {
                    'GET /nav': 'Navigation menu',
                    'GET /home': 'Get all dramas with URLs',
                    'GET /search?q={query}': 'Search dramas',
                    'GET /hot': 'Trending dramas',
                    'GET /book/{url}': 'Drama detail - Use raw_href from /home',
                    'GET /chapters/{url}': 'Chapters list',
                    'GET /play/{url}': 'Play chapter',
                    'GET /m3u8/{url}': 'Get stream URL'
                },
                usage: 'Use "raw_href" or "url" from /home response as parameter',
                example: '/book/id/drama/31001241758 or /book/31001241758'
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
            const dramas = await scrapeHome();
            return res.status(200).json({
                status: 'success',
                total: dramas.length,
                data: dramas
            });
        }
        
        // Route: GET /search
        if (urlParts[0] === 'search') {
            const query = req.query.q || '';
            if (!query) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" required'
                });
            }
            
            const allDramas = await scrapeHome();
            const results = allDramas.filter(d => 
                d.title.toLowerCase().includes(query.toLowerCase())
            );
            
            return res.status(200).json({
                status: 'success',
                query,
                total: results.length,
                data: results
            });
        }
        
        // Route: GET /hot
        if (urlParts[0] === 'hot') {
            const dramas = await scrapeHome();
            return res.status(200).json({
                status: 'success',
                total: dramas.slice(0, 10).length,
                data: dramas.slice(0, 10)
            });
        }
        
        // Route: GET /book/*
        if (urlParts[0] === 'book' && urlParts.length > 1) {
            // Ambil semua path setelah /book/
            const bookPath = url.split('/book/')[1].split('?')[0];
            const bookDetail = await scrapeBookDetail(bookPath);
            
            if (!bookDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found',
                    tried_path: bookPath
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: bookDetail
            });
        }
        
        // Route: GET /chapters/*
        if (urlParts[0] === 'chapters' && urlParts.length > 1) {
            const bookPath = url.split('/chapters/')[1].split('?')[0];
            const bookDetail = await scrapeBookDetail(bookPath);
            
            if (!bookDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                book_title: bookDetail.title,
                total: bookDetail.chapters.length,
                data: bookDetail.chapters
            });
        }
        
        // Route: GET /play/*
        if (urlParts[0] === 'play' && urlParts.length > 1) {
            const chapterPath = url.split('/play/')[1].split('?')[0];
            const chapterDetail = await scrapeChapterDetail(chapterPath);
            
            if (!chapterDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chapter not found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: chapterDetail
            });
        }
        
        // Route: GET /m3u8/*
        if (urlParts[0] === 'm3u8' && urlParts.length > 1) {
            const chapterPath = url.split('/m3u8/')[1].split('?')[0];
            const streamData = await getM3U8Stream(chapterPath);
            
            if (streamData.error) {
                return res.status(404).json({
                    status: 'error',
                    message: streamData.error
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: streamData
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
            message: error.message,
            stack: error.stack
        });
    }
}
