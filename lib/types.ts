export interface DramaCard {
  id: string
  slug: string
  title: string
  cover: string
  url: string
  episodes?: number
  rating?: number
  genre?: string
  views?: string
  status?: string
}

export interface DramaDetail {
  id: string
  slug: string
  title: string
  originalTitle: string
  cover: string
  url: string
  description: string
  genre: string[]
  tags: string[]
  totalEpisodes: number
  rating: number
  views: string
  status: string
  language: string
  year: string
  cast: string[]
  episodes: Episode[]
}

export interface Episode {
  number: number
  title: string
  url: string
  streamUrl: string
  thumbnail: string
  duration: string
  isFree: boolean
  isVip: boolean
}

export interface HomeData {
  banners: { title: string; image: string; url: string }[]
  sections: { title: string; dramas: DramaCard[] }[]
  categories: { name: string; slug: string }[]
  allDramas: DramaCard[]
}

export interface StreamInfo {
  episodeUrl: string
  streams: { url: string; type: string; quality: string }[]
}

export interface ApiRes<T = unknown> {
  ok: boolean
  data: T
  cached: boolean
  ts: string
  msg?: string
  source?: string
}
