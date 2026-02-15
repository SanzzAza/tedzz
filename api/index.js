const https = require('https');
const http = require('http');

// Helper untuk fetch HTML
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'https://www.goodshort.com/',
                'Cache-Control': 'no-cache'
            }
        };
        
        client.get(url, options, (res) => {
            let data = '';
            
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                return resolve(fetchHTML(res.headers.location));
            }
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            console.error('Fetch error:', err);
            resolve('');
        });
    });
}

// Extract dramas dari home
function extractDramas(html) {
    const dramas = [];
    const seenIds = new Set();
    
    // Find all drama IDs (10+ digits)
    const idRegex = /\/(\d{10,})/g;
    let match;
    
    while ((match = idRegex.exec(html)) !== null) {
        const dramaId = match[1];
        
        if (seenIds.has(dramaId)) continue;
        seenIds.add(dramaId);
        
        // Find context around this ID
        const idIndex = match.index;
        const contextStart = Math.max(0, idIndex - 1500);
        const contextEnd = Math.min(html.length, idIndex + 1500);
        const context = html.substring(contextStart, contextEnd);
        
        // Extract title - multiple patterns
        let title = '';
        const titlePatterns = [
            /alt="([^"]+)"/,
            /title="([^"]+)"/,
            /class="[^"]*title[^"]*">([^<]+)</,
            />([^<]{3,100})</
        ];
        
        for (const pattern of titlePatterns) {
            const titleMatch = pattern.exec(context);
            if (titleMatch) {
                title = titleMatch[1].trim();
                if (title.length > 2 && !title.match(/^\d+$/)) {
                    break;
                }
            }
        }
        
        if (!title) {
            title = `Drama ${dramaId}`;
        }
        
        // Extract thumbnail - multiple patterns
        let thumbnail = '';
        const imgPatterns = [
            /data-src="([^"]+)"/,
            /data-original="([^"]+)"/,
            /data-lazy="([^"]+)"/,
            /src="([^"]+\.(?:jpg|jpeg|png|webp))"/i,
            /background-image:\s*url\(["']?([^"')]+)["']?\)/
        ];
        
        for (const pattern of imgPatterns) {
            const imgMatch = pattern.exec(context);
            if (imgMatch) {
                thumbnail = imgMatch[1];
                // Skip placeholder images
                if (!thumbnail.includes('default-book-cover') && !thumbnail.includes('logo.png')) {
                    break;
                }
            }
        }
        
        // Clean URLs
        const url = `https://www.goodshort.com/id/${dramaId}`;
        
        if (thumbnail) {
            if (thumbnail.startsWith('//')) {
                thumbnail = 'https:' + thumbnail;
            } else if (!thumbnail.startsWith('http')) {
                thumbnail = 'https://www.goodshort.com' + (thumbnail.startsWith('/') ? '' : '/') + thumbnail;
            }
        }
        
        dramas.push({
            id: dramaId,
            title: title.substring(0, 200),
            url: url,
            thumbnail: thumbnail || 'https://www.goodshort.com/default.jpg'
        });
        
        // Limit to avoid timeout
        if (dramas.length >= 50) break;
    }
    
    return dramas;
}

