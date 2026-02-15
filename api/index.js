export default async function handler(req, res) {
    const axios = require('axios');
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // API DramaBos yang LU KASIH LIAT
    const DRAMABOS_API = 'https://goodshort.dramabos.my.id';
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'id-ID,id;q=0.9'
    };
    
    // Helper: Call DramaBos API
    async function callAPI(endpoint, params = {}) {
        try {
            console.log(`Calling: ${DRAMABOS_API}${endpoint}`);
            
            const response = await axios.get(`${DRAMABOS_API}${endpoint}`, {
                headers,
                params,
                timeout: 20000
            });
            
            return response.data;
            
        } catch (error) {
            console.error('API Error:', error.message);
            return null;
        }
    }
    
    // Routes
    const { url, query } = req;
    const pathname = url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    
    try {
        // GET /
        if (parts.length === 0) {
            return res.json({
                service: 'GoodShort API (via DramaBos)',
                version: '10.0',
                status: 'online',
                source: 'https://goodshort.dramabos.my.id',
                endpoints: {
                    'GET /nav': 'Navigation menu',
                    'GET /home?lang=in': 'Get all dramas',
                    'GET /search?q=keyword&lang=in': 'Search dramas',
                    'GET /hot?lang=in': 'Hot dramas',
                    'GET /book/{bookId}?lang=in': 'Book detail (contoh: /book/31001241758?lang=in)',
                    'GET /chapters/{bookId}?lang=in': 'Get chapters list',
                    'GET /play/{chapterId}?lang=in': 'Get chapter with video sources',
                    'GET /m3u8/{chapterId}?lang=in': 'Get direct m3u8 stream URL'
                },
                working_example: '/book/31001241758?lang=in'
            });
        }
        
        // GET /nav
        if (parts[0] === 'nav') {
            return res.json({
                status: 'success',
                data: [
                    { id: 'home', title: 'Home', path: '/home?lang=in' },
                    { id: 'hot', title: 'Hot', path: '/hot?lang=in' },
                    { id: 'search', title: 'Search', path: '/search?q=drama&lang=in' }
                ]
            });
        }
        
        // GET /home
        if (parts[0] === 'home') {
            const lang = query.lang || 'in';
            
            // Try different endpoints
            let data = await callAPI('/home', { lang });
            
            if (!data) {
                data = await callAPI('/book/list', { lang });
            }
            
            if (!data) {
                data = await callAPI('/book/recommend', { lang });
            }
            
            if (!data || !data.success) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch home data'
                });
            }
            
            return res.json({
                status: 'success',
                lang: lang,
                data: data.data
            });
        }
        
        // GET /search
        if (parts[0] === 'search') {
            const q = query.q || '';
            const lang = query.lang || 'in';
            
            if (!q) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Query parameter "q" required. Example: /search?q=drama&lang=in'
                });
            }
            
            const data = await callAPI('/book/search', {
                keyword: q,
                lang: lang
            });
            
            if (!data || !data.success) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Search failed'
                });
            }
            
            return res.json({
                status: 'success',
                query: q,
                lang: lang,
                total: data.data.list ? data.data.list.length : 0,
                data: data.data
            });
        }
        
        // GET /hot
        if (parts[0] === 'hot') {
            const lang = query.lang || 'in';
            
            let data = await callAPI('/book/hot', { lang });
            
            if (!data) {
                data = await callAPI('/book/recommend', { lang });
            }
            
            if (!data || !data.success) {
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to fetch hot dramas'
                });
            }
            
            return res.json({
                status: 'success',
                lang: lang,
                data: data.data
            });
        }
        
        // GET /book/:bookId
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'in';
            
            // ENDPOINT YANG LU TUNJUKIN: /book/quick/open
            const data = await callAPI('/book/quick/open', {
                bookId: bookId,
                lang: lang
            });
            
            if (!data || !data.success) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found',
                    book_id: bookId,
                    lang: lang
                });
            }
            
            // Format response
            const book = data.data.book;
            const chapters = data.data.list || [];
            
            return res.json({
                status: 'success',
                data: {
                    id: book.bookId,
                    title: book.bookName,
                    description: book.introduction,
                    cover: book.cover || book.bookDetailCover,
                    author: book.playwright || book.producer,
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
                    total_chapters: chapters.length,
                    chapters: chapters.map(ch => ({
                        id: ch.id,
                        chapter_number: ch.index + 1,
                        title: ch.chapterName,
                        image: ch.image,
                        play_time: ch.playTime,
                        play_count: ch.playCount,
                        price: ch.price,
                        charged: ch.charged,
                        next_chapter_id: ch.nextChapterId,
                        prev_chapter_id: ch.prevChapterId
                    }))
                }
            });
        }
        
        // GET /chapters/:bookId
        if (parts[0] === 'chapters' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'in';
            
            const data = await callAPI('/book/quick/open', {
                bookId: bookId,
                lang: lang
            });
            
            if (!data || !data.success) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            const chapters = data.data.list || [];
            
            return res.json({
                status: 'success',
                book_id: bookId,
                book_title: data.data.book.bookName,
                lang: lang,
                total: chapters.length,
                data: chapters.map(ch => ({
                    id: ch.id,
                    chapter_number: ch.index + 1,
                    title: ch.chapterName,
                    image: ch.image,
                    play_time: ch.playTime,
                    play_count: ch.playCount,
                    next_chapter_id: ch.nextChapterId,
                    prev_chapter_id: ch.prevChapterId
                }))
            });
        }
        
        // GET /play/:chapterId
        if (parts[0] === 'play' && parts[1]) {
            const chapterId = parts[1];
            const lang = query.lang || 'in';
            
            const data = await callAPI('/book/chapter/open', {
                chapterId: chapterId,
                lang: lang
            });
            
            if (!data || !data.success) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Chapter not found',
                    chapter_id: chapterId
                });
            }
            
            const ch = data.data;
            
            // Extract video sources
            const sources = [];
            
            if (ch.cdn) {
                sources.push({ type: 'm3u8', quality: 'default', url: ch.cdn });
            }
            
            if (ch.multiVideos) {
                ch.multiVideos.forEach(v => {
                    sources.push({ type: 'm3u8', quality: v.type, url: v.filePath });
                    
                    if (v.cdnList) {
                        v.cdnList.forEach(cdn => {
                            sources.push({
                                type: 'm3u8',
                                quality: `${v.type}_cdn`,
                                url: cdn.videoPath,
                                cdn_domain: cdn.cdnDomain
                            });
                        });
                    }
                });
            }
            
            return res.json({
                status: 'success',
                data: {
                    id: ch.id,
                    book_id: ch.bookId,
                    title: ch.chapterName,
                    image: ch.image,
                    play_time: ch.playTime,
                    index: ch.index,
                    next_chapter_id: ch.nextChapterId,
                    prev_chapter_id: ch.prevChapterId,
                    total_sources: sources.length,
                    sources: sources
                }
            });
        }
        
        // GET /m3u8/:chapterId
        if (parts[0] === 'm3u8' && parts[1]) {
            const chapterId = parts[1];
            const lang = query.lang || 'in';
            
            const data = await callAPI('/book/chapter/open', {
                chapterId: chapterId,
                lang: lang
            });
            
            if (!data || !data.success) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Stream not found'
                });
            }
            
            const ch = data.data;
            
            // Get best quality (1080p prioritized)
            let bestUrl = ch.cdn || '';
            let quality = 'default';
            
            if (ch.multiVideos) {
                const video1080 = ch.multiVideos.find(v => v.type === '1080p');
                const video720 = ch.multiVideos.find(v => v.type === '720p');
                const video540 = ch.multiVideos.find(v => v.type === '540p');
                
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
            
            return res.json({
                status: 'success',
                data: {
                    id: chapterId,
                    stream_url: bestUrl,
                    type: 'm3u8',
                    quality: quality
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
