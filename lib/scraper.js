const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.goodshort.com/id';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL
};

const extractNextData = (html) => {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  return match ? JSON.parse(match[1]) : null;
};

exports.getDramaList = async (page = 1) => {
  const { data } = await axios.get(`${BASE_URL}?page=${page}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.dramas) {
    return nextData.props.pageProps.dramas.map(d => ({
      id: d.id,
      title: d.title,
      poster: d.coverImage,
      genre: d.genre,
      rating: d.rating,
      episodes: d.episodeCount
    }));
  }
  
  // Fallback HTML parsing
  const $ = cheerio.load(data);
  const dramas = [];
  $('.drama-card').each((_, el) => {
    dramas.push({
      id: $(el).attr('data-id'),
      title: $(el).find('h3').text(),
      poster: $(el).find('img').attr('src')
    });
  });
  return dramas;
};

exports.getDramaDetail = async (id) => {
  const { data } = await axios.get(`${BASE_URL}/drama/${id}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.dramaDetail) {
    const d = nextData.props.pageProps.dramaDetail;
    return {
      id: d.id,
      title: d.title,
      synopsis: d.description,
      poster: d.coverImage,
      genre: d.genre,
      rating: d.rating,
      episodes: d.episodeCount,
      status: d.status,
      cast: d.actors
    };
  }
  return null;
};

exports.getEpisodes = async (dramaId) => {
  const { data } = await axios.get(`${BASE_URL}/drama/${dramaId}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.episodes) {
    return nextData.props.pageProps.episodes.map(ep => ({
      id: ep.id,
      number: ep.episodeNumber,
      title: ep.title,
      duration: ep.duration,
      thumbnail: ep.thumbnail,
      isPremium: ep.isVip
    }));
  }
  return [];
};

exports.getStreamUrl = async (episodeId) => {
  const { data } = await axios.get(`${BASE_URL}/watch/${episodeId}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.episode) {
    const ep = nextData.props.pageProps.episode;
    return {
      streamUrl: ep.videoUrl,
      qualities: ep.videoSources || [],
      subtitles: ep.subtitles || [],
      duration: ep.duration
    };
  }
  return null;
};

exports.searchDrama = async (query) => {
  const { data } = await axios.get(`${BASE_URL}/search?q=${encodeURIComponent(query)}`, { headers });
  const nextData = extractNextData(data);
  
  if (nextData?.props?.pageProps?.searchResults) {
    return nextData.props.pageProps.searchResults;
  }
  return [];
};