// Extract book detail
function extractBookDetail(html, bookId) {
    // Title
    let title = '';
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) || 
                       html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
    if (titleMatch) {
        title = titleMatch[1].split('|')[0].split('-')[0].trim();
    }
    
    if (!title || title.length < 2) {
        return null;
    }
    
    // Description
    let description = '';
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
    if (descMatch) {
        description = descMatch[1];
    }
    
    // Thumbnail
    let thumbnail = '';
    const thumbMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/) ||
                      html.match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/);
    if (thumbMatch) {
        thumbnail = thumbMatch[1];
        if (!thumbnail.startsWith('http')) {
            if (thumbnail.startsWith('//')) {
                thumbnail = 'https:' + thumbnail;
            } else {
                thumbnail = 'https://www.goodshort.com' + thumbnail;
            }
        }
    }
    
    // Tags
    const tags = [];
    const tagRegex = /class="[^"]*(?:tag|label|genre)[^"]*">([^<]+)</g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
        const tag = tagMatch[1].trim();
        if (tag.length > 1 && tag.length < 50 && !tags.includes(tag)) {
            tags.push(tag);
            if (tags.length >= 10) break;
        }
    }
    
    // Chapters
    const chapters = [];
    const seenChapterIds = new Set();
    
    // Find all episode links
    const epRegex = /<a[^>]*href="([^"]*?\/(\d{10,})[^"]*)"[^>]*>([^<]*(?:episode|Episode|Ep|ep|Part|Chapter)[^<]*)<\/a>/gi;
    let epMatch;
    
    while ((epMatch = epRegex.exec(html)) !== null) {
        const chUrl = epMatch[1];
        const chId = epMatch[2];
        const chTitle = epMatch[3].trim();
        
        if (chId === bookId || seenChapterIds.has(chId)) {
            continue;
        }
        
        seenChapterIds.add(chId);
        
        // Extract episode number
        const numMatch = chTitle.match(/\d+/);
        const epNum = numMatch ? parseInt(numMatch[0]) : chapters.length + 1;
        
        const fullUrl = chUrl.startsWith('http') ? chUrl : 'https://www.goodshort.com' + chUrl;
        
        chapters.push({
            id: chId,
            chapter_number: epNum,
            title: chTitle || `Episode ${epNum}`,
            url: fullUrl
        });
    }
    
    // If no episodes found with text, try finding all different IDs
    if (chapters.length === 0) {
        const allIdRegex = /href="[^"]*?\/(\d{10,})[^"]*"/g;
        let idMatch;
        
        while ((idMatch = allIdRegex.exec(html)) !== null) {
            const chId = idMatch[1];
            
            if (chId === bookId || seenChapterIds.has(chId)) {
                continue;
            }
            
            seenChapterIds.add(chId);
            
            chapters.push({
                id: chId,
                chapter_number: chapters.length + 1,
                title: `Episode ${chapters.length + 1}`,
                url: `https://www.goodshort.com/id/${chId}`
            });
            
            if (chapters.length >= 100) break;
        }
    }
    
    // Sort chapters
    chapters.sort((a, b) => a.chapter_number - b.chapter_number);
    
    return {
        id: bookId,
        title: title,
        description: description,
        thumbnail: thumbnail,
        tags: tags,
        total_chapters: chapters.length,
        chapters: chapters
    };
}

// Extract video sources
function extractVideoSources(html) {
    const sources = [];
    const seen = new Set();
    
    // Pattern untuk video URLs
    const patterns = [
        { regex: /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g, type: 'm3u8' },
        { regex: /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g, type: 'mp4' },
        { regex: /https?:\/\/[^\s"'<>]+\.webm[^\s"'<>]*/g, type: 'webm' },
        { regex: /"file"\s*:\s*"([^"]+)"/g, type: 'auto' },
        { regex: /"source"\s*:\s*"([^"]+)"/g, type: 'auto' },
        { regex: /"url"\s*:\s*"([^"]+)"/g, type: 'auto' },
        { regex: /videoUrl\s*[:=]\s*["']([^"']+)["']/g, type: 'auto' },
        { regex: /playUrl\s*[:=]\s*["']([^"']+)["']/g, type: 'auto' }
    ];
    
    for (const { regex, type } of patterns) {
        let match;
        while ((match = regex.exec(html)) !== null) {
            const url = match[1] || match[0];
            
            if (!url.startsWith('http')) continue;
            if (seen.has(url)) continue;
            
            seen.add(url);
            
            let finalType = type;
            if (type === 'auto') {
                if (url.includes('.m3u8')) finalType = 'm3u8';
                else if (url.includes('.mp4')) finalType = 'mp4';
                else if (url.includes('.webm')) finalType = 'webm';
                else finalType = 'video';
            }
            
            sources.push({
                type: finalType,
                quality: 'auto',
                url: url
            });
        }
    }
    
    // Check video tags
    const videoRegex = /<video[^>]*src="([^"]+)"/g;
    let videoMatch;
    while ((videoMatch = videoRegex.exec(html)) !== null) {
        const url = videoMatch[1];
        if (!seen.has(url)) {
            seen.add(url);
            const fullUrl = url.startsWith('http') ? url : 'https://www.goodshort.com' + url;
            sources.push({
                type: 'video',
                quality: 'auto',
                url: fullUrl
            });
        }
    }
    
    return sources;
}

