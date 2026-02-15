from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import json
import re

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        def fetch_html(url):
            try:
                req = urllib.request.Request(url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
                req.add_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8')
                req.add_header('Accept-Language', 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7')
                req.add_header('Referer', 'https://www.goodshort.com/')
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.read().decode('utf-8', errors='ignore')
            except Exception as e:
                return None
        
        def extract_dramas_aggressive(html):
            dramas = []
            seen_ids = set()
            
            # Strategy 1: Find all href with 10+ digit ID
            href_pattern = r'href=["\']([^"\']*?/(\d{10,})(?:/|["\']))'
            href_matches = re.finditer(href_pattern, html)
            
            for match in href_matches:
                url = match.group(1)
                drama_id = match.group(2)
                
                if drama_id in seen_ids:
                    continue
                
                # Find context around this link (500 chars before and after)
                start = max(0, match.start() - 500)
                end = min(len(html), match.end() + 500)
                context = html[start:end]
                
                # Find image in context
                img_pattern = r'<img[^>]+(?:src|data-src)=["\']([^"\']+)["\'][^>]*>'
                img_match = re.search(img_pattern, context)
                
                if not img_match:
                    continue
                
                thumbnail = img_match.group(1)
                
                # Find title from alt, title attribute, or nearby text
                title = ''
                
                # Try alt attribute
                alt_match = re.search(r'alt=["\']([^"\']+)["\']', context)
                if alt_match:
                    title = alt_match.group(1)
                
                # Try title attribute
                if not title:
                    title_match = re.search(r'title=["\']([^"\']+)["\']', context)
                    if title_match:
                        title = title_match.group(1)
                
                # Try text content
                if not title:
                    text_match = re.search(r'>([^<]{3,100})<', context)
                    if text_match:
                        title = text_match.group(1).strip()
                
                if not title or len(title) < 2:
                    title = f"Drama {drama_id}"
                
                seen_ids.add(drama_id)
                
                # Clean URLs
                if not url.startswith('http'):
                    url = 'https://www.goodshort.com' + (url if url.startswith('/') else '/' + url)
                if not thumbnail.startswith('http'):
                    thumbnail = 'https://www.goodshort.com' + (thumbnail if thumbnail.startswith('/') else '/' + thumbnail)
                
                dramas.append({
                    'id': drama_id,
                    'title': title[:200],
                    'url': url.replace('"', '').replace("'", ''),
                    'thumbnail': thumbnail
                })
            
            # Strategy 2: Find all IDs in entire HTML
            if len(dramas) < 5:
                all_ids = re.findall(r'(\d{10,})', html)
                unique_ids = list(set(all_ids))[:50]  # Take first 50 unique IDs
                
                for drama_id in unique_ids:
                    if drama_id in seen_ids:
                        continue
                    
                    # Find context
                    id_pattern = re.escape(drama_id)
                    match = re.search(id_pattern, html)
                    if not match:
                        continue
                    
                    start = max(0, match.start() - 1000)
                    end = min(len(html), match.end() + 1000)
                    context = html[start:end]
                    
                    # Find image
                    img_match = re.search(r'<img[^>]+(?:src|data-src)=["\']([^"\']+)["\']', context)
                    if not img_match:
                        continue
                    
                    thumbnail = img_match.group(1)
                    
                    # Find title
                    title = ''
                    alt_match = re.search(r'alt=["\']([^"\']{2,})["\']', context)
                    if alt_match:
                        title = alt_match.group(1)
                    
                    if not title:
                        title = f"Drama {drama_id}"
                    
                    seen_ids.add(drama_id)
                    
                    if not thumbnail.startswith('http'):
                        thumbnail = 'https://www.goodshort.com' + (thumbnail if thumbnail.startswith('/') else '/' + thumbnail)
                    
                    dramas.append({
                        'id': drama_id,
                        'title': title[:200],
                        'url': f"https://www.goodshort.com/id/{drama_id}",
                        'thumbnail': thumbnail
                    })
            
            return dramas
        
        def extract_book_detail(html, book_id):
            # Title
            title = ''
            patterns = [
                r'<h1[^>]*>([^<]+)</h1>',
                r'<h2[^>]*>([^<]+)</h2>',
                r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']',
                r'<title>([^<]+)</title>'
            ]
            
            for pattern in patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    title = match.group(1).strip()
                    if len(title) > 2:
                        break
            
            if not title:
                return None
            
            # Description
            desc = ''
            desc_patterns = [
                r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']',
                r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']'
            ]
            
            for pattern in desc_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    desc = match.group(1)
                    break
            
            # Thumbnail
            thumb = ''
            thumb_patterns = [
                r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
                r'<img[^>]*class=["\'][^"\']*(?:cover|poster)[^"\']*["\'][^>]*src=["\']([^"\']+)["\']'
            ]
            
            for pattern in thumb_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    thumb = match.group(1)
                    break
            
            # Chapters - Multiple strategies
            chapters = []
            seen_ch = set()
            
            # Strategy 1: Episode text pattern
            ep_pattern = r'<a[^>]*href=["\']([^"\']*?/(\d{10,})(?:/|["\']))[^>]*>([^<]*?(?:episode|ep|part|chapter)[^<]*?)</a>'
            for match in re.finditer(ep_pattern, html, re.IGNORECASE):
                ch_url = match.group(1)
                ch_id = match.group(2)
                ch_title = match.group(3).strip()
                
                if ch_id == book_id or ch_id in seen_ch:
                    continue
                
                seen_ch.add(ch_id)
                
                num_match = re.search(r'\d+', ch_title)
                ep_num = int(num_match.group(0)) if num_match else len(chapters) + 1
                
                if not ch_url.startswith('http'):
                    ch_url = 'https://www.goodshort.com' + (ch_url if ch_url.startswith('/') else '/' + ch_url)
                
                chapters.append({
                    'id': ch_id,
                    'chapter_number': ep_num,
                    'title': ch_title or f"Episode {ep_num}",
                    'url': ch_url.replace('"', '').replace("'", '')
                })
            
            # Strategy 2: Find all IDs different from book_id
            if len(chapters) < 5:
                all_ids = re.findall(r'/(\d{10,})', html)
                for ch_id in all_ids:
                    if ch_id == book_id or ch_id in seen_ch:
                        continue
                    
                    seen_ch.add(ch_id)
                    ep_num = len(chapters) + 1
                    
                    chapters.append({
                        'id': ch_id,
                        'chapter_number': ep_num,
                        'title': f"Episode {ep_num}",
                        'url': f"https://www.goodshort.com/id/{ch_id}"
                    })
                    
                    if len(chapters) >= 60:  # Limit
                        break
            
            chapters.sort(key=lambda x: x['chapter_number'])
            
            return {
                'id': book_id,
                'title': title,
                'description': desc,
                'thumbnail': thumb,
                'total_chapters': len(chapters),
                'chapters': chapters
            }
        
        def extract_video_sources(html):
            sources = []
            seen = set()
            
            patterns = [
                (r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)', 'm3u8'),
                (r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)', 'mp4'),
                (r'(https?://[^\s"\'<>]+\.webm[^\s"\'<>]*)', 'webm'),
                (r'"file":\s*"([^"]+)"', 'auto'),
                (r'"source":\s*"([^"]+)"', 'auto'),
                (r'"url":\s*"([^"]+)"', 'auto'),
            ]
            
            for pattern, vid_type in patterns:
                for match in re.finditer(pattern, html, re.IGNORECASE):
                    url = match.group(1)
                    
                    if not url.startswith('http'):
                        continue
                    
                    if url in seen:
                        continue
                    
                    seen.add(url)
                    
                    if vid_type == 'auto':
                        if '.m3u8' in url:
                            vid_type = 'm3u8'
                        elif '.mp4' in url:
                            vid_type = 'mp4'
                        else:
                            vid_type = 'video'
                    
                    sources.append({
                        'type': vid_type,
                        'quality': 'auto',
                        'url': url
                    })
            
            return sources
        
        # Routes
        try:
            parts = [p for p in path.split('/') if p]
            lang = params.get('lang', ['id'])[0]
            
            # Root
            if not parts:
                response = {
                    'service': 'GoodShort API',
                    'version': '17.0',
                    'status': 'online',
                    'endpoints': {
                        '/home?lang=id': 'Get dramas',
                        '/search?q=keyword&lang=id': 'Search',
                        '/book/{id}?lang=id': 'Book detail',
                        '/chapters/{id}?lang=id': 'Chapters',
                        '/play/{id}?lang=id': 'Video sources',
                        '/m3u8/{id}?lang=id': 'Stream URL',
                        '/debug?lang=id': 'Debug mode'
                    }
                }
            
            # Debug mode
            elif parts[0] == 'debug':
                url = f"https://www.goodshort.com/{lang}"
                html = fetch_html(url)
                
                if html:
                    # Sample HTML
                    sample = html[:5000]
                    
                    # Find all IDs
                    all_ids = re.findall(r'(\d{10,})', html)
                    unique_ids = list(set(all_ids))[:10]
                    
                    response = {
                        'status': 'success',
                        'html_length': len(html),
                        'sample_html': sample,
                        'found_ids': unique_ids,
                        'total_unique_ids': len(set(all_ids))
                    }
                else:
                    response = {
                        'status': 'error',
                        'message': 'Failed to fetch HTML'
                    }
            
            # Home
            elif parts[0] == 'home':
                url = f"https://www.goodshort.com/{lang}"
                html = fetch_html(url)
                
                if not html:
                    response = {'status': 'error', 'message': 'Failed to fetch'}
                else:
                    dramas = extract_dramas_aggressive(html)
                    response = {
                        'status': 'success',
                        'lang': lang,
                        'total': len(dramas),
                        'data': dramas
                    }
            
            # Search
            elif parts[0] == 'search':
                q = params.get('q', [''])[0]
                if not q:
                    response = {'status': 'error', 'message': 'Query required'}
                else:
                    url = f"https://www.goodshort.com/{lang}"
                    html = fetch_html(url)
                    
                    if html:
                        dramas = extract_dramas_aggressive(html)
                        results = [d for d in dramas if q.lower() in d['title'].lower()]
                        response = {
                            'status': 'success',
                            'query': q,
                            'total': len(results),
                            'data': results
                        }
                    else:
                        response = {'status': 'error', 'message': 'Failed to fetch'}
            
            # Book
            elif parts[0] == 'book' and len(parts) > 1:
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
                
                response = {'status': 'success', 'data': book} if book else {
                    'status': 'error',
                    'message': 'Book not found',
                    'book_id': book_id
                }
            
            # Chapters
            elif parts[0] == 'chapters' and len(parts) > 1:
                book_id = parts[1]
                urls = [
                    f"https://www.goodshort.com/{lang}/{book_id}",
                    f"https://www.goodshort.com/{book_id}"
                ]
                
                book = None
                for url in urls:
                    html = fetch_html(url)
                    if html:
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
                    response = {'status': 'error', 'message': 'Not found'}
            
            # Play
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
                    response = {'status': 'error', 'message': 'No sources'}
            
            # M3U8
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
                            'type': best['type']
                        }
                    }
                else:
                    response = {'status': 'error', 'message': 'No stream'}
            
            else:
                response = {'status': 'error', 'message': 'Not found'}
            
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            error = {
                'status': 'error',
                'message': str(e),
                'type': type(e).__name__
            }
            self.wfile.write(json.dumps(error).encode())
