from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
import requests
import re
import json
import time

app = Flask(__name__)

# Config
BASE_URL = 'https://www.goodshort.com'

# Headers untuk request
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
}

def fetch_page(url, session=None):
    """Fetch page dengan retry mechanism"""
    if session is None:
        session = requests.Session()
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"[Attempt {attempt + 1}] Fetching: {url}")
            response = session.get(url, headers=HEADERS, timeout=15)
            
            if response.status_code == 200:
                print(f"✓ Success: {len(response.text)} chars")
                return response.text
            elif response.status_code == 404:
                print(f"✗ 404 Not Found")
                return None
            else:
                print(f"✗ Status: {response.status_code}")
                
        except Exception as e:
            print(f"✗ Error: {e}")
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
    
    return None

def scrape_home(lang='id'):
    """Scrape home page"""
    url = f"{BASE_URL}/{lang}"
    html = fetch_page(url)
    
    if not html:
        return []
    
    soup = BeautifulSoup(html, 'lxml')
    dramas = []
    seen_ids = set()
    
    # Cari semua link
    for link in soup.find_all('a', href=True):
        href = link.get('href')
        
        # Extract ID (minimal 10 digit)
        id_match = re.search(r'/(\d{10,})', href)
        if not id_match:
            continue
        
        drama_id = id_match.group(1)
        
        if drama_id in seen_ids:
            continue
        
        # Harus ada gambar
        img = link.find('img')
        if not img:
            continue
        
        seen_ids.add(drama_id)
        
        title = (link.get('title') or 
                img.get('alt') or 
                link.get_text(strip=True) or 
                'No Title')
        
        thumbnail = img.get('src') or img.get('data-src') or ''
        if thumbnail and not thumbnail.startswith('http'):
            thumbnail = BASE_URL + thumbnail
        
        dramas.append({
            'id': drama_id,
            'title': title[:200],
            'url': href if href.startswith('http') else f"{BASE_URL}{href}",
            'thumbnail': thumbnail,
            'lang': lang
        })
    
    print(f"✓ Scraped {len(dramas)} dramas")
    return dramas

def scrape_book_detail(book_id, lang='id'):
    """Scrape book detail"""
    url_patterns = [
        f"{BASE_URL}/{lang}/{book_id}",
        f"{BASE_URL}/{book_id}",
        f"{BASE_URL}/{lang}/drama/{book_id}",
        f"{BASE_URL}/drama/{book_id}",
    ]
    
    session = requests.Session()
    html = None
    working_url = None
    
    for url in url_patterns:
        html = fetch_page(url, session)
        if html and len(html) > 5000:
            working_url = url
            print(f"✓ Book found: {url}")
            break
    
    if not html:
        print(f"✗ Book {book_id} not found")
        return None
    
    soup = BeautifulSoup(html, 'lxml')
    
    # Extract title
    title = ''
    for selector in [soup.find('h1'), soup.find('h2'), soup.find('meta', property='og:title')]:
        if selector:
            title = selector.get('content') if selector.name == 'meta' else selector.get_text(strip=True)
            if title:
                break
    
    if not title or len(title) < 2:
        return None
    
    # Description
    description = ''
    desc_meta = soup.find('meta', property='og:description')
    if desc_meta:
        description = desc_meta.get('content', '')
    else:
        for elem in soup.select('[class*="intro"], [class*="desc"], [class*="summary"]'):
            description = elem.get_text(strip=True)
            if description:
                break
    
    # Thumbnail
    thumbnail = ''
    thumb_meta = soup.find('meta', property='og:image')
    if thumb_meta:
        thumbnail = thumb_meta.get('content', '')
    else:
        for selector in ['img[class*="cover"]', 'img[class*="poster"]', 'img']:
            img = soup.select_one(selector)
            if img:
                thumbnail = img.get('src', '')
                break
    
    if thumbnail and not thumbnail.startswith('http'):
        thumbnail = BASE_URL + thumbnail
    
    # Tags
    tags = []
    for elem in soup.select('[class*="tag"], [class*="label"], [class*="genre"]'):
        tag = elem.get_text(strip=True)
        if tag and 1 < len(tag) < 50 and tag not in tags:
            tags.append(tag)
    
    # Chapters
    chapters = []
    seen_chapter_ids = set()
    
    for link in soup.find_all('a', href=True):
        href = link.get('href')
        text = link.get_text(strip=True)
        
        # Filter episode
        if not (re.search(r'episode|ep\.?\s*\d+|part\s*\d+|chapter\s*\d+', text, re.I) or
               re.search(r'episode|ep-|chapter|watch', href, re.I)):
            continue
        
        # Extract chapter ID
        chapter_id_match = re.search(r'/(\d{10,})', href)
        if not chapter_id_match:
            continue
        
        chapter_id = chapter_id_match.group(1)
        
        # Skip jika duplicate atau sama dengan book ID
        if chapter_id == book_id or chapter_id in seen_chapter_ids:
            continue
        
        seen_chapter_ids.add(chapter_id)
        
        # Episode number
        num_match = re.search(r'\d+', text)
        episode_num = int(num_match.group(0)) if num_match else len(chapters) + 1
        
        full_url = href if href.startswith('http') else f"{BASE_URL}{href}"
        
        chapters.append({
            'id': chapter_id,
            'chapter_number': episode_num,
            'title': text or f"Episode {episode_num}",
            'url': full_url,
            'lang': lang
        })
    
    # Sort
    chapters.sort(key=lambda x: x['chapter_number'])
    
    print(f"✓ Found {len(chapters)} chapters")
    
    return {
        'id': book_id,
        'lang': lang,
        'title': title,
        'description': description,
        'thumbnail': thumbnail,
        'tags': tags,
        'total_chapters': len(chapters),
        'chapters': chapters,
        'source_url': working_url
    }

