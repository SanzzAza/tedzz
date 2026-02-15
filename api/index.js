const axios = require('axios');

// Daftar kemungkinan API base URLs
const API_CANDIDATES = [
    'https://api.goodshort.com',
    'https://api-sg.goodshort.com',
    'https://api-id.goodshort.com', 
    'https://www.goodshort.com/api',
    'https://goodshort.com/api',
    'https://h5.goodshort.com/api',
    'https://m.goodshort.com/api'
];

// Fungsi untuk coba semua API endpoint
async function callAPI(endpoint, params = {}) {
    const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'id-ID,id;q=0.9',
        'Origin': 'https://www.goodshort.com',
        'Referer': 'https://www.goodshort.com/',
        'x-app-version': '1.0.0',
        'x-platform': 'h5'
    };

    for (const baseUrl of API_CANDIDATES) {
        try {
            console.log(`Trying: ${baseUrl}${endpoint}`);
            
            const response = await axios.get(`${baseUrl}${endpoint}`, {
                params: params,
                headers: commonHeaders,
                timeout: 8000,
                validateStatus: (status) => status < 500
            });

            // Cek apakah response valid
            if (response.data && 
                (response.data.success || 
                 response.data.status === 0 || 
                 response.data.data)) {
                console.log(`✓ SUCCESS with ${baseUrl}`);
                return {
                    success: true,
                    data: response.data,
                    baseUrl: baseUrl
                };
            }
        } catch (error) {
            console.log(`✗ FAILED ${baseUrl}: ${error.message}`);
            continue;
        }
    }

    return { success: false, data: null };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);
    const params = Object.fromEntries(url.searchParams);

    try {
        const lang = params.lang || 'id';

        // Route: Root
        if (parts.length === 0) {
            return res.status(200).json({
                service: 'GoodShort Ultimate Scraper',
                version: '23.0',
                status: 'online',
                strategy: 'Multi-endpoint fallback',
                endpoints: {
                    '/test': 'Test semua API endpoints',
                    '/home?lang=id': 'Get drama list',
                    '/book/{id}?lang=id': 'Get book detail',
                    '/play/{chapterId}?lang=id': 'Get video sources',
                    '/search?q={query}&lang=id': 'Search dramas'
                }
            });
        }

        // Route: /test (Debugging)
        if (parts[0] === 'test') {
            const testEndpoints = [
                { path: '/book/list', params: { lang, page: 1, pageSize: 5 } },
                { path: '/book/quick/open', params: { bookId: '31001241758', lang } },
                { path: '/book/recommend', params: { lang } },
                { path: '/home', params: { lang } }
            ];

            const results = [];

            for (const test of testEndpoints) {
                const result = await callAPI(test.path, test.params);
                results.push({
                    endpoint: test.path,
                    success: result.success,
                    baseUrl: result.baseUrl || 'none',
                    hasData: result.data?.data ? true : false
                });
            }

            return res.status(200).json({
                status: 'debug',
                results: results
            });
        }

        // Route: /home
        if (parts[0] === 'home') {
            const endpoints = [
                { path: '/book/list', params: { lang, page: 1, pageSize: 50 } },
                { path: '/book/recommend', params: { lang } },
                { path: '/home', params: { lang } }
            ];

            for (const endpoint of endpoints) {
                const result = await callAPI(endpoint.path, endpoint.params);
                
                if (result.success && result.data?.data) {
                    let dramas = [];
                    
                    if (Array.isArray(result.data.data)) {
                        dramas = result.data.data;
                    } else if (result.data.data.list) {
                        dramas = result.data.data.list;
                    }

                    return res.status(200).json({
                        status: 'success',
                        source: result.baseUrl,
                        total: dramas.length,
                        data: dramas
                    });
                }
            }

            return res.status(500).json({
                status: 'error',
                message: 'All API endpoints failed'
            });
        }

        // Route: /book/:id
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            
            const result = await callAPI('/book/quick/open', { bookId, lang });

            if (!result.success || !result.data?.data) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found or API failed',
                    book_id: bookId
                });
            }

            return res.status(200).json({
                status: 'success',
                source: result.baseUrl,
                data: result.data.data
            });
        }

        // Route: /chapters/:id
        if (parts[0] === 'chapters' && parts[1]) {
            const bookId = parts[1];
            
            const result = await callAPI('/book/quick/open', { bookId, lang });

            if (!result.success || !result.data?.data) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }

            const chapters = result.data.data.list || [];

            return res.status(200).json({
                status: 'success',
                book_id: bookId,
                total: chapters.length,
                data: chapters
            });
        }

        // Route: /play/:chapterId
        if (parts[0] === 'play' && parts[1]) {
            const chapterId = parts[1];
            
            const result = await callAPI('/book/chapter/open', { chapterId, lang });

            if (!result.success) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chapter not found'
                });
            }

            return res.status(200).json({
                status: 'success',
                source: result.baseUrl,
                data: result.data?.data || {}
            });
        }

        // Route: /m3u8/:chapterId
        if (parts[0] === 'm3u8' && parts[1]) {
            const chapterId = parts[1];
            
            const result = await callAPI('/book/chapter/open', { chapterId, lang });

            if (!result.success || !result.data?.data) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No video sources found'
                });
            }

            const chapter = result.data.data;
            
            // Cari m3u8 terbaik
            let bestUrl = '';
            let quality = 'unknown';

            if (chapter.multiVideos && chapter.multiVideos.length > 0) {
                // Prioritas: 1080p > 720p > 540p
                const video1080 = chapter.multiVideos.find(v => v.type === '1080p');
                const video720 = chapter.multiVideos.find(v => v.type === '720p');
                const video540 = chapter.multiVideos.find(v => v.type === '540p');

                if (video1080) {
                    bestUrl = video1080.filePath;
                    quality = '1080p';
                } else if (video720) {
                    bestUrl = video720.filePath;
                    quality = '720p';
                } else if (video540) {
                    bestUrl = video540.filePath;
                    quality = '540p';
                }
            }

            if (!bestUrl && chapter.cdn) {
                bestUrl = chapter.cdn;
                quality = 'default';
            }

            if (!bestUrl) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No stream URL found'
                });
            }

            return res.status(200).json({
                status: 'success',
                data: {
                    id: chapterId,
                    stream_url: bestUrl,
                    quality: quality,
                    type: 'm3u8',
                    all_sources: chapter.multiVideos || []
                }
            });
        }

        // Route: /search
        if (parts[0] === 'search') {
            const keyword = params.q || '';

            if (!keyword) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" required'
                });
            }

            const result = await callAPI('/book/search', { keyword, lang, page: 1, pageSize: 20 });

            if (!result.success) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Search API failed'
                });
            }

            return res.status(200).json({
                status: 'success',
                query: keyword,
                data: result.data?.data?.list || []
            });
        }

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