// Main handler
module.exports = async (req, res) => {
    // Parse URL and params
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const params = Object.fromEntries(url.searchParams);
    const parts = pathname.split('/').filter(Boolean);
    
    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    try {
        const lang = params.lang || 'id';
        
        // Root
        if (parts.length === 0) {
            return res.status(200).json({
                service: 'GoodShort Scraper API',
                version: '20.0',
                status: 'online',
                type: 'Node.js Full Scraper',
                endpoints: {
                    'GET /home?lang=id': 'Get all dramas',
                    'GET /search?q=keyword&lang=id': 'Search dramas',
                    'GET /hot?lang=id': 'Hot/trending dramas',
                    'GET /book/{id}?lang=id': 'Book detail with chapters',
                    'GET /chapters/{id}?lang=id': 'Get chapters only',
                    'GET /play/{id}?lang=id': 'Get video sources',
                    'GET /m3u8/{id}?lang=id': 'Get best stream URL'
                },
                example: '/book/31001161807?lang=id'
            });
        }
        
        // Home
        if (parts[0] === 'home') {
            const url = `https://www.goodshort.com/${lang}`;
            const html = await fetchHTML(url);
            
            if (!html) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch home page'
                });
            }
            
            const dramas = extractDramas(html);
            
            return res.status(200).json({
                status: 'success',
                lang: lang,
                total: dramas.length,
                data: dramas
            });
        }
        
        // Search
        if (parts[0] === 'search') {
            const query = params.q || '';
            
            if (!query) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" is required'
                });
            }
            
            const url = `https://www.goodshort.com/${lang}`;
            const html = await fetchHTML(url);
            
            if (!html) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch data'
                });
            }
            
            const allDramas = extractDramas(html);
            const results = allDramas.filter(d => 
                d.title.toLowerCase().includes(query.toLowerCase())
            );
            
            return res.status(200).json({
                status: 'success',
                query: query,
                lang: lang,
                total: results.length,
                data: results
            });
        }
        
        // Hot
        if (parts[0] === 'hot') {
            const url = `https://www.goodshort.com/${lang}`;
            const html = await fetchHTML(url);
            
            if (!html) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch data'
                });
            }
            
            const dramas = extractDramas(html).slice(0, 10);
            
            return res.status(200).json({
                status: 'success',
                lang: lang,
                total: dramas.length,
                data: dramas
            });
        }
        
        // Book detail
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            
            // Try multiple URL patterns
            const urls = [
                `https://www.goodshort.com/${lang}/${bookId}`,
                `https://www.goodshort.com/${bookId}`,
                `https://www.goodshort.com/${lang}/drama/${bookId}`,
                `https://www.goodshort.com/drama/${bookId}`
            ];
            
            let book = null;
            
            for (const url of urls) {
                const html = await fetchHTML(url);
                if (html && html.length > 5000) {
                    book = extractBookDetail(html, bookId);
                    if (book) break;
                }
            }
            
            if (!book) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found',
                    book_id: bookId
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: book
            });
        }
        
        // Chapters
        if (parts[0] === 'chapters' && parts[1]) {
            const bookId = parts[1];
            
            const urls = [
                `https://www.goodshort.com/${lang}/${bookId}`,
                `https://www.goodshort.com/${bookId}`
            ];
            
            let book = null;
            
            for (const url of urls) {
                const html = await fetchHTML(url);
                if (html) {
                    book = extractBookDetail(html, bookId);
                    if (book) break;
                }
            }
            
            if (!book) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                book_id: bookId,
                book_title: book.title,
                total: book.chapters.length,
                data: book.chapters
            });
        }
        
        // Play
        if (parts[0] === 'play' && parts[1]) {
            const chapterId = parts[1];
            
            const urls = [
                `https://www.goodshort.com/${lang}/${chapterId}`,
                `https://www.goodshort.com/${chapterId}`,
                `https://www.goodshort.com/${lang}/episode/${chapterId}`,
                `https://www.goodshort.com/episode/${chapterId}`
            ];
            
            let sources = [];
            
            for (const url of urls) {
                const html = await fetchHTML(url);
                if (html) {
                    sources = extractVideoSources(html);
                    if (sources.length > 0) break;
                }
            }
            
            if (sources.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No video sources found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: {
                    id: chapterId,
                    total_sources: sources.length,
                    sources: sources
                }
            });
        }
        
        // M3U8
        if (parts[0] === 'm3u8' && parts[1]) {
            const chapterId = parts[1];
            
            const urls = [
                `https://www.goodshort.com/${lang}/${chapterId}`,
                `https://www.goodshort.com/${chapterId}`
            ];
            
            let sources = [];
            
            for (const url of urls) {
                const html = await fetchHTML(url);
                if (html) {
                    sources = extractVideoSources(html);
                    if (sources.length > 0) break;
                }
            }
            
            // Find best source
            let best = sources.find(s => s.type === 'm3u8') || 
                      sources.find(s => s.type === 'mp4') || 
                      sources[0];
            
            if (!best) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No stream found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: {
                    id: chapterId,
                    stream_url: best.url,
                    type: best.type,
                    quality: best.quality,
                    all_sources: sources
                }
            });
        }
        
        // 404
        return res.status(404).json({
            status: 'error',
            message: 'Endpoint not found',
            path: pathname
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Internal server error'
        });
    }
};
