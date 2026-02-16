export interface DramaCard {
  id: string; slug: string; title: string; cover: string;
  url: string; episodes?: number; rating?: number;
  genre?: string; views?: string; status?: string;
}

export interface DramaDetail extends DramaCard {
  originalTitle: string; description: string; genreList: string[];
  tags: string[]; totalEpisodes: number; language: string;
  year: string; cast: string[]; episodeList: Episode[];
}

export interface Episode {
  number: number; title: string; url: string; streamUrl: string;
  thumbnail: string; duration: string; isFree: boolean; isVip: boolean;
}

export interface StreamInfo {
  episodeUrl: string;
  streams: { url: string; type: string; quality: string }[];
}

export interface ApiRes<T = unknown> {
  ok: boolean; data: T; cached: boolean;
  ts: string; msg?: string; source?: string;
}
