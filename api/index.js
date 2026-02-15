const chromium = require('chrome-aws-lambda');

async function scrapeWithBrowser(url) {
    let browser = null;
    
    try {
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        console.log(`Opening: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 25000
        });
        
        // Wait for content to load
        await page.waitForTimeout(3000);
        
        // Get HTML
        const html = await page.content();
        
        // Extract data using page.evaluate
        const data = await page.evaluate(() => {
            const dramas = [];
            
            // Find all links with drama IDs
            const links = document.querySelectorAll('a[href*="/"]');
            
            links.forEach(link => {
                const href = link.getAttribute('href') || '';
                const match = href.match(/\/(\d{10,})/);
                
                if (!match) return;
                
                const id = match[1];
                
                // Find image
                const img = link.querySelector('img');
                if (!img) return;
                
                const title = link.getAttribute('title') || 
                             img.getAttribute('alt') || 
                             link.textContent.trim() ||
                             'No Title';
                
                const thumbnail = img.getAttribute('src') || 
                                 img.getAttribute('data-src') ||
                                 img.getAttribute('data-original') || '';
                
                dramas.push({
                    id: id,
                    title: title.substring(0, 200),
                    url: href.startsWith('http') ? href : `https://www.goodshort.com${href}`,
                    thumbnail: thumbnail.startsWith('http') ? thumbnail : 
                              (thumbnail.startsWith('//') ? `https:${thumbnail}` : 
                              `https://www.goodshort.com${thumbnail}`)
                });
            });
            
            // Remove duplicates
            const unique = [];
            const seenIds = new Set();
            
            dramas.forEach(d => {
                if (!seenIds.has(d.id)) {
                    seenIds.add(d.id);
                    unique.push(d);
                }
            });
            
            return unique;
        });
        
        await browser.close();
        
        return data;
        
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        console.error('Browser error:', error);
        return [];
    }
}

async function scrapeBookDetail(url, bookId) {
    let browser = null;
    
    try {
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 });
        await page.waitForTimeout(3000);
        
        const bookData = await page.evaluate((bookId) => {
            // Title
            const h1 = document.querySelector('h1');
            const title = h1 ? h1.textContent.trim() : 'Unknown';
            
            // Description
            const descElem = document.querySelector('[class*="desc"], [class*="intro"], [class*="summary"]');
            const description = descElem ? descElem.textContent.trim() : '';
            
            // Thumbnail
            const coverImg = document.querySelector('img[class*="cover"], img[class*="poster"], img');
            const thumbnail = coverImg ? (coverImg.src || coverImg.getAttribute('data-src') || '') : '';
            
            // Tags
            const tags = [];
            document.querySelectorAll('[class*="tag"], [class*="label"], [class*="genre"]').forEach(elem => {
                const tag = elem.textContent.trim();
                if (tag && tag.length > 1 && tag.length < 50) {
                    tags.push(tag);
                }
            });
            
            // Chapters
            const chapters = [];
            const seenIds = new Set();
            
            document.querySelectorAll('a[href]').forEach((link, index) => {
                const href = link.getAttribute('href') || '';
                const text = link.textContent.trim();
                
                // Check if it's episode
                if (!text.match(/episode|ep|part|chapter/i) && !href.match(/episode|ep/i)) {
                    return;
                }
                
                const match = href.match(/\/(\d{10,})/);
                if (!match) return;
                
                const chId = match[1];
                if (chId === bookId || seenIds.has(chId)) return;
                
                seenIds.add(chId);
                
                const numMatch = text.match(/\d+/);
                const num = numMatch ? parseInt(numMatch[0]) : chapters.length + 1;
                
                chapters.push({
                    id: chId,
                    chapter_number: num,
                    title: text || `Episode ${num}`,
                    url: href.startsWith('http') ? href : `https://www.goodshort.com${href}`
                });
            });
            
            chapters.sort((a, b) => a.chapter_number - b.chapter_number);
            
            return {
                id: bookId,
                title,
                description,
                thumbnail,
                tags,
                total_chapters: chapters.length,
                chapters
            };
        }, bookId);
        
        await browser.close();
        
        return bookData;
        
    } catch (error) {
        if (browser) await browser.close();
        console.error('Browser error:', error);
        return null;
    }
}

module.exports = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const params = Object.fromEntries(url.searchParams);
    const parts = pathname.split('/').filter(Boolean);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        const lang = params.lang || 'id';
        
        // Root
        if (parts.length === 0) {
            return res.status(200).json({
                service: 'GoodShort API',
                version: '22.0',
                type: 'Puppeteer Headless Browser',
                status: 'online',
                note: 'Full JavaScript rendering with Puppeteer',
                endpoints: {
                    '/home?lang=id': 'Get dramas (with browser)',
                    '/book/{id}?lang=id': 'Book detail (with browser)',
                    '/search?q=query&lang=id': 'Search dramas'
                }
            });
        }
        
        // Home
        if (parts[0] === 'home') {
            const dramas = await scrapeWithBrowser(`https://www.goodshort.com/${lang}`);
            
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
                    message: 'Query required'
                });
            }
            
            const dramas = await scrapeWithBrowser(`https://www.goodshort.com/${lang}`);
            const results = dramas.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
            
            return res.status(200).json({
                status: 'success',
                query: query,
                total: results.length,
                data: results
            });
        }
        
        // Book
        if (parts[0] === 'book' && parts[1]) {
            const bookId = parts[1];
            const bookUrl = `https://www.goodshort.com/${lang}/${bookId}`;
            
            const book = await scrapeBookDetail(bookUrl, bookId);
            
            if (!book) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Book not found'
                });
            }
            
            return res.status(200).json({
                status: 'success',
                data: book
            });
        }
        
        return res.status(404).json({
            status: 'error',
            message: 'Not found'
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
