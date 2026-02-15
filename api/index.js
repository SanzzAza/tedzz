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
            
            $('div, article, li, section').each((i, container) => {
                const $container = $(container);
                const $img = $container.find('img').first();
                const $link = $container.find('a[href]').first();
                const $title = $container.find('h1, h2, h3, h4, h5, span, p').first();
                
                if ($img.length && $link.length) {
                    const title = $title.text().trim() || $img.attr('alt') || 'No Title';
                    let url = $link.attr('href') || '';
                    
                    if (url && !url.startsWith('http')) {
                        url = `${baseUrl}${url}`;
                    }
                    
                    const idMatch = url.match(/\/(\d+)(?:\/|$)/);
                    const id = idMatch ? idMatch[1] : Math.random().toString(36).substr(2, 9);
                    
                    if (url && title && title.length > 2 && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        dramas.push({
                            id: id,
                            title: title,
                            url: url,
                            thumbnail: $img.attr('src') || '',
                            type: 'drama'
                        });
                    }
                }
            });
            
            return dramas;
        } catch (error) {
            console.error('Error scraping home:', error.message);
            return [];
        }
    }
    
    // Helper function: Scrape Book Detail
    async function scrapeBookDetail(bookId) {
        const baseUrl = 'https://www.goodshort.com';
        const targetUrl = `${baseUrl}/id/drama/${bookId}`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        try {
            const response = await axios.get(targetUrl, { headers, timeout: 15000 });
            const $ = cheerio.load(response.data);
            
            const title = $('h1, h2').first().text().trim() || 'Unknown';
            
            let description = '';
            $('p, div').each((i, elem) => {
                const classes = $(elem).attr('class') || '';
                if (classes.toLowerCase().includes('desc') || 
                    classes.toLowerCase().includes('summary')) {
                    description = $(elem).text().trim();
                    return false;
                }
            });
            
            const thumbnail = $('img').first().attr('src') || '';
            
            const chapters = [];
            $('a[href]').each((i, elem) => {
                const href = $(elem).attr('href') || '';
                const text = $(elem).text().trim();
                
                if (text.toLowerCase().includes('episode') || 
                    text.toLowerCase().includes('ep') || 
                    href.toLowerCase().includes('episode')) {
                    
                    const chapterIdMatch = href.match(/\/(\d+)(?:\/|$)/);
                    const chapterId = chapterIdMatch ? chapterIdMatch[1] : `${bookId}_${chapters.length + 1}`;
                    
                    chapters.push({
                        id: chapterId,
                        chapter_number: chapters.length + 1,
                        title: text,
                        url: href.startsWith('http') ? href : `${baseUrl}${href}`
                    });
                }
            });
            
            return {
                id: bookId,
                title,
                description,
                thumbnail,
                total_chapters: chapters.length,
                chapters
            };
        } catch (error) {
            console.error('Error scraping book detail:', error.message);
            return null;
        }
    }
    
    // Helper function: Scrape Chapter Detail
    async function scrapeChapterDetail(chapterId) {
        const baseUrl = 'https://www.goodshort.com';
        const targetUrl = `${baseUrl}/id/episode/${chapterId}`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        try {
            const response = await axios.get(targetUrl, { headers, timeout: 15000 });
            const $ = cheerio.load(response.data);
            
            const title = $('h1, h2').first().text().trim() || `Episode ${chapterId}`;
            
            const sources = [];
            
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
            
            $('iframe').each((i, iframe) => {
                const src = $(iframe).attr('src');
                if (src) {
                    sources.push({ type: 'iframe', url: src });
                }
            });
            
            $('script').each((i, script) => {
                const scriptContent = $(script).html() || '';
                
                const m3u8Matches = scriptContent.match(/https?:\/\/[^\s"'>]+\.m3u8/g) || [];
                m3u8Matches.forEach(url => {
                    sources.push({ type: 'm3u8', url });
                });
                
                const mp4Matches = scriptContent.match(/https?:\/\/[^\s"'>]+\.mp4/g) || [];
                mp4Matches.forEach(url => {
                    sources.push({ type: 'mp4', url });
                });
            });
            
            return {
                id: chapterId,
                title,
                sources
            };
        } catch (error) {
            console.error('Error scraping chapter detail:', error.message);
            return null;
        }
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
                version: '2.0',
                endpoints: {
                    'GET /nav': 'Navigation menu',
                    'GET /home': 'Home page dramas',
                    'GET /search?q={query}': 'Search dramas',
                    'GET /hot': 'Trending/Hot dramas',
                    'GET /book/{id}': 'Book/Drama detail',
                    'GET /chapters/{id}': 'Get chapters list',
                    'GET /play/{chapterId}': 'Play chapter',
                    'GET /m3u8/{chapterId}': 'Get m3u8 stream URL'
                }
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
                data: dramas
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
                    message: 'Book not found'
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