def scrape_chapter(chapter_id, lang='id'):
    """Scrape chapter detail"""
    url_patterns = [
        f"{BASE_URL}/{lang}/{chapter_id}",
        f"{BASE_URL}/{chapter_id}",
        f"{BASE_URL}/{lang}/episode/{chapter_id}",
        f"{BASE_URL}/episode/{chapter_id}",
        f"{BASE_URL}/{lang}/watch/{chapter_id}",
        f"{BASE_URL}/watch/{chapter_id}",
    ]
    
    session = requests.Session()
    html = None
    working_url = None
    
    for url in url_patterns:
        html = fetch_page(url, session)
        if html and len(html) > 3000:
            working_url = url
            print(f"✓ Chapter found: {url}")
            break
    
    if not html:
        print(f"✗ Chapter {chapter_id} not found")
        return None
    
    soup = BeautifulSoup(html, 'lxml')
    
    # Title
    title = ''
    for selector in [soup.find('h1'), soup.find('h2'), soup.find('title')]:
        if selector:
            title = selector.get_text(strip=True)
            if title:
                break
    
    if not title:
        title = f"Episode {chapter_id}"
    
    sources = []
    seen_urls = set()
    
    # Video tags
    for video in soup.find_all('video'):
        src = video.get('src')
        if src and src not in seen_urls:
            seen_urls.add(src)
            full_url = src if src.startswith('http') else f"{BASE_URL}{src}"
            sources.append({
                'type': 'video',
                'quality': video.get('quality', 'auto'),
                'url': full_url
            })
        
        for source in video.find_all('source'):
            src = source.get('src')
            if src and src not in seen_urls:
                seen_urls.add(src)
                full_url = src if src.startswith('http') else f"{BASE_URL}{src}"
                quality = source.get('label') or source.get('res') or 'auto'
                sources.append({
                    'type': 'video',
                    'quality': quality,
                    'url': full_url
                })
    
    # Iframes
    for iframe in soup.find_all('iframe'):
        src = iframe.get('src')
        if src and src not in seen_urls:
            seen_urls.add(src)
            full_url = src if src.startswith('http') else f"{BASE_URL}{src}"
            sources.append({
                'type': 'iframe',
                'quality': 'auto',
                'url': full_url
            })
    
    # Extract dari scripts
    scripts = soup.find_all('script')
    all_scripts = '\n'.join([s.string for s in scripts if s.string])
    
    video_patterns = [
        (r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)', 'm3u8'),
        (r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)', 'mp4'),
        (r'(https?://[^\s"\'<>]+\.webm[^\s"\'<>]*)', 'webm'),
        (r'"file"\s*:\s*"([^"]+)"', 'auto'),
        (r'"source"\s*:\s*"([^"]+)"', 'auto'),
        (r'"url"\s*:\s*"([^"]+)"', 'auto'),
        (r'videoUrl\s*[:=]\s*["\']([^"\']+)["\']', 'auto'),
        (r'src:\s*["\']([^"\']+)["\']', 'auto'),
    ]
    
    for pattern, vid_type in video_patterns:
        matches = re.findall(pattern, all_scripts, re.I)
        for match in matches:
            url = match.strip()
            
            if not url.startswith('http'):
                continue
            
            if url in seen_urls:
                continue
            
            seen_urls.add(url)
            
            # Detect type
            if vid_type == 'auto':
                if '.m3u8' in url:
                    final_type = 'm3u8'
                elif '.mp4' in url:
                    final_type = 'mp4'
                elif '.webm' in url:
                    final_type = 'webm'
                else:
                    final_type = 'video'
            else:
                final_type = vid_type
            
            sources.append({
                'type': final_type,
                'quality': 'auto',
                'url': url
            })
    
    print(f"✓ Found {len(sources)} sources")
    
    return {
        'id': chapter_id,
        'lang': lang,
        'title': title,
        'total_sources': len(sources),
        'sources': sources,
        'source_url': working_url
    }

