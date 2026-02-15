from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import json
import re

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse URL
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        
        # Headers untuk response
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        # Helper function untuk fetch HTML
        def fetch_html(url):
            try:
                req = urllib.request.Request(url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                req.add_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
                req.add_header('Accept-Language', 'id-ID,id;q=0.9,en-US;q=0.8')
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.read().decode('utf-8')
            except Exception as e:
                print(f"Error fetching {url}: {e}")
                return None
        
        # Parse HTML dengan regex (tanpa BeautifulSoup)
        def extract_dramas(html):
            dramas = []
            seen_ids = set()
            
            # Pattern untuk link drama
            pattern = r'<a[^>]*href="([^"]*\/(\d{10,})[^"]*)"[^>]*>(.*?)</a>'
            matches = re.finditer(pattern, html, re.DOTALL)
            
            for match in matches:
                url = match.group(1)
                drama_id = match.group(2)
                content = match.group(3)
                
                if drama_id in seen_ids:
                    continue
                
                # Cari image
                img_match = re.search(r'<img[^>]*(?:src|data-src)="([^"]+)"[^>]*(?:alt|title)="([^"]*)"', content)
                if not img_match:
                    img_match = re.search(r'<img[^>]*(?:alt|title)="([^"]*)"[^>]*(?:src|data-src)="([^"]+)"', content)
                    if img_match:
                        thumbnail = img_match.group(2)
                        title = img_match.group(1)
                    else:
                        continue
                else:
                    thumbnail = img_match.group(1)
                    title = img_match.group(2)
                
                if not title:
                    # Cari title dari text
                    title_match = re.search(r'>([^<]+)<', content)
                    if title_match:
                        title = title_match.group(1).strip()
                
                if drama_id and title:
                    seen_ids.add(drama_id)
                    
                    # Clean URL
                    if not url.startswith('http'):
                        url = f"https://www.goodshort.com{url}"
                    if not thumbnail.startswith('http'):
                        thumbnail = f"https://www.goodshort.com{thumbnail}"
                    
                    dramas.append({
                        'id': drama_id,
                        'title': title[:200],
                        'url': url,
                        'thumbnail': thumbnail
                    })
            
            return dramas
        
        # Extract book detail
        def extract_book_detail(html, book_id):
            # Extract title
            title = ''
            title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
            if title_match:
                title = title_match.group(1).strip()
            else:
                title_match = re.search(r'<meta[^>]*property="og:title"[^>]*content="([^"]+)"', html)
                if title_match:
                    title = title_match.group(1)
            
            if not title:
                return None
            
            # Extract description
            desc = ''
            desc_match = re.search(r'<meta[^>]*property="og:description"[^>]*content="([^"]+)"', html)
            if desc_match:
                desc = desc_match.group(1)
            
            # Extract thumbnail
            thumb = ''
            thumb_match = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]+)"', html)
            if thumb_match:
                thumb = thumb_match.group(1)
            
            # Extract chapters
            chapters = []
            seen_ch = set()
            
            # Pattern untuk episode links
            ep_pattern = r'<a[^>]*href="([^"]*\/(\d{10,})[^"]*)"[^>]*>([^<]*(?:episode|ep|Episode|Ep|Part|Chapter)[^<]*)</a>'
            ep_matches = re.finditer(ep_pattern, html, re.IGNORECASE)
            
            for match in ep_matches:
                ch_url = match.group(1)
                ch_id = match.group(2)
                ch_title = match.group(3).strip()
                
                if ch_id == book_id or ch_id in seen_ch:
                    continue
                
                seen_ch.add(ch_id)
                
                # Extract episode number
                num_match = re.search(r'\d+', ch_title)
                ep_num = int(num_match.group(0)) if num_match else len(chapters) + 1
                
                if not ch_url.startswith('http'):
                    ch_url = f"https://www.goodshort.com{ch_url}"
                
                chapters.append({
                    'id': ch_id,
                    'chapter_number': ep_num,
                    'title': ch_title or f"Episode {ep_num}",
                    'url': ch_url
                })
            
            # Sort chapters
            chapters.sort(key=lambda x: x['chapter_number'])
            
            return {
                'id': book_id,
                'title': title,
                'description': desc,
                'thumbnail': thumb,
                'total_chapters': len(chapters),
                'chapters': chapters
            }
        
        # Extract video sources
        def extract_video_sources(html):
            sources = []
            seen = set()
            
            # Pattern untuk m3u8
            m3u8_pattern = r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)'
            for match in re.finditer(m3u8_pattern, html):
                url = match.group(1)
                if url not in seen:
                    seen.add(url)
                    sources.append({
                        'type': 'm3u8',
                        'quality': 'auto',
                        'url': url
                    })
            
            # Pattern untuk mp4
            mp4_pattern = r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)'
            for match in re.finditer(mp4_pattern, html):
                url = match.group(1)
                if url not in seen:
                    seen.add(url)
                    sources.append({
                        'type': 'mp4',
                        'quality': 'auto',
                        'url': url
                    })
            
            # Pattern untuk video src
            video_pattern = r'<video[^>]*src="([^"]+)"'
            for match in re.finditer(video_pattern, html):
                url = match.group(1)
                if url not in seen:
                    seen.add(url)
                    if not url.startswith('http'):
                        url = f"https://www.goodshort.com{url}"
                    sources.append({
                        'type': 'video',
                        'quality': 'auto',
                        'url': url
                    })
            
            return sources
        
        # Route handling
        try:
            parts = [p for p in path.split('/') if p]
            lang = params.get('lang', ['id'])[0]
            
            # Root endpoint
            if not parts:
                response = {
                    'service': 'GoodShort Scraper API',
                    'version': '16.0',
                    'status': 'online',
                    'type': 'Pure Python Scraper',
                    'endpoints': {
                        '/': 'This info',
                        '/home?lang=id': 'Get all dramas',
                        '/search?q=keyword&lang=id': 'Search dramas',
                        '/book/{id}?lang=id': 'Book detail',
                        '/chapters/{id}?lang=id': 'Get chapters',
                        '/play/{id}?lang=id': 'Get video sources',
                        '/m3u8/{id}?lang=id': 'Get stream URL'
                    }
                }
            
            # Home endpoint
            elif parts[0] == 'home':
                url = f"https://www.goodshort.com/{lang}"
                html = fetch_html(url)
                
                if not html:
                    response = {
                        'status': 'error',
                        'message': 'Failed to fetch home page'
                    }
                else:
                    dramas = extract_dramas(html)
                    response = {
                        'status': 'success',
                        'lang': lang,
                        'total': len(dramas),
                        'data': dramas
                    }
            
            # Search endpoint
            elif parts[0] == 'search':
                q = params.get('q', [''])[0]
                if not q:
                    response = {
                        'status': 'error',
                        'message': 'Query parameter "q" required'
                    }
                else:
                    url = f"https://www.goodshort.com/{lang}"
                    html = fetch_html(url)
                    
                    if not html:
                        response = {
                            'status': 'error',
                            'message': 'Failed to fetch data'
                        }
                    else:
                        all_dramas = extract_dramas(html)
                        results = [d for d in all_dramas if q.lower() in d['title'].lower()]
                        response = {
                            'status': 'success',
                            'query': q,
                            'lang': lang,
                            'total': len(results),
                            'data': results
                        }
            
            # Book detail endpoint
            elif parts[0] == 'book' and len(parts) > 1:
                book_id = parts[1]
                
                # Try multiple URL patterns
                urls = [
                    f"https://www.goodshort.com/{lang}/{book_id}",
                    f"https://www.goodshort.com/{book_id}",
                    f"https://www.goodshort.com/{lang}/drama/{book_id}",
                    f"https://www.goodshort.com/drama/{book_id}"
                ]
                
                book = None
                for url in urls:
                    html = fetch_html(url)
                    if html and len(html) > 5000:
                        book = extract_book_detail(html, book_id)
                        if book:
                            break
                
                if book:
                    response = {
                        'status': 'success',
                        'data': book
                    }
                else:
                    response = {
                        'status': 'error',
                        'message': 'Book not found',
                        'book_id': book_id
                    }
            
            # Chapters endpoint
            elif parts[0] == 'chapters' and len(parts) > 1:
                book_id = parts[1]
                
                urls = [
                    f"https://www.goodshort.com/{lang}/{book_id}",
                    f"https://www.goodshort.com/{book_id}",
                    f"https://www.goodshort.com/{lang}/drama/{book_id}",
                    f"https://www.goodshort.com/drama/{book_id}"
                ]
                
                book = None
                for url in urls:
                    html = fetch_html(url)
                    if html and len(html) > 5000:
                        book = extract_book_detail(html, book_id)
                        if book:
                            break
                
                if book:
                    response = {
                        'status': 'success',
                        'book_id': book_id,
                        'book_title': book['title'],
                        'total': len(book['chapters']),
                        'data': book['chapters']
                    }
                else:
                    response = {
                        'status': 'error',
                        'message': 'Book not found'
                    }
            
            # Play endpoint
            elif parts[0] == 'play' and len(parts) > 1:
                chapter_id = parts[1]
                
                urls = [
                    f"https://www.goodshort.com/{lang}/{chapter_id}",
                    f"https://www.goodshort.com/{chapter_id}",
                    f"https://www.goodshort.com/{lang}/episode/{chapter_id}",
                    f"https://www.goodshort.com/episode/{chapter_id}"
                ]
                
                sources = []
                for url in urls:
                    html = fetch_html(url)
                    if html:
                        sources = extract_video_sources(html)
                        if sources:
                            break
                
                if sources:
                    response = {
                        'status': 'success',
                        'data': {
                            'id': chapter_id,
                            'total_sources': len(sources),
                            'sources': sources
                        }
                    }
                else:
                    response = {
                        'status': 'error',
                        'message': 'No video sources found'
                    }
            
            # M3U8 endpoint
            elif parts[0] == 'm3u8' and len(parts) > 1:
                chapter_id = parts[1]
                
                urls = [
                    f"https://www.goodshort.com/{lang}/{chapter_id}",
                    f"https://www.goodshort.com/{chapter_id}",
                    f"https://www.goodshort.com/{lang}/episode/{chapter_id}",
                    f"https://www.goodshort.com/episode/{chapter_id}"
                ]
                
                sources = []
                for url in urls:
                    html = fetch_html(url)
                    if html:
                        sources = extract_video_sources(html)
                        if sources:
                            break
                
                # Find best source
                best = None
                if sources:
                    for s in sources:
                        if s['type'] == 'm3u8':
                            best = s
                            break
                    if not best:
                        best = sources[0]
                
                if best:
                    response = {
                        'status': 'success',
                        'data': {
                            'id': chapter_id,
                            'stream_url': best['url'],
                            'type': best['type'],
                            'quality': best['quality']
                        }
                    }
                else:
                    response = {
                        'status': 'error',
                        'message': 'No stream found'
                    }
            
            else:
                response = {
                    'status': 'error',
                    'message': 'Endpoint not found',
                    'path': path
                }
            
            # Send response
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            error_response = {
                'status': 'error',
                'message': str(e),
                'type': type(e).__name__
            }
            self.wfile.write(json.dumps(error_response).encode())
