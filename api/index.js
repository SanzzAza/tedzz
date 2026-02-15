const https = require('https');
const http = require('http');

// Fetch dengan custom options
function fetchData(url, options = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const defaultOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
                'Origin': 'https://www.goodshort.com',
                'Referer': 'https://www.goodshort.com/',
                ...options.headers
            }
        };
        
        client.get(url, defaultOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    // Try parse as JSON first
                    const json = JSON.parse(data);
                    resolve(json);
                } catch {
                    // Return as text if not JSON
                    resolve(data);
                }
            });
        }).on('error', (err) => {
            console.error('Fetch error:', err);
            reject(err);
        });
    });
}

// Try to call GoodShort internal API
async function callGoodShortAPI(endpoint, params = {}) {
    // Possible API base URLs
    const apiUrls = [
        'https://api.goodshort.com',
        'https://api-sg.goodshort.com',
        'https://api-id.goodshort.com',
        'https://www.goodshort.com/api',
        'https://goodshort.com/api'
    ];
    
    const queryString = Object.keys(params).length > 0 
        ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
        : '';
    
    for (const baseUrl of apiUrls) {
        try {
            const url = `${baseUrl}${endpoint}${queryString}`;
            console.log(`Trying API: ${url}`);
            
            const data = await fetchData(url);
            
            // Check if response is valid
            if (data && (data.success || data.status === 0 || data.data)) {
                console.log(`✓ Success with ${baseUrl}`);
                return data;
            }
        } catch (error) {
            console.log(`✗ Failed with ${baseUrl}: ${error.message}`);
            continue;
        }
    }
    
    return null;
}

// Scrape HTML as fallback
async function scrapeHTML(url) {
    try {
        const html = await fetchData(url);
        
        if (typeof html !== 'string') {
            return '';
        }
        
        // Extract data from HTML
        const dramas = [];
        const idRegex = /\/(\d{10,})/g;
        let match;
        const seen = new Set();
        
        while ((match = idRegex.exec(html)) !== null) {
            const id = match[1];
            if (seen.has(id)) continue;
            seen.add(id);
            
            // Get context
            const idx = match.index;
            const context = html.substring(Math.max(0, idx - 1000), Math.min(html.length, idx + 1000));
            
            // Extract title
            let title = '';
            const titleMatch = context.match(/alt="([^"]+)"/) || 
                              context.match(/title="([^"]+)"/);
            if (titleMatch) {
                title = titleMatch[1];
            }
            
            // Extract image
            let img = '';
            const imgMatch = context.match(/(?:data-src|src)="([^"]+\.(?:jpg|png|webp))"/i);
            if (imgMatch) {
                img = imgMatch[1];
                if (!img.startsWith('http')) {
                    if (img.startsWith('//')) {
                        img = 'https:' + img;
                    } else {
                        img = 'https://www.goodshort.com' + img;
                    }
                }
            }
            
            if (title) {
                dramas.push({
                    id: id,
                    title: title,
                    url: `https://www.goodshort.com/id/${id}`,
                    thumbnail: img
                });
            }
            
            if (dramas.length >= 50) break;
        }
        
        return dramas;
    } catch (error) {
        console.error('Scrape error:', error);
        return [];
    }
}

module.exports = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const params = Object.fromEntries(url.searchParams);
    const parts = pathname.split('/').filter(Boolean);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const lang = params.lang || 'id';
        
        // Root
        if (parts.length === 0) {
            return res.status(200).json({
                service: 'GoodShort API',
                version: '21.0',
                type: 'API + Scraper Hybrid',
                status: 'online',
                endpoints: {
                    '/home?lang=id': 'Get dramas',
                    '/search?q=query&lang=id': 'Search',
                    '/book/{id}?lang=id': 'Book detail',
                    '/chapters/{id}?lang=id': 'Chapters',
                    '/play/{id}?lang=id': 'Video sources',
                    '/test': 'Test API endpoints'
                }
            });
        }
        
        // Test endpoint
        if (parts[0] === 'test') {
            const endpoints = [
                '/book/quick/open?bookId=31001161807&lang=id',
                '/book/list?lang=id',
                '/book/recommend?lang=id',
                '/home?lang=id',
                '/v1/book/list?lang=id'
            ];
            
            const results = [];
            
            for (const endpoint of endpoints) {
                const data = await callGoodShortAPI(endpoint);
                results.push({
                    endpoint: endpoint,
                    success: !!data,
                    has_data: data?.data ? true : false,
                    response_preview: data ? JSON.stringify(data).substring(0, 200) : null
                });
            }
            
            return res.status(200).json({
                status: 'debug',
                results: results
            });
        }
        
        // Home
        if (parts[0] === 'home') {
            // Try API first
            const apiEndpoints = [
                '/book/list',
                '/book/recommend',
                '/home',
                '/v1/book/list'
            ];
            
            for (const endpoint of apiEndpoints) {
                const data = await callGoodShortAPI(endpoint, { lang });
                if (data && data.data) {
                    // Format response
                    let dramas = [];
                    
                    if (Array.isArray(data.data)) {
                        dramas = data.data;
                    } else if (data.data.list && Array.isArray(data.data.list)) {
                        dramas = data.data.list;
                    }
                    
                    return res.status(200).json({
                        status: 'success',
                        source: 'api',
                        lang: lang,
                        total: dramas.length,
                        data: dramas
                    });
                }
            }
            
            // Fallback to scraping
            console.log('API failed, trying scraping...');
            const dramas = await scrapeHTML(`https://www.goodshort.com/${lang}`);
            
            return res.status(200).json({
                status: 'success',
                source: 'scraper',
                lang: lang,
                total: dramas.length,
                data: dramas
            });
        }
        
        // Book detail
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            
            // Try API
            const data = await callGoodShortAPI('/book/quick/open', { bookId, lang });
            
            if (data && data.data && data.data.book) {
                const book = data.data.book;
                const chapters = data.data.list || [];
                
                return res.status(200).json({
                    status: 'success',
                    source: 'api',
                    data: {
                        id: book.bookId,
                        title: book.bookName,
                        description: book.introduction,
                        thumbnail: book.cover || book.bookDetailCover,
                        tags: book.labels || [],
                        total_chapters: chapters.length,
                        chapters: chapters.map(ch => ({
                            id: ch.id,
                            chapter_number: ch.index + 1,
                            title: ch.chapterName,
                            image: ch.image,
                            url: `https://www.goodshort.com/${lang}/${ch.id}`
                        }))
                    }
                });
            }
            
            // Fallback scraping
            const html = await fetchData(`https://www.goodshort.com/${lang}/${bookId}`);
            
            // Parse HTML (basic)
            const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
            const title = titleMatch ? titleMatch[1] : `Book ${bookId}`;
            
            return res.status(200).json({
                status: 'success',
                source: 'scraper',
                data: {
                    id: bookId,
                    title: title,
                    description: '',
                    thumbnail: '',
                    tags: [],
                    total_chapters: 0,
                    chapters: []
                }
            });
        }
        
        // 404
        return res.status(404).json({
            status: 'error',
            message: 'Endpoint not found'
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
