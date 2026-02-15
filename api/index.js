export default async function handler(req, res) {
    const axios = require('axios');
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // GoodShort Internal API endpoints (reverse engineered)
    const GOODSHORT_API = 'https://api.goodshort.com'; // atau bisa jadi api subdomain lain
    
    // Kemungkinan API base URLs
    const API_BASES = [
        'https://api.goodshort.com',
        'https://www.goodshort.com/api',
        'https://goodshort.com/api',
        'https://api-sg.goodshort.com',
        'https://api-id.goodshort.com'
    ];
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
        'Origin': 'https://www.goodshort.com',
        'Referer': 'https://www.goodshort.com/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site'
    };
    
    // Try multiple API endpoints
    async function callGoodShortAPI(endpoint, params = {}, method = 'GET') {
        for (const baseUrl of API_BASES) {
            try {
                console.log(`Trying: ${baseUrl}${endpoint}`);
                
                const config = {
                    method: method,
                    url: `${baseUrl}${endpoint}`,
                    headers: headers,
                    params: params,
                    timeout: 15000
                };
                
                const response = await axios(config);
                
                if (response.data && (response.data.success || response.data.status === 0)) {
                    console.log(`✓ Success with ${baseUrl}${endpoint}`);
                    return response.data;
                }
                
            } catch (error) {
                console.log(`✗ Failed with ${baseUrl}${endpoint}:`, error.message);
                continue;
            }
        }
        
        return null;
    }
    
    // Get Book Detail
    async function getBookDetail(bookId, lang = 'in') {
        // Possible endpoint patterns based on DramaBos
        const endpoints = [
            '/book/quick/open',
            '/book/open',
            '/book/detail',
            '/v1/book/quick/open',
            '/v1/book/open',
            '/api/book/quick/open',
            `/book/${bookId}`,
            `/v1/book/${bookId}`
        ];
        
        const params = {
            bookId: bookId,
            lang: lang
        };
        
        for (const endpoint of endpoints) {
            const data = await callGoodShortAPI(endpoint, params);
            if (data) {
                return formatBookData(data);
            }
        }
        
        return null;
    }
    
    // Format book data
    function formatBookData(apiResponse) {
        if (!apiResponse.data || !apiResponse.data.book) {
            return null;
        }
        
        const book = apiResponse.data.book;
        const chapters = apiResponse.data.list || [];
        
        return {
            id: book.bookId,
            title: book.bookName,
            description: book.introduction,
            cover: book.cover || book.bookDetailCover,
            thumbnail: book.cover || book.bookDetailCover,
            author: book.playwright || book.producer || book.pseudonym,
            protagonist: book.protagonist,
            language: book.languageDisplay,
            status: book.writeStatus,
            rating: book.ratings,
            views: book.viewCount,
            view_display: book.viewCountDisplay,
            tags: book.labels || [],
            chapter_count: book.chapterCount,
            comment_count: book.commentCount,
            follow_count: book.followCount,
            book_type: book.bookType,
            grade: book.grade,
            total_chapters: chapters.length,
            chapters: chapters.map(ch => ({
                id: ch.id,
                chapter_number: ch.index + 1,
                title: ch.chapterName,
                image: ch.image,
                play_time: ch.playTime,
                play_count: ch.playCount,
                play_count_display: ch.playCountDisplay,
                price: ch.price,
                charged: ch.charged,
                cdn: ch.cdn,
                cdn_list: ch.cdnList || [],
                multi_videos: ch.multiVideos || [],
                next_chapter_id: ch.nextChapterId,
                prev_chapter_id: ch.prevChapterId,
                volume_id: ch.volumeId
            }))
        };
    }
    
    // Get Chapter Detail
    async function getChapterDetail(chapterId, lang = 'in') {
        const endpoints = [
            '/book/chapter/open',
            '/chapter/open',
            '/v1/book/chapter/open',
            `/chapter/${chapterId}`
        ];
        
        const params = {
            chapterId: chapterId,
            lang: lang
        };
        
        for (const endpoint of endpoints) {
            const data = await callGoodShortAPI(endpoint, params);
            if (data) {
                return formatChapterData(data);
            }
        }
        
        return null;
    }
    
    // Format chapter data
    function formatChapterData(apiResponse) {
        if (!apiResponse.data) {
            return null;
        }
        
        const ch = apiResponse.data;
        
        // Extract all video sources
        const sources = [];
        
        // Main CDN
        if (ch.cdn) {
            sources.push({
                type: 'm3u8',
                quality: 'default',
                url: ch.cdn
            });
        }
        
        // Multi quality videos
        if (ch.multiVideos && Array.isArray(ch.multiVideos)) {
            ch.multiVideos.forEach(video => {
                sources.push({
                    type: 'm3u8',
                    quality: video.type,
                    url: video.filePath
                });
                
                // CDN alternatives
                if (video.cdnList) {
                    video.cdnList.forEach(cdn => {
                        sources.push({
                            type: 'm3u8',
                            quality: `${video.type}_cdn`,
                            url: cdn.videoPath,
                            cdn_domain: cdn.cdnDomain
                        });
                    });
                }
            });
        }
        
        // CDN List
        if (ch.cdnList && Array.isArray(ch.cdnList)) {
            ch.cdnList.forEach(cdn => {
                sources.push({
                    type: 'm3u8',
                    quality: 'cdn',
                    url: cdn.videoPath,
                    cdn_domain: cdn.cdnDomain
                });
            });
        }
        
        return {
            id: ch.id,
            book_id: ch.bookId,
            title: ch.chapterName,
            image: ch.image,
            play_time: ch.playTime,
            play_count: ch.playCount,
            index: ch.index,
            charged: ch.charged,
            price: ch.price,
            next_chapter_id: ch.nextChapterId,
            next_chapter_name: ch.nextChapterName,
            prev_chapter_id: ch.prevChapterId,
            prev_chapter_name: ch.prevChapterName,
            total_sources: sources.length,
            sources: sources
        };
    }
    
    // Get Home/List
    async function getHome(lang = 'in') {
        const endpoints = [
            '/book/list',
            '/book/recommend',
            '/v1/book/list',
            '/home/recommend'
        ];
        
        const params = { lang: lang };
        
        for (const endpoint of endpoints) {
            const data = await callGoodShortAPI(endpoint, params);
            if (data) {
                return data;
            }
        }
        
        return null;
    }
    
    // Search
    async function search(keyword, lang = 'in') {
        const endpoints = [
            '/book/search',
            '/search',
            '/v1/book/search'
        ];
        
        const params = {
            keyword: keyword,
            lang: lang
        };
        
        for (const endpoint of endpoints) {
            const data = await callGoodShortAPI(endpoint, params);
            if (data) {
                return data;
            }
        }
        
        return null;
    }
    
    // Routes
    const { url, query } = req;
    const pathname = url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    
    try {
        // GET /
        if (parts.length === 0) {
            return res.json({
                service: 'GoodShort API',
                version: '9.0',
                type: 'Reverse Engineered API',
                status: 'online',
                endpoints: {
                    'GET /nav': 'Navigation',
                    'GET /home?lang=in': 'Home page dramas',
                    'GET /search?q=keyword&lang=in': 'Search dramas',
                    'GET /hot?lang=in': 'Hot dramas',
                    'GET /book/{bookId}?lang=in': 'Book detail with chapters',
                    'GET /chapters/{bookId}?lang=in': 'Chapters only',
                    'GET /play/{chapterId}?lang=in': 'Chapter with video sources',
                    'GET /m3u8/{chapterId}?lang=in': 'Best stream URL'
                },
                note: 'Trying to reverse engineer GoodShort internal API',
                example: '/book/31001241758?lang=in'
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
            const lang = query.lang || 'in';
            const data = await getHome(lang);
            
            if (!data) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch home data. API endpoint not found.'
                });
            }
            
            return res.json({
                status: 'success',
                lang: lang,
                data: data
            });
        }
        
        // GET /search
        if (parts[0] === 'search') {
            const q = query.q || '';
            const lang = query.lang || 'in';
            
            if (!q) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" required'
                });
            }
            
            const data = await search(q, lang);
            
            if (!data) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Search failed. API endpoint not found.'
                });
            }
            
            return res.json({
                status: 'success',
                query: q,
                lang: lang,
                data: data
            });
        }
        
        // GET /hot
        if (parts[0] === 'hot') {
            const lang = query.lang || 'in';
            const data = await getHome(lang);
            
            if (!data || !data.data) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch hot dramas'
                });
            }
            
            // Ambil 10 pertama
            const hotList = Array.isArray(data.data.list) ? data.data.list.slice(0, 10) : [];
            
            return res.json({
                status: 'success',
                lang: lang,
                total: hotList.length,
                data: hotList
            });
        }
        
        // GET /book/:bookId
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'in';
            
            const book = await getBookDetail(bookId, lang);
            
            if (!book) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found. Unable to find working API endpoint.',
                    book_id: bookId,
                    lang: lang,
                    hint: 'GoodShort API might have changed. Check network tab in browser.'
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
            const lang = query.lang || 'in';
            
            const book = await getBookDetail(bookId, lang);
            
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
            const lang = query.lang || 'in';
            
            const chapter = await getChapterDetail(chapterId, lang);
            
            if (!chapter) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chapter not found',
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
            const lang = query.lang || 'in';
            
            const chapter = await getChapterDetail(chapterId, lang);
            
            if (!chapter || chapter.sources.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'No stream found'
                });
            }
            
            // Priority: 1080p > 720p > 540p > default
            const priorities = ['1080p', '720p', '540p', 'default'];
            let bestStream = chapter.sources[0];
            
            for (const quality of priorities) {
                const found = chapter.sources.find(s => s.quality === quality);
                if (found) {
                    bestStream = found;
                    break;
                }
            }
            
            return res.json({
                status: 'success',
                data: {
                    id: chapterId,
                    stream_url: bestStream.url,
                    type: bestStream.type,
                    quality: bestStream.quality,
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
