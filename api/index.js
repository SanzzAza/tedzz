export default async function handler(req, res) {
    // Import dependencies
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Helper function: Scrape Home
    async function scrapeHome() {
        const baseUrl = 'https://www.goodshort.com';
        const targetUrl = `${baseUrl}/id`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        };
        
        try {
            const response = await axios.get(targetUrl, { headers, timeout: 15000 });
            const $ = cheerio.load(response.data);
            
            const dramas = [];
            const seenUrls = new Set();
            
            // Cari semua link drama
            $('a[href*="/drama/"], a[href*="/series/"], a[href*="/video/"]').each((i, elem) => {
                const $link = $(elem);
                const href = $link.attr('href') || '';
                const $img = $link.find('img').first();
                const title = $link.find('h2, h3, h4, span, p').first().text().trim() || 
                             $link.attr('title') || 
                             $img.attr('alt') || 
                             $link.text().trim();
                
                if (href && !seenUrls.has(href)) {
                    seenUrls.add(href);
                    
                    // Extract ID dari URL (ambil path terakhir)
                    let id = '';
                    const urlParts = href.split('/').filter(Boolean);
                    if (urlParts.length > 0) {
                        id = urlParts[urlParts.length - 1];
                        // Hapus query parameters jika ada
                        id = id.split('?')[0];
                    }
                    
                    const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                    const thumbnail = $img.attr('src') || $img.attr('data-src') || '';
                    
                    if (id && title && title.length > 2) {
                        dramas.push({
                            id: id,
                            title: title,
                            url: fullUrl,
                            thumbnail: thumbnail.startsWith('http') ? thumbnail : `${baseUrl}${thumbnail}`,
                            type: 'drama'
                        });
                    }
                }
            });
            
            // Jika tidak ada drama ditemukan dengan selector spesifik, coba cara umum
            if (dramas.length === 0) {
                $('div[class*="item"], div[class*="card"], article').each((i, container) => {
                    const $container = $(container);
                    const $link = $container.find('a[href]').first();
                    const $img = $container.find('img').first();
                    const title = $container.find('h2, h3, h4, span').first().text().trim() || 
                                 $img.attr('alt') || '';
                    
                    if ($link.length && title) {
                        const href = $link.attr('href') || '';
                        
                        if (!seenUrls.has(href)) {
                            seenUrls.add(href);
                            
                            let id = '';
                            const urlParts = href.split('/').filter(Boolean);
                            if (urlParts.length > 0) {
                                id = urlParts[urlParts.length - 1].split('?')[0];
                            }
                            
                            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                            const thumbnail = $img.attr('src') || $img.attr('data-src') || '';
                            
                            if (id && title.length > 2) {
                                dramas.push({
                                    id: id,
                                    title: title,
                                    url: fullUrl,
                                    thumbnail: thumbnail.startsWith('http') ? thumbnail : `${baseUrl}${thumbnail}`,
                                    type: 'drama'
                                });
                            }
                        }
                    }
                });
            }
            
            return dramas;
        } catch (error) {
            console.error('Error scraping home:', error.message);
            return [];
        }
    }
    
    // Helper function: Scrape Book Detail
    async function scrapeBookDetail(bookId) {
        const baseUrl = 'https://www.goodshort.com';
        
        // Coba beberapa kemungkinan URL pattern
        const possibleUrls = [
            `${baseUrl}/id/drama/${bookId}`,
            `${baseUrl}/drama/${bookId}`,
            `${baseUrl}/id/series/${bookId}`,
            `${baseUrl}/series/${bookId}`,
            `${baseUrl}/id/video/${bookId}`,
            `${baseUrl}/video/${bookId}`,
            `${baseUrl}/id/${bookId}`,
            `${baseUrl}/${bookId}`
        ];
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        };
        
        for (const targetUrl of possibleUrls) {
            try {
                const response = await axios.get(targetUrl, { 
                    headers, 
                    timeout: 15000,
                    validateStatus: function (status) {
                        return status < 500; // Accept anything less than 500
                    }
                });
                
                // Skip jika 404
                if (response.status === 404) continue;
                
                const $ = cheerio.load(response.data);
                
                const title = $('h1').first().text().trim() || 
                             $('h2').first().text().trim() || 
                             $('meta[property="og:title"]').attr('content') || 
                             'Unknown';
                
                // Skip jika tidak ada konten
                if (title === 'Unknown' || title === '') continue;
                
                let description = '';
                // Cari deskripsi dengan berbagai selector
                const descSelectors = [
                    'div[class*="desc"]',
                    'div[class*="summary"]',
                    'div[class*="synopsis"]',
                    'p[class*="desc"]',
                    'meta[property="og:description"]',
                    'meta[name="description"]'
                ];
                
                for (const selector of descSelectors) {
                    if (selector.includes('meta')) {
                        description = $(selector).attr('content') || '';
                    } else {
                        description = $(selector).first().text().trim();
                    }
                    if (description) break;
                }
                
                const thumbnail = $('meta[property="og:image"]').attr('content') ||
                                 $('img[class*="poster"]').first().attr('src') ||
                                 $('img[class*="cover"]').first().attr('src') ||
                                 $('img').first().attr('src') || '';
                
                const chapters = [];
                let chapterIndex = 0;
                
                // Cari episode/chapter links
                $('a').each((i, elem) => {
                    const href = $(elem).attr('href') || '';
                    const text = $(elem).text().trim();
                    
                    // Pattern untuk episode
                    if (href.includes('episode') || href.includes('ep-') || 
                        text.match(/episode\s*\d+/i) || text.match(/ep\s*\d+/i) ||
                        text.match(/part\s*\d+/i) || text.match(/chapter\s*\d+/i)) {
                        
                        chapterIndex++;
                        
                        // Extract episode number dari text
                        const numMatch = text.match(/\d+/);
                        const episodeNum = numMatch ? parseInt(numMatch[0]) : chapterIndex;
                        
                        // Extract ID dari URL
                        let chapterId = '';
                        const urlParts = href.split('/').filter(Boolean);
                        if (urlParts.length > 0) {
                            chapterId = urlParts[urlParts.length - 1].split('?')[0];
                        }
                        
                        if (!chapterId) {
                            chapterId = `${bookId}_ep${episodeNum}`;
                        }
                        
                        chapters.push({
                            id: chapterId,
                            chapter_number: episodeNum,
                            title: text || `Episode ${episodeNum}`,
                            url: href.startsWith('http') ? href : `${baseUrl}${href}`
                        });
                    }
                });
                
                // Sort chapters berdasarkan episode number
                chapters.sort((a, b) => a.chapter_number - b.chapter_number);
                
                return {
                    id: bookId,
                    title,
                    description,
                    thumbnail: thumbnail.startsWith('http') ? thumbnail : `${baseUrl}${thumbnail}`,
                    total_chapters: chapters.length,
                    chapters,
                    source_url: targetUrl
                };
                
            } catch (error) {
                // Continue to next URL if error
                continue;
            }
        }
        
        return null;
    }
    
    // Helper function: Scrape Chapter Detail
    async function scrapeChapterDetail(chapterId) {
        const baseUrl = 'https://www.goodshort.com';
        
        const possibleUrls = [
            `${baseUrl}/id/episode/${chapterId}`,
            `${baseUrl}/episode/${chapterId}`,
            `${baseUrl}/id/ep/${chapterId}`,
            `${baseUrl}/ep/${chapterId}`,
            `${baseUrl}/id/watch/${chapterId}`,
            `${baseUrl}/watch/${chapterId}`,
            `${baseUrl}/id/${chapterId}`,
            `${baseUrl}/${chapterId}`
        ];
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        };
        
        for (const targetUrl of possibleUrls) {
            try {
                const response = await axios.get(targetUrl, { 
                    headers, 
                    timeout: 15000,
                    validateStatus: function (status) {
                        return status < 500;
                    }
                });
                
                if (response.status === 404) continue;
                
                const $ = cheerio.load(response.data);
                
                const title = $('h1').first().text().trim() || 
                             $('h2').first().text().trim() || 
                             `Episode ${chapterId}`;
                
                const sources = [];
                
                // Cari video sources
                $('video').each((i, video) => {
                    const src = $(video).attr('src');
                    if (src) {
                        sources.push({ type: 'video', url: src });
                    }
                    
                    $(video).find('source').each((j, source) => {
                        const sourceSrc = $(source).attr('src');
                        if (sourceSrc) {
                            sources.push({ type: 'video', url: sourceSrc });
                        }
                    });
                });
                
                // Cari iframe
                $('iframe').each((i, iframe) => {
                    const src = $(iframe).attr('src');
                    if (src) {
                        sources.push({ type: 'iframe', url: src });
                    }
                });
                
                // Cari m3u8/mp4 dalam scripts
                $('script').each((i, script) => {
                    const scriptContent = $(script).html() || '';
                    
                    const videoPatterns = [
                        /https?:\/\/[^\s"'>]+\.m3u8/g,
                        /https?:\/\/[^\s"'>]+\.mp4/g,
                        /https?:\/\/[^\s"'>]+\.webm/g,
                        /"file":\s*"([^"]+)"/g,
                        /"source":\s*"([^"]+)"/g,
                        /"src":\s*"([^"]+)"/g
                    ];
                    
                    videoPatterns.forEach(pattern => {
                        const matches = scriptContent.match(pattern) || [];
                        matches.forEach(match => {
                            let url = match;
                            // Clean up jika ada format "file": "url"
                            if (match.includes('"')) {
                                url = match.split('"').filter(s => s.includes('http'))[0] || match;
                            }
                            
                            if (url.includes('.m3u8')) {
                                sources.push({ type: 'm3u8', url });
                            } else if (url.includes('.mp4')) {
                                sources.push({ type: 'mp4', url });
                            } else if (url.includes('.webm')) {
                                sources.push({ type: 'webm', url });
                            }
                        });
                    });
                });
                
                if (sources.length > 0 || title !== `Episode ${chapterId}`) {
                    return {
                        id: chapterId,
                        title,
                        sources,
                        source_url: targetUrl
                    };
                }
                
            } catch (error) {
                continue;
            }
        }
        
        return null;
    }
    
    // Helper function: Get M3U8 Stream
    async function getM3U8Stream(chapterId) {
        const chapterDetail = await scrapeChapterDetail(chapterId);
        
        if (chapterDetail && chapterDetail.sources) {
            const m3u8Source = chapterDetail.sources.find(s => s.type === 'm3u8');
            if (m3u8Source) {
                return {
                    id: chapterId,
                    stream_url: m3u8Source.url,
                    type: 'm3u8'
                };
            }
            
            const videoSource = chapterDetail.sources.find(s => s.type === 'mp4' || s.type === 'video');
            if (videoSource) {
                return {
                    id: chapterId,
                    stream_url: videoSource.url,
                    type: videoSource.type
                };
            }
        }
        
        return {
            id: chapterId,
            stream_url: null,
            error: 'Stream not found'
        };
    }
    
    // Helper function: Search Dramas
    async function searchDramas(query) {
        const allDramas = await scrapeHome();
        const results = allDramas.filter(drama => 
            drama.title.toLowerCase().includes(query.toLowerCase())
        );
        return results;
    }
    
    // Parse URL
    const { url } = req;
    const urlParts = url.split('/').filter(Boolean);
    
    try {
        // Route: GET /
        if (url === '/' && req.method === 'GET') {
            return res.status(200).json({
                service: 'GoodShort API',
                version: '2.1',
                endpoints: {
                    'GET /nav': 'Navigation menu',
                    'GET /home': 'Home page dramas - Get list with IDs',
                    'GET /search?q={query}': 'Search dramas',
                    'GET /hot': 'Trending/Hot dramas',
                    'GET /book/{id}': 'Book/Drama detail - Use ID from /home',
                    'GET /chapters/{id}': 'Get chapters list',
                    'GET /play/{chapterId}': 'Play chapter',
                    'GET /m3u8/{chapterId}': 'Get m3u8 stream URL'
                },
                note: 'First call /home to get drama IDs, then use those IDs for /book/{id}'
            });
        }
        
        // Route: GET /nav
        if (urlParts[0] === 'nav' && req.method === 'GET') {
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
        if (urlParts[0] === 'home' && req.method === 'GET') {
            const dramas = await scrapeHome();
            return res.status(200).json({
                status: 'success',
                total: dramas.length,
                data: dramas,
                note: 'Use the "id" field from each drama for /book/{id} endpoint'
            });
        }
        
        // Route: GET /search
        if (urlParts[0] === 'search' && req.method === 'GET') {
            const query = req.query.q || '';
            
            if (!query) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" is required'
                });
            }
            
            const results = await searchDramas(query);
            return res.status(200).json({
                status: 'success',
                query,
                total: results.length,
                data: results
            });
        }
        
        // Route: GET /hot
        if (urlParts[0] === 'hot' && req.method === 'GET') {
            const dramas = await scrapeHome();
            const hotDramas = dramas.slice(0, 10);
            return res.status(200).json({
                status: 'success',
                total: hotDramas.length,
                data: hotDramas
            });
        }
        
        // Route: GET /book/:id
        if (urlParts[0] === 'book' && urlParts[1] && req.method === 'GET') {
            const bookId = urlParts[1];
            const bookDetail = await scrapeBookDetail(bookId);
            
            if (!bookDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found. Please use a valid ID from /home endpoint',
                    tried_id: bookId
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: bookDetail
            });
        }
        
        // Route: GET /chapters/:id
        if (urlParts[0] === 'chapters' && urlParts[1] && req.method === 'GET') {
            const bookId = urlParts[1];
            const bookDetail = await scrapeBookDetail(bookId);
            
            if (!bookDetail) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                book_id: bookId,
                book_title: bookDetail.title,
                total: bookDetail.chapters.length,
                data: bookDetail.chapters
            });
        }
        
        // Route: GET /play/:chapterId
        if (urlParts[0] === 'play' && urlParts[1] && req.method === 'GET') {
            const chapterId = urlParts[1];
            const chapterDetail = await scrapeChapterDetail(chapterId);
            
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
        
        // Route: GET /m3u8/:chapterId
        if (urlParts[0] === 'm3u8' && urlParts[1] && req.method === 'GET') {
            const chapterId = urlParts[1];
            const streamData = await getM3U8Stream(chapterId);
            
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
        
        // 404 Not Found
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
