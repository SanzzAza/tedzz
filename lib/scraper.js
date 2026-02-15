const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.goodshort.com/id';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9',
  'Referer': BASE_URL
};

const extractNextData = (html) => {
  try {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    return match ? JSON.parse(match[1]) : null;
  } catch (e) {
    return null;
  }
};

// GET /api/dramas
exports.getDramaList = async (page = 1) => {
  const { data } = await axios.get(`${BASE_URL}?page=${page}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.dramas) {
    return nextData.props.pageProps.dramas.map(d => ({
      id: d.id,
      title: d.title,
      poster: d.coverImage,
      genre: d.genre || [],
      rating: d.rating,
      episodes: d.episodeCount
    }));
  }
  
  // Fallback HTML
  const $ = cheerio.load(data);
  const dramas = [];
  $('[data-testid="drama-card"], .drama-card, .content-item').each((_, el) => {
    const $el = $(el);
    dramas.push({
      id: $el.attr('data-id') || $el.find('a').attr('href')?.match(/\/drama\/(\d+)/)?.[1],
      title: $el.find('h3, .title').text().trim(),
      poster: $el.find('img').attr('src') || $el.find('img').attr('data-src'),
      rating: $el.find('.rating').text().trim()
    });
  });
  return dramas;
};

// GET /api/drama/:id
exports.getDramaDetail = async (id) => {
  const urls = [
    `${BASE_URL}/drama/${id}`,
    `${BASE_URL}/drama/${id}/info`
  ];
  
  for (const url of urls) {
    try {
      const { data } = await axios.get(url, { headers });
      const nextData = extractNextData(data);
      
      if (nextData?.props?.pageProps?.dramaDetail) {
        const d = nextData.props.pageProps.dramaDetail;
        return {
          id: d.id,
          title: d.title,
          synopsis: d.description || d.synopsis,
          poster: d.coverImage || d.poster,
          backdrop: d.backdropImage,
          genre: d.genre || [],
          rating: d.rating,
          episodes: d.episodeCount,
          status: d.status,
          cast: d.actors || d.cast || [],
          director: d.director,
          year: d.year
        };
      }
    } catch (e) {
      continue;
    }
  }
  return null;
};

// GET /api/episodes/:dramaId
exports.getEpisodes = async (dramaId) => {
  const { data } = await axios.get(`${BASE_URL}/drama/${dramaId}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.episodes) {
    return nextData.props.pageProps.episodes.map(ep => ({
      id: ep.id,
      episodeNumber: ep.episodeNumber || ep.number,
      title: ep.title,
      duration: ep.duration,
      thumbnail: ep.thumbnail,
      isPremium: ep.isVip || ep.isPremium,
      releaseDate: ep.releaseDate
    }));
  }
  return [];
};

// GET /api/watch/:episodeId
exports.getStreamUrl = async (episodeId) => {
  const { data } = await axios.get(`${BASE_URL}/watch/${episodeId}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.episode) {
    const ep = nextData.props.pageProps.episode;
    return {
      episodeId: episodeId,
      title: ep.title,
      streamUrl: ep.videoUrl,
      qualities: ep.videoSources?.map(v => ({
        quality: v.quality,
        url: v.url,
        type: v.type || 'mp4'
      })) || [],
      subtitles: (ep.subtitles || []).map(s => ({
        lang: s.language || s.lang,
        label: s.label,
        url: s.url
      })),
      duration: ep.duration,
      thumbnail: ep.thumbnail
    };
  }
  
  // Fallback regex
  const videoMatch = data.match(/"videoUrl"\s*:\s*"([^"]+)"/);
  if (videoMatch) {
    return { streamUrl: videoMatch[1], qualities: [], subtitles: [] };
  }
  
  return null;
};

// GET /api/search?q=
exports.searchDrama = async (query) => {
  const { data } = await axios.get(
    `${BASE_URL}/search?q=${encodeURIComponent(query)}`, 
    { headers }
  );
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.searchResults) {
    return nextData.props.pageProps.searchResults.map(d => ({
      id: d.id,
      title: d.title,
      poster: d.coverImage,
      genre: d.genre,
      rating: d.rating
    }));
  }
  
  // Fallback HTML parsing
  const $ = cheerio.load(data);
  const results = [];
  $('.search-result, .drama-card').each((_, el) => {
    const $el = $(el);
    results.push({
      id: $el.attr('data-id'),
      title: $el.find('.title, h3').text().trim(),
      poster: $el.find('img').attr('src')
    });
  });
  return results;
};