# Routes
@app.route('/')
def index():
    return jsonify({
        'service': 'GoodShort Scraper API',
        'version': '13.0',
        'status': 'online',
        'type': 'BeautifulSoup + Requests',
        'endpoints': {
            'GET /nav': 'Navigation',
            'GET /home?lang=id': 'Home dramas',
            'GET /search?q=keyword&lang=id': 'Search',
            'GET /hot?lang=id': 'Hot dramas',
            'GET /book/<id>?lang=id': 'Book detail',
            'GET /chapters/<id>?lang=id': 'Chapters',
            'GET /play/<id>?lang=id': 'Chapter sources',
            'GET /m3u8/<id>?lang=id': 'Best stream'
        }
    })

@app.route('/nav')
def nav():
    return jsonify({
        'status': 'success',
        'data': [
            {'id': 'home', 'title': 'Home', 'path': '/home'},
            {'id': 'hot', 'title': 'Hot', 'path': '/hot'},
            {'id': 'search', 'title': 'Search', 'path': '/search'}
        ]
    })

@app.route('/home')
def home():
    lang = request.args.get('lang', 'id')
    try:
        dramas = scrape_home(lang)
        return jsonify({
            'status': 'success',
            'lang': lang,
            'total': len(dramas),
            'data': dramas
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/search')
def search():
    q = request.args.get('q', '')
    lang = request.args.get('lang', 'id')
    
    if not q:
        return jsonify({'status': 'error', 'message': 'Query required'}), 400
    
    try:
        all_dramas = scrape_home(lang)
        results = [d for d in all_dramas if q.lower() in d['title'].lower()]
        return jsonify({
            'status': 'success',
            'query': q,
            'total': len(results),
            'data': results
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/hot')
def hot():
    lang = request.args.get('lang', 'id')
    try:
        dramas = scrape_home(lang)[:10]
        return jsonify({
            'status': 'success',
            'lang': lang,
            'total': len(dramas),
            'data': dramas
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/book/<book_id>')
def book_detail(book_id):
    lang = request.args.get('lang', 'id')
    try:
        book = scrape_book_detail(book_id, lang)
        if not book:
            return jsonify({
                'status': 'error',
                'message': 'Book not found',
                'book_id': book_id
            }), 404
        
        return jsonify({'status': 'success', 'data': book})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/chapters/<book_id>')
def chapters(book_id):
    lang = request.args.get('lang', 'id')
    try:
        book = scrape_book_detail(book_id, lang)
        if not book:
            return jsonify({'status': 'error', 'message': 'Book not found'}), 404
        
        return jsonify({
            'status': 'success',
            'book_id': book_id,
            'book_title': book['title'],
            'total': len(book['chapters']),
            'data': book['chapters']
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/play/<chapter_id>')
def play(chapter_id):
    lang = request.args.get('lang', 'id')
    try:
        chapter = scrape_chapter(chapter_id, lang)
        if not chapter:
            return jsonify({
                'status': 'error',
                'message': 'Chapter not found'
            }), 404
        
        return jsonify({'status': 'success', 'data': chapter})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/m3u8/<chapter_id>')
def m3u8(chapter_id):
    lang = request.args.get('lang', 'id')
    try:
        chapter = scrape_chapter(chapter_id, lang)
        if not chapter or not chapter['sources']:
            return jsonify({'status': 'error', 'message': 'No sources'}), 404
        
        # Priority
        priorities = ['m3u8', 'mp4', 'video']
        best = chapter['sources'][0]
        
        for p in priorities:
            found = next((s for s in chapter['sources'] if s['type'] == p), None)
            if found:
                best = found
                break
        
        return jsonify({
            'status': 'success',
            'data': {
                'id': chapter_id,
                'stream_url': best['url'],
                'type': best['type'],
                'quality': best['quality'],
                'all_sources': chapter['sources']
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Vercel handler
def handler(request):
    with app.request_context(request.environ):
        return app.full_dispatch_request()
