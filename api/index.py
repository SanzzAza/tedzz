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
                req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                req.add_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
                req.add_header('Accept-Language', 'id-ID,id;q=0.9,en-US;q=0.8')
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.read().decode('utf-8', errors='ignore')
            except:
                return None
        
        def extract_dramas(html):
            dramas = []
            seen_ids = set()
            
            # Find all drama IDs (10+ digits)
            all_ids = re.findall(r'/(\d{10,})', html)
            
            for drama_id in all_ids:
                if drama_id in seen_ids:
                    continue
                
                seen_ids.add(drama_id)
                
                # Find context around this ID
                idx = html.find(drama_id)
                if idx == -1:
                    continue
                
                # Get 1000 chars before and after
                start = max(0, idx - 1000)
                end = min(len(html), idx + 1000)
                context = html[start:end]
                
                # Find title
                title = ''
                title_patterns = [
                    r'alt="([^"]+)"',
                    r'title="([^"]+)"',
                    r'>([^<]{3,100})<'
                ]
                
                for pattern in title_patterns:
                    match = re.search(pattern, context)
                    if match:
                        title = match.group(1).strip()
                        if len(title) > 2:
                            break
                
                if not title:
                    title = f"Drama {drama_id}"
                
                # Find thumbnail
                thumbnail = ''
                img_patterns = [
                    r'data-src="([^"]+)"',
                    r'data-original="([^"]+)"',
                    r'src="([^"]+\.(?:jpg|jpeg|png|webp))"'
                ]
                
                for pattern in img_patterns:
                    match = re.search(pattern, context)
                    if match:
                        thumbnail = match.group(1)
                        if 'default-book-cover' not in thumbnail:
                            break
                
                # Clean URLs
                url = f"https://www.goodshort.com/id/{drama_id}"
                
                if thumbnail:
                    if thumbnail.startswith('//'):
                        thumbnail = 'https:' + thumbnail
                    elif not thumbnail.startswith('http'):
                        thumbnail = 'https://www.goodshort.com' + thumbnail
                
                dramas.append({
                    'id': drama_id,
                    'title': title[:200],
                    'url': url,
                    'thumbnail': thumbnail or 'https://www.goodshort.com/default.jpg'
                })
                
                # Limit to 50 dramas
                if len(dramas) >= 50:
                    break
            
            return dramas
        
        def extract_book_detail(html, book_id):
            # Title
            title = ''
            title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
            if title_match:
                title = title_match.group(1).strip()
            else:
                title_match = re.search(r'<title>([^<]+)</title>', html)
                if title_match:
                    title = title_match.group(1).split('|')[0].strip()
            
            if not title:
                return None
            
            # Description
            desc = ''
            desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
            if desc_match:
                desc = desc_match.group(1)
            
            # Thumbnail
            thumb = ''
            thumb_match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
            if thumb_match:
                thumb = thumb_match.group(1)
            
            # Tags
            tags = []
            tag_matches = re.findall(r'class="[^"]*tag[^"]*">([^<]+)<', html)
            for tag in tag_matches[:10]:
                tag = tag.strip()
                if len(tag) > 1 and len(tag) < 50:
                    tags.append(tag)
            
            # Chapters
            chapters = []
            seen_ch = set()
            
            # Find all episode links
            ep_matches = re.findall(r'href="([^"]*?/(\d{10,})[^"]*)"[^>]*>([^<]*[Ee]pisode[^<]*)', html)
            
            for ch_url, ch_id, ch_title in ep_matches:
                if ch_id == book_id or ch_id in seen_ch:
                    continue
                
                seen_ch.add(ch_id)
                
                # Extract number
                num_match = re.search(r'\d+', ch_title)
                ep_num = int(num_match.group(0)) if num_match else len(chapters) + 1
                
                if not ch_url.startswith('http'):
                    ch_url = 'https://www.goodshort.com' + ch_url
                
                chapters.append({
                    'id': ch_id,
                    'chapter_number': ep_num,
                    'title': ch_title.strip() or f"Episode {ep_num}",
                    'url': ch_url
                })
            
            chapters.sort(key=lambda x: x['chapter_number'])
            
            return {
                'id': book_id,
                'title': title,
                'description': desc,
                'thumbnail': thumb,
                'tags': tags,
                'total_chapters': len(chapters),
                'chapters': chapters
            }
        
        def extract_video_sources(html):
            sources = []
            seen = set()
            
            # Find m3u8 URLs
            m3u8_matches = re.findall(r'(https?://[^\s"\']+\.m3u8[^\s"\']*)', html)
            for url in m3u8_matches:
                if url not in seen:
                    seen.add(url)
                    sources.append({
                        'type': 'm3u8',
                        'quality': 'auto',
                        'url': url
                    })
            
            # Find mp4 URLs
            mp4_matches = re.findall(r'(https?://[^\s"\']+\.mp4[^\s"\']*)', html)
            for url in mp4_matches:
                if url not in seen:
                    seen.add(url)
                    sources.append({
                        'type': 'mp4',
                        'quality': 'auto',
                        'url': url
                    })
            
            return sources
        
        # Routes
        try:
            parts = path.strip('/').split('/')
            if parts == ['']:
                parts = []
            
            lang = params.get('lang', ['id'])[0] if params else 'id'
            
            # Root
            if not parts:
                response = {
                    'service': 'GoodShort API',
                    'version': '19.0',
                    'status': 'online',
                    'endpoints': {
                        '/home?lang=id': 'Get dramas',
                        '/search?q=keyword&lang=id': 'Search',
                        '/book/{id}?lang=id': 'Book detail',
                        '/chapters/{id}?lang=id': 'Chapters',
                        '/play/{id}?lang=id': 'Video sources',
                        '/m3u8/{id}?lang=id': 'Stream URL'
                    }
                }
            
            # Home
            elif parts[0] == 'home':
                url = f"https://www.goodshort.com/{lang}"
                html = fetch_html(url)
                
                if not html:
                    response = {'status': 'error', 'message': 'Failed to fetch'}
                else:
                    dramas = extract_dramas(html)
                    response = {
                        'status': 'success',
                        'lang': lang,
                        'total': len(dramas),
                        'data': dramas
                    }
            
            # Search
            elif parts[0] == 'search':
                q = params.get('q', [''])[0] if params else ''
                
                if not q:
                    response = {'status': 'error', 'message': 'Query required'}
                else:
                    url = f"https://www.goodshort.com/{lang}"
                    html = fetch_html(url)
                    
                    if html:
                        dramas = extract_dramas(html)
                        results = [d for d in dramas if q.lower() in d['title'].lower()]
                        response = {
                            'status': 'success',
                            'query': q,
                            'total': len(results),
                            'data': results
                        }
                    else:
                        response = {'status': 'error', 'message': 'Failed'}
            
            # Book
            elif parts[0] == 'book' and len(parts) > 1:
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
                    response = {'status': 'success', 'data': book}
                else:
                    response = {
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
                    f"https://www.goodshort.com/{chapter_id}"
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
                    f"https://www.goodshort.com/{chapter_id}"
                ]
                
                sources = []
                for url in urls:
                    html = fetch_html(url)
                    if html:
                        sources = extract_video_sources(html)
                        if sources:
                            break
                
                best = None
                for s in sources:
                    if s['type'] == 'm3u8':
                        best = s
                        break
                
                if not best and sources:
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
            
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            error = {
                'status': 'error',
                'message': str(e)
            }
            self.wfile.write(json.dumps(error).encode())
