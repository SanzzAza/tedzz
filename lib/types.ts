// ================================
// TYPE DEFINITIONS
// ================================

export interface Drama {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  url: string;
  coverImage: string;
  description: string;
  genre: string[];
  tags: string[];
  totalEpisodes: number;
  rating: number;
  views: string;
  status: 'ongoing' | 'completed' | 'unknown';
  language: string;
  year: string;
  updatedAt?: string;
}

export interface DramaDetail extends Drama {
  episodes: Episode[];
  cast?: string[];
  director?: string;
  relatedDramas?: DramaCard[];
}

export interface Episode {
  number: number;
  title: string;
  url: string;
  streamUrl?: string;
  thumbnail?: string;
  duration?: string;
  isFree: boolean;
  isVip: boolean;
}

export interface DramaCard {
  id: string;
  slug: string;
  title: string;
  coverImage: string;
  url: string;
  totalEpisodes?: number;
  rating?: number;
  genre?: string;
  latestEpisode?: string;
}

export interface HomePageData {
  banners: Banner[];
  sections: HomeSection[];
  categories: Category[];
}

export interface Banner {
  id: string;
  title: string;
  image: string;
  url: string;
}

export interface HomeSection {
  title: string;
  type: string;
  dramas: DramaCard[];
  moreUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  count?: number;
}

export interface StreamData {
  url: string;
  quality: string;
  type: 'hls' | 'mp4' | 'dash';
  headers?: Record<string, string>;
}

export interface SearchResult {
  query: string;
  total: number;
  page: number;
  dramas: DramaCard[];
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  cached?: boolean;
  timestamp: string;
  source?: string;
}

export interface ScrapedPageData {
  nextData?: Record<string, unknown>;
  nuxtData?: Record<string, unknown>;
  inlineData?: Record<string, unknown>[];
  apiEndpoints?: string[];
  html?: string;
}
