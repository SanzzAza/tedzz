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
            
            # Pattern untuk card/item drama
            card_pattern = r'<(?:div|article|li)[^>]*class=["\'][^"\']*(?:card|item|drama|video|movie)[^"\']*["\'][^>]*>(.*?)</(?:div|article|li)>'
            card_matches = re.finditer(card_pattern, html, re.DOTALL | re.IGNORECASE)
            
            for card_match in card_matches:
                card_html = card_match.group(1)
                
                # Extract ID from href
                id_pattern = r'href=["\'][^"\']*?/(\d{10,})[^"\']*["\']'
                id_match = re.search(id_pattern, card_html)
                
                if not id_match:
                    continue
                
                drama_id = id_match.group(1)
                
                if drama_id in seen_ids:
                    continue
                
                # Extract URL
                url_match = re.search(r'href=["\']([^"\']+)["\']', card_html)
                url = url_match.group(1) if url_match else f"/id/{drama_id}"
                
                # Extract thumbnail - multiple strategies
                thumbnail = ''
                
                # Try data-src first (lazy loading)
                img_patterns = [
                    r'<img[^>]*data-src=["\']([^"\']+)["\']',
                    r'<img[^>]*data-original=["\']([^"\']+)["\']',
                    r'<img[^>]*src=["\']([^"\']+)["\']',
                    r'background-image:\s*url\(["\']?([^"\')\s]+)["\']?\)'
                ]
                
                for pattern in img_patterns:
                    img_match = re.search(pattern, card_html)
                    if img_match:
                        thumbnail = img_match.group(1)
                        # Skip placeholder images
                        if 'default-book-cover' not in thumbnail and 'logo.png' not in thumbnail:
                            break
                
                # Extract title - multiple strategies
                title = ''
                title_patterns = [
                    r'<(?:h\d|span|div)[^>]*class=["\'][^"\']*title[^"\']*["\'][^>]*>([^<]+)<',
                    r'alt=["\']([^"\']+)["\']',
                    r'title=["\']([^"\']+)["\']',
                    r'<(?:h\d|p|span)[^>]*>([^<]{3,100})<'
                ]
                
                for pattern in title_patterns:
                    title_match = re.search(pattern, card_html)
                    if title_match:
                        potential_title = title_match.group(1).strip()
                        if len(potential_title) > 2 and not potential_title.isdigit():
                            title = potential_title
                            break
                
                if not title:
                    title = f"Drama {drama_id}"
                
                seen_ids.add(drama_id)
                
                # Clean URLs
                if not url.startswith('http'):
                    url = 'https://www.goodshort.com' + (url if url.startswith('/') else '/' + url)
                
                if thumbnail:
                    if thumbnail.startswith('//'):
                        thumbnail = 'https:' + thumbnail
                    elif not thumbnail.startswith('http'):
                        thumbnail = 'https://www.goodshort.com' + (thumbnail if thumbnail.startswith('/') else '/' + thumbnail)
                
                dramas.append({
                    'id': drama_id,
                    'title': title[:200],
                    'url': url,
                    'thumbnail': thumbnail or 'https://www.goodshort.com/default.jpg'
                })
            
            # Fallback: Find all links with drama IDs
            if len(dramas) < 10:
                link_pattern = r'<a[^>]*href=["\']([^"\']*?/(\d{10,})[^"\']*)["\'][^>]*>(.*?)</a>'
                link_matches = re.finditer(link_pattern, html, re.DOTALL)
                
                for match in link_matches[:50]:  # Limit to avoid timeout
                    url = match.group(1)
                    drama_id = match.group(2)
                    inner_html = match.group(3)
                    
                    if drama_id in seen_ids:
                        continue
                    
                    # Find any image nearby
                    img_match = re.search(r'<img[^>]+(?:src|data-src)=["\']([^"\']+)["\']', inner_html)
                    thumbnail = img_match.group(1) if img_match else ''
                    
                    # Find title
                    title_match = re.search(r'(?:alt|title)=["\']([^"\']+)["\']', inner_html)
                    if not title_match:
                        title_match = re.search(r'>([^<]{3,100})<', inner_html)
                    
                    title = title_match.group(1).strip() if title_match else f"Drama {drama_id}"
                    
                    seen_ids.add(drama_id)
                    
                    if not url.startswith('http'):
                        url = 'https://www.goodshort.com' + url
                    
                    if thumbnail:
                        if thumbnail.startswith('//'):
                            thumbnail = 'https:' + thumbnail
                        elif not thumbnail.startswith('http'):
                            thumbnail = 'https://www.goodshort.com' + thumbnail
                    
                    dramas.append({
                        'id': drama_id,
                        'title': title[:200],
                        'url': url,
                        'thumbnail': thumbnail
                    })
            
            return dramas
        
        def extract_book_detail(html, book_id):
            # Title
            title = ''
            title_patterns = [
                r'<h1[^>]*>([^<]+)</h1>',
                r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']',
                r'<title>([^<]+)</title>'
            ]
            
            for pattern in title_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    title = match.group(1).strip()
                    # Clean title
                    title = title.split('|')[0].split('-')[0].strip()
                    if len(title) > 2:
                        break
            
            if not title:
                return None
            
            # Description
            desc = ''
            desc_match = re.search(r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']', html, re.IGNORECASE)
            if desc_match:
                desc = desc_match.group(1)
            
            # Thumbnail - try multiple sources
            thumb = ''
            thumb_patterns = [
                r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
                r'<img[^>]*class=["\'][^"\']*(?:cover|poster|thumb)[^"\']*["\'][^>]*src=["\']([^"\']+)["\']',
                r'<div[^>]*class=["\'][^"\']*(?:cover|poster)[^"\']*["\'][^>]*>.*?<img[^>]*src=["\']([^"\']+)["\']'
            ]
            
            for pattern in thumb_patterns:
                match = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
                if match:
                    thumb = match.group(1)
                    if 'default-book-cover' not in thumb and 'logo.png' not in thumb:
                        break
            
            if thumb and not thumb.startswith('http'):
                if thumb.startswith('//'):
                    thumb = 'https:' + thumb
                else:
                    thumb = 'https://www.goodshort.com' + thumb
            
            # Tags
            tags = []
            tag_pattern = r'<(?:span|a|div)[^>]*class=["\'][^"\']*(?:tag|label|genre|badge)[^"\']*["\'][^>]*>([^<]+)<'
            for match in re.finditer(tag_pattern, html, re.IGNORECASE):
                tag = match.group(1).strip()
                if 1 < len(tag) < 50 and tag not in tags:
                    tags.append(tag)
                    if len(tags) >= 10:
                        break
            
            # Chapters
            chapters = []
            seen_ch = set()
            
            # Find episode container first
            episode_container = ''
            container_patterns = [
                r'<(?:div|ul|section)[^>]*class=["\'][^"\']*(?:episode|chapter|list)[^"\']*["\'][^>]*>(.*?)</(?:div|ul|section)>',
                r'<(?:div|ul|section)[^>]*id=["\'][^"\']*(?:episode|chapter)[^"\']*["\'][^>]*>(.*?)</(?:div|ul|section)>'
            ]
            
            for pattern in container_patterns:
                match = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
                if match:
                    episode_container = match.group(1)
                    break
            
            # If no container found, use entire HTML
            if not episode_container:
                episode_container = html
            
            # Find episodes
            ep_pattern = r'<a[^>]*href=["\']([^"\']*?/(\d{10,})[^"\']*)["\'][^>]*>([^<]*(?:episode|ep|part|chapter|Episode|Ep|第)[^<]*)</a>'
            for match in re.finditer(ep_pattern, episode_container, re.IGNORECASE):
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
                    ch_url = 'https://www.goodshort.com' + ch_url
                
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
                'tags': tags,
                'total_chapters': len(chapters),
                'chapters': chapters
            }
        
        def extract_video_sources(html):
            sources = []
            seen = set()
            
            # Direct video URLs in HTML
            video_patterns = [
                (r'<video[^>]*src=["\']([^"\']+)["\']', 'video'),
                (r'<source[^>]*src=["\']([^"\']+)["\']', 'video'),
                (r'<iframe[^>]*src=["\']([^"\']+)["\']', 'iframe'),
            ]
            
            for pattern, vid_type in video_patterns:
                for match in re.finditer(pattern, html, re.IGNORECASE):
                    url = match.group(1)
                    if url and url not in seen:
                        seen.add(url)
                        if not url.startswith('http'):
                            url = 'https://www.goodshort.com' + url
                        sources.append({
                            'type': vid_type,
                            'quality': 'auto',
                            'url': url
                        })
            
            # URLs in JavaScript
            js_patterns = [
                (r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)', 'm3u8'),
                (r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)', 'mp4'),
                (r'"file"\s*:\s*"([^"]+)"', 'auto'),
                (r'"source"\s*:\s*"([^"]+)"', 'auto'),
                (r'"url"\s*:\s*"([^"]+)"', 'auto'),
                (r'videoUrl\s*[:=]\s*["\']([^"\']+)["\']', 'auto'),
                (r'playUrl\s*[:=]\s*["\']([^"\']+)["\']', 'auto')
            ]
            
            for pattern, vid_type in js_patterns:
                for match in re.finditer(pattern, html, re.IGNORECASE):
                    url = match.group(1)
                    
                    if not url.startswith('http'):
                        continue
                    
                    if url in seen:
                        continue
                    
                    seen.add(url)
                    
                    # Detect type
                    if vid_type == 'auto':
                        if '.m3u8' in url:
                            vid_type = 'm3u8'
                        elif '.mp4' in url:
                            vid_type = 'mp4'
                        elif '.webm' in url:
                            vid_type = 'webm'
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
                    'service': 'GoodShort Scraper API',
                    'version': '18.0',
                    'status': 'online',
                    'endpoints': {
                        '/home?lang=id': 'Get all dramas',
                        '/search?q=keyword&lang=id': 'Search dramas',
                        '/book/{id}?lang=id': 'Book detail with chapters',
                        '/chapters/{id}?lang=id': 'Get chapters only',
                        '/play/{id}?lang=id': 'Get video sources',
                        '/m3u8/{id}?lang=id': 'Get best stream URL',
                        '/debug?lang=id': 'Debug mode'
                    },
                    'example': '/book/31001161807?lang=id'
                }
            
            # Debug
            elif parts[0] == 'debug':
                url = f"https://www.goodshort.com/{lang}"
                html = fetch_html(url)
                
                if html:
                    # Find sample drama cards
                    sample_cards = []
                    card_pattern = r'<(?:div|article|li)[^>]*class=["\'][^"\']*(?:card|item|drama|video)[^"\']*["\'][^>]*>(.*?)</(?:div|article|li)>'
                    matches = re.finditer(card_pattern, html[:50000], re.DOTALL | re.IGNORECASE)
                    
                    for match in list(matches)[:3]:
                        sample_cards.append(match.group(0)[:500])
                    
                    response = {
                        'status': 'success',
                        'html_length': len(html),
                        'sample_cards': sample_cards,
                        'total_ids_found': len(re.findall(r'\d{10,}', html))
                    }
                else:
                    response = {'status': 'error', 'message': 'Failed to fetch'}
            
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
                            'lang': lang,
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
                    response = {'status': 'error', 'message': 'No sources found'}
            
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
                    # Priority: m3u8 > mp4 > video
                    for s in sources:
                        if s['type'] == 'm3u8':
                            best = s
                            break
                    if not best:
                        for s in sources:
                            if s['type'] == 'mp4':
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
                    response = {'status': 'error', 'message': 'No stream found'}
            
            else:
                response = {'status': 'error', 'message': 'Endpoint not found', 'path': path}
            
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            error = {
                'status': 'error',
                'message': str(e),
                'type': type(e).__name__
            }
            self.wfile.write(json.dumps(error).encode())
