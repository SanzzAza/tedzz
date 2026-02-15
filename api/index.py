from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from bs4 import BeautifulSoup
import requests
import json
import re

BASE_URL = 'https://www.goodshort.com'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
}

def fetch_page(url):
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        if response.status_code == 200:
            return response.text
        return None
    except:
        return None

def scrape_home(lang='id'):
    html = fetch_page(f"{BASE_URL}/{lang}")
    if not html:
        return []
    
    soup = BeautifulSoup(html, 'lxml')
    dramas = []
    seen = set()
    
    for link in soup.find_all('a', href=True):
        href = link['href']
        id_match = re.search(r'/(\d{10,})', href)
        
        if not id_match or id_match.group(1) in seen:
            continue
        
        img = link.find('img')
        if not img:
            continue
        
        drama_id = id_match.group(1)
        seen.add(drama_id)
        
        dramas.append({
            'id': drama_id,
            'title': (link.get('title') or img.get('alt') or 'No Title')[:200],
            'url': href if href.startswith('http') else f"{BASE_URL}{href}",
            'thumbnail': (img.get('src') or img.get('data-src') or ''),
            'lang': lang
        })
    
    return dramas

def scrape_book(book_id, lang='id'):
    patterns = [
        f"{BASE_URL}/{lang}/{book_id}",
        f"{BASE_URL}/{book_id}",
        f"{BASE_URL}/{lang}/drama/{book_id}",
        f"{BASE_URL}/drama/{book_id}"
    ]
    
    html = None
    for url in patterns:
        html = fetch_page(url)
        if html and len(html) > 5000:
            break
    
    if not html:
        return None
    
    soup = BeautifulSoup(html, 'lxml')
    
    # Title
    title = ''
    h1 = soup.find('h1')
    if h1:
        title = h1.get_text(strip=True)
    
    if not title:
        meta = soup.find('meta', property='og:title')
        if meta:
            title = meta.get('content', '')
    
    if not title or len(title) < 2:
        return None
    
    # Description
    desc = ''
    meta_desc = soup.find('meta', property='og:description')
    if meta_desc:
        desc = meta_desc.get('content', '')
    
    # Thumbnail
    thumb = ''
    meta_img = soup.find('meta', property='og:image')
    if meta_img:
        thumb = meta_img.get('content', '')
    
    # Tags
    tags = []
    for elem in soup.select('[class*="tag"], [class*="label"]'):
        tag = elem.get_text(strip=True)
        if tag and len(tag) < 50:
            tags.append(tag)
    
    # Chapters
    chapters = []
    seen_ch = set()
    
    for link in soup.find_all('a', href=True):
        href = link['href']
        text = link.get_text(strip=True)
        
        if not re.search(r'episode|ep|part|chapter', text + href, re.I):
            continue
        
        ch_match = re.search(r'/(\d{10,})', href)
        if not ch_match:
            continue
        
        ch_id = ch_match.group(1)
        if ch_id == book_id or ch_id in seen_ch:
            continue
        
        seen_ch.add(ch_id)
        
        num_match = re.search(r'\d+', text)
        num = int(num_match.group(0)) if num_match else len(chapters) + 1
        
        chapters.append({
            'id': ch_id,
            'chapter_number': num,
            'title': text or f"Episode {num}",
            'url': href if href.startswith('http') else f"{BASE_URL}{href}"
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

def scrape_chapter(ch_id, lang='id'):
    patterns = [
        f"{BASE_URL}/{lang}/{ch_id}",
        f"{BASE_URL}/{ch_id}",
        f"{BASE_URL}/{lang}/episode/{ch_id}",
        f"{BASE_URL}/episode/{ch_id}"
    ]
    
    html = None
    for url in patterns:
        html = fetch_page(url)
        if html and len(html) > 3000:
            break
    
    if not html:
        return None
    
    soup = BeautifulSoup(html, 'lxml')
    
    title = ''
    h1 = soup.find('h1')
    if h1:
        title = h1.get_text(strip=True)
    else:
        title = f"Episode {ch_id}"
    
    sources = []
    seen = set()
    
    # Video tags
    for video in soup.find_all('video'):
        src = video.get('src')
        if src and src not in seen:
            seen.add(src)
            sources.append({
                'type': 'video',
                'quality': 'auto',
                'url': src if src.startswith('http') else f"{BASE_URL}{src}"
            })
    
    # Scripts
    scripts = soup.find_all('script')
    all_text = '\n'.join([s.string for s in scripts if s.string])
    
    for match in re.finditer(r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)', all_text, re.I):
        url = match.group(1)
        if url not in seen:
            seen.add(url)
            sources.append({'type': 'm3u8', 'quality': 'auto', 'url': url})
    
    for match in re.finditer(r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)', all_text, re.I):
        url = match.group(1)
        if url not in seen:
            seen.add(url)
            sources.append({'type': 'mp4', 'quality': 'auto', 'url': url})
    
    return {
        'id': ch_id,
        'title': title,
        'total_sources': len(sources),
        'sources': sources
    }

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        
        lang = params.get('lang', ['id'])[0]
        q = params.get('q', [''])[0]
        
        parts = [p for p in path.split('/') if p]
        
        try:
            # Root
            if not parts:
                response = {
                    'service': 'GoodShort API',
                    'version': '14.0',
                    'status': 'online',
                    'endpoints': {
                        'GET /nav': 'Nav',
                        'GET /home?lang=id': 'Home',
                        'GET /search?q=x&lang=id': 'Search',
                        'GET /hot?lang=id': 'Hot',
                        'GET /book/{id}?lang=id': 'Book',
                        'GET /chapters/{id}?lang=id': 'Chapters',
                        'GET /play/{id}?lang=id': 'Play',
                        'GET /m3u8/{id}?lang=id': 'M3U8'
                    }
                }
            
            # Nav
            elif parts[0] == 'nav':
                response = {
                    'status': 'success',
                    'data': [
                        {'id': 'home', 'title': 'Home', 'path': '/home'},
                        {'id': 'hot', 'title': 'Hot', 'path': '/hot'},
                        {'id': 'search', 'title': 'Search', 'path': '/search'}
                    ]
                }
            
            # Home
            elif parts[0] == 'home':
                dramas = scrape_home(lang)
                response = {
                    'status': 'success',
                    'lang': lang,
                    'total': len(dramas),
                    'data': dramas
                }
            
            # Search
            elif parts[0] == 'search':
                if not q:
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'Query required'}).encode())
                    return
                
                all_dramas = scrape_home(lang)
                results = [d for d in all_dramas if q.lower() in d['title'].lower()]
                response = {
                    'status': 'success',
                    'query': q,
                    'total': len(results),
                    'data': results
                }
            
            # Hot
            elif parts[0] == 'hot':
                dramas = scrape_home(lang)[:10]
                response = {
                    'status': 'success',
                    'total': len(dramas),
                    'data': dramas
                }
            
            # Book
            elif parts[0] == 'book' and len(parts) > 1:
                book = scrape_book(parts[1], lang)
                if not book:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'Not found'}).encode())
                    return
                
                response = {'status': 'success', 'data': book}
            
            # Chapters
            elif parts[0] == 'chapters' and len(parts) > 1:
                book = scrape_book(parts[1], lang)
                if not book:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'Not found'}).encode())
                    return
                
                response = {
                    'status': 'success',
                    'book_id': parts[1],
                    'book_title': book['title'],
                    'total': len(book['chapters']),
                    'data': book['chapters']
                }
            
            # Play
            elif parts[0] == 'play' and len(parts) > 1:
                chapter = scrape_chapter(parts[1], lang)
                if not chapter:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'Not found'}).encode())
                    return
                
                response = {'status': 'success', 'data': chapter}
            
            # M3U8
            elif parts[0] == 'm3u8' and len(parts) > 1:
                chapter = scrape_chapter(parts[1], lang)
                if not chapter or not chapter['sources']:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'No sources'}).encode())
                    return
                
                best = chapter['sources'][0]
                for s in chapter['sources']:
                    if s['type'] == 'm3u8':
                        best = s
                        break
                
                response = {
                    'status': 'success',
                    'data': {
                        'id': parts[1],
                        'stream_url': best['url'],
                        'type': best['type'],
                        'all_sources': chapter['sources']
                    }
                }
            
            else:
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Not found'}).encode())
                return
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
        
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode())
