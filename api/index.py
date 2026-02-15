from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
import requests
import re

app = Flask(__name__)

def scrape_drama_list():
    base_url = "https://www.goodshort.com"
    target_url = f"{base_url}/id"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
    }
    
    try:
        response = requests.get(target_url, headers=headers, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        drama_list = []
        containers = soup.find_all(['div', 'article', 'li', 'section'])
        
        for container in containers:
            img = container.find('img')
            link = container.find('a', href=True)
            title_elem = container.find(['h1', 'h2', 'h3', 'h4', 'h5', 'span', 'p'])
            
            if img and link:
                title = title_elem.get_text(strip=True) if title_elem else img.get('alt', 'No Title')
                drama_url = link.get('href', '')
                
                if drama_url and not drama_url.startswith('http'):
                    drama_url = f"{base_url}{drama_url}"
                
                if drama_url and title and len(title) > 2:
                    drama_list.append({
                        'title': title,
                        'url': drama_url,
                        'thumbnail': img.get('src', ''),
                        'alt': img.get('alt', '')
                    })
        
        seen_urls = set()
        unique_dramas = []
        for drama in drama_list:
            if drama['url'] not in seen_urls:
                seen_urls.add(drama['url'])
                unique_dramas.append(drama)
        
        return unique_dramas
    except Exception as e:
        return []

def scrape_drama_detail(drama_url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(drama_url, headers=headers, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        title = soup.find(['h1', 'h2'])
        title_text = title.get_text(strip=True) if title else "Unknown"
        
        description = ""
        desc_elem = soup.find(['p', 'div'], class_=lambda x: x and any(k in str(x).lower() for k in ['desc', 'summary', 'synopsis']))
        if desc_elem:
            description = desc_elem.get_text(strip=True)
        
        thumbnail = ""
        main_img = soup.find('img')
        if main_img:
            thumbnail = main_img.get('src', '')
        
        episodes = []
        episode_links = soup.find_all('a', href=True)
        
        for idx, link in enumerate(episode_links):
            href = link.get('href', '')
            text = link.get_text(strip=True)
            
            if any(keyword in text.lower() for keyword in ['episode', 'ep', 'part']) or \
               any(keyword in href.lower() for keyword in ['episode', 'ep', 'watch']):
                
                episode_url = href if href.startswith('http') else f"https://www.goodshort.com{href}"
                episodes.append({
                    'episode_number': idx + 1,
                    'episode_title': text,
                    'episode_url': episode_url
                })
        
        return {
            'title': title_text,
            'description': description,
            'thumbnail': thumbnail,
            'total_episodes': len(episodes),
            'episodes': episodes,
            'drama_url': drama_url
        }
    except Exception as e:
        return None

def scrape_episode_stream(episode_url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(episode_url, headers=headers, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        video_sources = []
        
        videos = soup.find_all('video')
        for video in videos:
            src = video.get('src')
            if src:
                video_sources.append({'type': 'video', 'url': src})
            
            sources = video.find_all('source')
            for source in sources:
                src = source.get('src')
                if src:
                    video_sources.append({'type': 'video', 'url': src})
        
        iframes = soup.find_all('iframe')
        for iframe in iframes:
            src = iframe.get('src')
            if src:
                video_sources.append({'type': 'iframe', 'url': src})
        
        scripts = soup.find_all('script')
        for script in scripts:
            if script.string:
                m3u8_matches = re.findall(r'https?://[^\s"\'>]+\.m3u8', script.string)
                mp4_matches = re.findall(r'https?://[^\s"\'>]+\.mp4', script.string)
                
                for m3u8 in m3u8_matches:
                    video_sources.append({'type': 'm3u8', 'url': m3u8})
                
                for mp4 in mp4_matches:
                    video_sources.append({'type': 'mp4', 'url': mp4})
        
        return video_sources
    except Exception as e:
        return []

@app.route('/')
def index():
    return jsonify({
        'service': 'GoodShort API',
        'version': '1.0',
        'endpoints': {
            'GET /api/dramas': 'Mendapatkan semua drama',
            'POST /api/drama/detail': 'Detail drama',
            'POST /api/search': 'Cari drama',
            'POST /api/episode/stream': 'Stream episode'
        }
    })

@app.route('/api/dramas')
def get_all_dramas():
    try:
        dramas = scrape_drama_list()
        return jsonify({'status': 'success', 'total': len(dramas), 'data': dramas})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/drama/detail', methods=['POST'])
def get_drama_detail():
    try:
        data = request.get_json()
        drama_url = data.get('drama_url')
        
        if not drama_url:
            return jsonify({'status': 'error', 'message': 'drama_url required'}), 400
        
        detail = scrape_drama_detail(drama_url)
        
        if not detail:
            return jsonify({'status': 'error', 'message': 'Drama not found'}), 404
        
        return jsonify({'status': 'success', 'data': detail})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/search', methods=['POST'])
def search_drama():
    try:
        data = request.get_json()
        keyword = data.get('keyword', '').lower()
        
        if not keyword:
            return jsonify({'status': 'error', 'message': 'keyword required'}), 400
        
        all_dramas = scrape_drama_list()
        results = [d for d in all_dramas if keyword in d['title'].lower()]
        
        return jsonify({'status': 'success', 'keyword': keyword, 'total': len(results), 'data': results})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/episode/stream', methods=['POST'])
def get_episode_stream():
    try:
        data = request.get_json()
        episode_url = data.get('episode_url')
        
        if not episode_url:
            return jsonify({'status': 'error', 'message': 'episode_url required'}), 400
        
        sources = scrape_episode_stream(episode_url)
        
        return jsonify({'status': 'success', 'total_sources': len(sources), 'sources': sources})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
