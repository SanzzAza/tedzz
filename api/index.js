export default async function handler(req, res) {
    const axios = require('axios');
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    const DRAMABOS_API = 'https://goodshort.dramabos.my.id';
    
    // Test direct API call dengan berbagai headers
    async function testAPI(bookId, lang) {
        const url = `${DRAMABOS_API}/book/quick/open?bookId=${bookId}&lang=${lang}`;
        
        const headerVariants = [
            // Variant 1: Minimal
            {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            // Variant 2: Full browser
            {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Origin': 'https://goodshort.dramabos.my.id',
                'Referer': 'https://goodshort.dramabos.my.id/',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            },
            // Variant 3: Dengan region
            {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'x-region': 'ID',
                'x-lang': lang
            }
        ];
        
        const results = [];
        
        for (let i = 0; i < headerVariants.length; i++) {
            try {
                console.log(`\n=== Testing variant ${i + 1} ===`);
                console.log(`URL: ${url}`);
                
                const response = await axios.get(url, {
                    headers: headerVariants[i],
                    timeout: 15000,
                    validateStatus: () => true // Accept any status
                });
                
                results.push({
                    variant: i + 1,
                    status: response.status,
                    success: response.data?.success || false,
                    data_exists: !!response.data,
                    headers_used: Object.keys(headerVariants[i]),
                    response_preview: JSON.stringify(response.data).substring(0, 200)
                });
                
                // Kalau sukses, return langsung
                if (response.data && response.data.success) {
                    console.log(`✓ Success with variant ${i + 1}`);
                    return {
                        success: true,
                        data: response.data,
                        working_variant: i + 1
                    };
                }
                
            } catch (error) {
                results.push({
                    variant: i + 1,
                    error: error.message
                });
            }
        }
        
        return {
            success: false,
            results: results,
            tested_url: url
        };
    }
    
    const { url, query } = req;
    const pathname = url.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    
    try {
        // GET /
        if (parts.length === 0) {
            return res.json({
                service: 'GoodShort API - Debug Mode',
                version: '11.0',
                status: 'debugging',
                test_endpoint: '/test/31001241758?lang=in',
                note: 'Testing different header combinations'
            });
        }
        
        // GET /test/:bookId - Debugging endpoint
        if (parts[0] === 'test' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'in';
            
            const result = await testAPI(bookId, lang);
            
            return res.json({
                status: result.success ? 'success' : 'failed',
                book_id: bookId,
                lang: lang,
                result: result
            });
        }
        
        // GET /book/:bookId - Using best variant
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            const lang = query.lang || 'in';
            
            const result = await testAPI(bookId, lang);
            
            if (!result.success) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found - None of the header variants worked',
                    book_id: bookId,
                    lang: lang,
                    debug_info: result.results,
                    hint: 'Check /test/' + bookId + '?lang=' + lang + ' for details'
                });
            }
            
            const book = result.data.data.book;
            const chapters = result.data.data.list || [];
            
            return res.json({
                status: 'success',
                working_variant: result.working_variant,
                data: {
                    id: book.bookId,
                    title: book.bookName,
                    description: book.introduction,
                    cover: book.cover || book.bookDetailCover,
                    author: book.playwright || book.producer,
                    language: book.languageDisplay,
                    status: book.writeStatus,
                    rating: book.ratings,
                    views: book.viewCount,
                    view_display: book.viewCountDisplay,
                    tags: book.labels || [],
                    chapter_count: book.chapterCount,
                    total_chapters: chapters.length,
                    chapters: chapters.map(ch => ({
                        id: ch.id,
                        chapter_number: ch.index + 1,
                        title: ch.chapterName,
                        image: ch.image,
                        play_time: ch.playTime,
                        play_count: ch.playCount
                    }))
                }
            });
        }
        
        return res.status(404).json({
            status: 'error',
            message: 'Endpoint not found. Try /test/31001241758?lang=in'
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
}
