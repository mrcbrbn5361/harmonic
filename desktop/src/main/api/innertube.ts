const BASE_URL = 'https://music.youtube.com/youtubei/v1';

interface YTClient {
  hl: string;
  gl: string;
  clientName: string;
  clientVersion: string;
}

const WEB_REMIX: YTClient = {
  hl: 'tr',
  gl: 'TR',
  clientName: 'WEB_REMIX',
  clientVersion: '1.20241001.00.00'
};

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  thumbnail: string;
  duration: number;
  album?: string;
  albumId?: string;
}

export interface Album {
  browseId: string;
  title: string;
  artist?: string;
  year?: string;
  thumbnail: string;
  songCount?: number;
}

export interface Artist {
  browseId: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
}

export interface Playlist {
  browseId: string;
  title: string;
  author?: string;
  thumbnail: string;
  songCount?: number;
  isEditable?: boolean;
}

export interface SearchResult {
  songs: Song[];
  videos: Song[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export interface BrowseResult {
  title?: string;
  items: (Song | Album | Artist | Playlist)[];
  continuation?: string;
}

export interface PlayerResult extends Song {
  streamUrl?: string;
  viewCount?: string;
  description?: string;
  formats?: StreamFormat[];
}

interface StreamFormat {
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength: number;
  quality: string;
  isAudio: boolean;
}

export class YouTubeAPI {
  private client: YTClient;
  private visitorData = '';
  private accessToken: string | null = null;

  constructor() {
    this.client = { ...WEB_REMIX };
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  private async request<T = Record<string, unknown>>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const payload = {
      context: {
        client: {
          hl: this.client.hl,
          gl: this.client.gl,
          clientName: this.client.clientName,
          clientVersion: this.client.clientVersion,
          ...(this.visitorData ? { visitorData: this.visitorData } : {})
        }
      },
      ...body
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/'
    };

    const res = await fetch(`${BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[YT] ${endpoint} ${res.status}:`, errBody.substring(0, 500));
      throw new Error(`YouTube API ${endpoint}: ${res.status} - ${errBody.substring(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private text(obj: any): string {
    if (!obj) return '';
    if (obj.runs) return obj.runs.map((r: any) => r.text).join('');
    return obj.simpleText || '';
  }

  private thumb(obj: any): string {
    try {
      const thumbs = obj?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      return thumbs?.[thumbs.length - 1]?.url || '';
    } catch {
      return '';
    }
  }

  private duration(str: string): number {
    if (!str) return 0;
    const p = str.split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0] || 0;
  }

  private parseSong(item: any): Song | null {
    const r = item.musicResponsiveListItemRenderer;
    if (!r) return null;
    const videoId = r.playlistItemData?.videoId;
    if (!videoId) return null;

    const col0 = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const col1 = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const col2 = r.flexColumns?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text;
    
    const title = this.text(col0);
    let artist = this.text(col1);
    let duration = 0;
    let album = this.text(col2);

    // fixedColumns'dan süre oku (browse response'da süre burada: "2:39")
    if (r.fixedColumns?.length) {
      for (const fc of r.fixedColumns) {
        const fText = fc.musicResponsiveListItemFixedColumnRenderer?.text;
        const fStr = this.text(fText);
        duration = this.duration(fStr);
        if (duration > 0) break;
      }
    }

    // Subtitle'dan süre ve sanatçıyı ayrıştır (search format: "Sanatçı • Albüm • 3:01")
    if (!duration) {
      const parts = artist.split('•').map((p: string) => p.trim());
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        const durResult = this.duration(lastPart);
        if (durResult > 0) {
          duration = durResult;
          artist = parts[0];
          if (parts.length >= 3) album = parts[1];
        } else {
          artist = parts[0];
          if (parts.length >= 2) album = parts[1];
        }
      }
    }

    return {
      id: videoId,
      title,
      artist,
      artistId: col1?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
      thumbnail: this.thumb(r),
      duration,
      ...(album ? { album } : {})
    };
  }

  private parseTwoRow(item: any): Song | Album | Artist | Playlist | null {
    const r = item.musicTwoRowItemRenderer;
    if (!r) return null;

    const nav = r.navigationEndpoint;
    const title = this.text(r.title);
    const thumb = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
    const subtitle = this.text(r.subtitle);

    if (nav?.watchEndpoint?.videoId) {
      let duration = 0;
      let album = '';
      // Subtitle'dan süre ve albüm ayrıştır: "Sanatçı • Album • 3:01" veya "Sanatçı • 3:01"
      const parts = subtitle.split('•').map((p: string) => p.trim());
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        const durMatch = lastPart.match(/^(\d+):(\d{2})$/);
        if (durMatch) {
          duration = parseInt(durMatch[1]) * 60 + parseInt(durMatch[2]);
          // Albüm: süre hariç son eleman (eğer 3+ parça varsa)
          if (parts.length >= 3) {
            album = parts[parts.length - 2];
          }
        } else {
          // Süre bulunamadı ama 2+ parça var → ortadaki albüm olabilir
          if (parts.length >= 3) {
            album = parts[parts.length - 2];
          }
        }
      }
      // shortBylineText'den artistId
      const artistId = r.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
      const artist = parts[0] || subtitle;
      return {
        id: nav.watchEndpoint.videoId,
        title,
        artist,
        artistId,
        thumbnail: thumb,
        duration,
        ...(album ? { album } : {})
      };
    }
    if (nav?.browseEndpoint) {
      const bid = nav.browseEndpoint.browseId;
      if (bid.startsWith('MPRE')) return { browseId: bid, title, artist: subtitle, thumbnail: thumb } as Album;
      if (bid.startsWith('UC')) return { browseId: bid, name: title, thumbnail: thumb } as Artist;
      return { browseId: bid, title, thumbnail: thumb, author: subtitle } as Playlist;
    }
    return null;
  }

  async search(query: string): Promise<SearchResult> {
    // Genelarama params'ı: hem şarkılar hem diğer türleri döner
    const data = await this.request('search', { 
      query,
      params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D'
    });
    const results: SearchResult = { songs: [], videos: [], albums: [], artists: [], playlists: [] };

    // Farklı formatları dene
    let contents: any[] = [];
    
    // Format 1: twoColumnSearchResultsRenderer (eski)
    contents = (data as any)?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    
    // Format 2: tabbedSearchResultsRenderer (yeni)
    if (!contents.length) {
      const tabs = (data as any)?.contents?.tabbedSearchResultsRenderer?.tabs;
      if (tabs) {
        for (const tab of tabs) {
          const tabContents = tab?.tabRenderer?.content?.sectionListRenderer?.contents;
          if (Array.isArray(tabContents)) contents.push(...tabContents);
        }
      }
    }

    // Format 3: sectionListRenderer directly
    if (!contents.length) {
      contents = (data as any)?.sectionListRenderer?.contents || [];
    }
    
    if (!contents.length) return results;

    for (const section of contents) {
      // musicShelfRenderer: dikey liste (şarkılar, videolar)
      const shelf = section.musicShelfRenderer;
      if (shelf) {
        const category = shelf.title?.runs?.[0]?.text || '';
        for (const item of (shelf.contents || [])) {
          const song = this.parseSong(item);
          if (!song) continue;
          if (category.match(/video/i)) results.videos.push(song);
          else results.songs.push(song);
        }
        continue;
      }

      // musicCarouselShelfRenderer: yatay kategori (albümler, sanatçılar, oynatma listeleri)
      const carousel = section.musicCarouselShelfRenderer;
      if (carousel) {
        const category = carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || '';
        for (const item of (carousel.contents || [])) {
          const parsed = this.parseTwoRow(item);
          if (!parsed) continue;
          if ('browseId' in parsed) {
            if (category.match(/albüm|album/i) || (parsed as Album).browseId?.startsWith('MPRE')) results.albums.push(parsed as Album);
            else if (category.match(/sanatçı|artist/i) || (parsed as Artist).browseId?.startsWith('UC')) results.artists.push(parsed as Artist);
            else results.playlists.push(parsed as Playlist);
          } else {
            results.songs.push(parsed as Song);
          }
        }
        continue;
      }

      // sectionListRenderer içindeki content'leri tara (shelf/carousel yoksa)
      const sectionItems = section.sectionListRenderer?.contents || [];
      for (const item of sectionItems) {
        const song = this.parseSong(item);
        if (song) results.songs.push(song);
      }
    }

    return results;
  }

  private async requestPlayer<T = Record<string, unknown>>(endpoint: string, body: Record<string, unknown>, baseUrl: string = BASE_URL): Promise<T> {
    const payload = {
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
          clientVersion: '2.0'
        }
      },
      ...body
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    };

    const res = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[YT Player] ${endpoint} ${res.status}:`, errBody.substring(0, 500));
      throw new Error(`YouTube Player API ${endpoint}: ${res.status} - ${errBody.substring(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  async getPlayer(videoId: string): Promise<PlayerResult | null> {
    let d: any;
    
    // Primary: www.youtube.com player API
    try {
      d = await this.requestPlayer('player', { 
        videoId, 
        contentCheckOk: true, 
        racyCheckOk: true 
      }, 'https://www.youtube.com/youtubei/v1');
      console.log('[YT Player] Using www.youtube.com, status:', d?.playabilityStatus?.status);
    } catch (err) {
      console.error('[YT Player] www.youtube.com failed, trying music.youtube.com:', err);
      try {
        // Fallback: music.youtube.com player API
        d = await this.request('player', { videoId, contentCheckOk: true, racyCheckOk: true });
        console.log('[YT Player] Using music.youtube.com, status:', d?.playabilityStatus?.status);
      } catch (err2) {
        console.error('[YT Player] All player attempts failed:', err2);
        return null;
      }
    }

    const vd = d.videoDetails || {};
    const sd = d.streamingData || {};

    const formats: StreamFormat[] = [];
    for (const f of [...(sd.adaptiveFormats || []), ...(sd.formats || [])]) {
      formats.push({
        url: f.url || '',
        mimeType: f.mimeType || '',
        bitrate: f.bitrate || 0,
        contentLength: f.contentLength || 0,
        quality: f.qualityLabel || f.audioQuality || '',
        isAudio: !f.width
      });
    }

    const audio = formats.filter(f => f.isAudio && f.url).sort((a, b) => b.bitrate - a.bitrate);

    if (!audio.length) {
      console.error('[YT Player] No audio formats found. Playability:', d?.playabilityStatus?.status, d?.playabilityStatus?.reason);
      // Try to get available formats even if not audio-only
      const anyAudio = formats.filter(f => f.url).sort((a, b) => b.bitrate - a.bitrate);
      if (anyAudio.length) {
        return {
          id: videoId,
          title: vd.title || '',
          artist: vd.author || '',
          artistId: vd.channelId || '',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: parseInt(vd.lengthSeconds) || 0,
          viewCount: vd.viewCount,
          description: vd.shortDescription,
          streamUrl: anyAudio[0].url,
          formats
        };
      }
      return null;
    }

    return {
      id: videoId,
      title: vd.title || '',
      artist: vd.author || '',
      artistId: vd.channelId || '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: parseInt(vd.lengthSeconds) || 0,
      viewCount: vd.viewCount,
      description: vd.shortDescription,
      streamUrl: audio[0]?.url,
      formats
    };
  }

  async getHome(): Promise<BrowseResult> {
    const data = await this.request('browse', { browseId: 'FEmusic_home' });
    const items: (Song | Album | Artist | Playlist)[] = [];
    const sections = (data as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

    if (Array.isArray(sections)) {
      for (const section of sections) {
        const carousel = section.musicCarouselShelfRenderer;
        if (!carousel) continue;
        for (const item of (carousel.contents || [])) {
          // musicTwoRowItemRenderer dene
          const parsed = this.parseTwoRow(item);
          if (parsed) {
            items.push(parsed);
            continue;
          }
          // musicResponsiveListItemRenderer fallback (bazı carousel'larda şarkılar bu formatta)
          const song = this.parseSong(item);
          if (song) items.push(song);
        }
      }
    }

    console.log('[YT Home] items:', items.length);
    return { items };
  }

  async browse(browseId: string, params?: string): Promise<BrowseResult> {
    const body: Record<string, unknown> = { browseId };
    if (params) body.params = params;
    const data = await this.request('browse', body);
    const items: (Song | Album | Artist | Playlist)[] = [];

    const contents = (data as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
                     (data as any)?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents;

    if (Array.isArray(contents)) {
      for (const section of contents) {
        const shelf = section.musicShelfRenderer || section.musicPlaylistShelfRenderer;
        if (!shelf) continue;
        for (const item of (shelf.contents || [])) {
          const song = this.parseSong(item);
          if (song) items.push(song);
        }
      }
    }

    // Header title'ı farklı formatlardan çıkar
    let title = '';
    const hdr = (data as any)?.header;
    if (hdr?.musicDetailHeaderRenderer?.title?.runs) {
      title = hdr.musicDetailHeaderRenderer.title.runs.map((r: any) => r.text).join('');
    } else if (hdr?.musicResponsiveHeaderRenderer?.title?.runs) {
      title = hdr.musicResponsiveHeaderRenderer.title.runs.map((r: any) => r.text).join('');
    } else if (hdr?.musicResponsiveHeaderRenderer?.title?.simpleText) {
      title = hdr.musicResponsiveHeaderRenderer.title.simpleText;
    }
    // Topluluk playlist'lerinde header boş, microformat'ta başlık var
    if (!title) {
      const mf = (data as any)?.microformat?.microformatDataRenderer?.title;
      if (typeof mf === 'string' && mf) title = mf;
    }

    console.log('[YT Browse]', browseId, 'items:', items.length, 'title:', title);
    return { title, items };
  }

  async getNext(videoId: string, playlistId?: string): Promise<{ items: Song[]; currentIndex: number }> {
    const body: Record<string, unknown> = { videoId };
    if (playlistId) body.playlistId = playlistId;
    const data = await this.request('next', body);

    const items: Song[] = [];
    let currentIndex = 0;
    const contents = (data as any)?.contents?.singleColumnMusicWatchNextResultsRenderer?.results?.results?.contents;

    if (Array.isArray(contents)) {
      for (const content of contents) {
        const secondary = content.musicWatchNextResultsRenderer?.results?.results?.contents;
        if (!Array.isArray(secondary)) continue;
        for (const item of secondary) {
          const primary = item.compactPlaylistRenderer || item.compactVideoRenderer;
          if (!primary) continue;
          const id = primary.videoId || primary.playlistId;
          if (!id) continue;
          items.push({
            id,
            title: primary.title?.runs?.[0]?.text || '',
            artist: primary.shortBylineText?.runs?.[0]?.text || '',
            artistId: primary.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
            thumbnail: primary.thumbnail?.thumbnails?.slice(-1)[0]?.url || '',
            duration: this.duration(primary.lengthText?.simpleText)
          });
          if (primary.videoId === videoId) currentIndex = items.length - 1;
        }
      }
    }

    return { items, currentIndex };
  }

  async getSearchSuggestions(input: string): Promise<string[]> {
    const data = await this.request('get_search_suggestions', { input });
    const suggestions: string[] = [];
    const contents = (data as any)?.contents || [];

    if (!contents.length) return suggestions;

    for (const content of contents) {
      const items = content.searchSuggestionsSectionRenderer?.contents || [];
      for (const item of items) {
        const text = item.searchSuggestionRenderer?.suggestion?.runs?.map((r: any) => r.text).join('');
        if (text) suggestions.push(text);
      }
      // Fallback: try direct suggestion items
      const direct = content.suggestionItemsRenderer?.items || [];
      for (const item of direct) {
        const text = item?.text?.runs?.map((r: any) => r.text).join('');
        if (text && !suggestions.includes(text)) suggestions.push(text);
      }
    }

    return suggestions;
  }

  async getLyrics(videoId: string): Promise<string | null> {
    try {
      // 1) Next response'dan lyrics endpoint'ini bul
      const data = await this.request('next', { videoId });
      const contents = (data as any)?.contents?.singleColumnMusicWatchNextResultsRenderer?.results?.results?.contents;

      // Primary: musicDescriptionShelfRenderer (eski format)
      if (Array.isArray(contents)) {
        for (const content of contents) {
          const shelf = content.musicDescriptionShelfRenderer;
          if (shelf?.description?.runs) {
            const text = shelf.description.runs.map((r: any) => r.text).join('');
            if (text && text.length > 20) return text;
          }
        }
      }

      // Secondary: musicResponsiveListItemRenderer'dan lyrics browse endpoint'ini bul
      let lyricsBrowseId = '';
      let lyricsParams = '';
      if (Array.isArray(contents)) {
        for (const content of contents) {
          const results = content?.musicWatchNextResultsRenderer?.results?.results?.contents;
          if (!Array.isArray(results)) continue;
          for (const r of results) {
            const item = r?.musicResponsiveListItemRenderer;
            if (!item) continue;
            const flex = item?.flexColumns;
            if (!flex) continue;
            for (const col of flex) {
              const text = col?.musicResponsiveListItemFlexColumnRenderer?.text;
              const label = text?.runs?.map((run: any) => run.text).join('') || '';
              if (/söz|lyrics|歌词/i.test(label)) {
                const nav = item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint;
                if (nav) {
                  lyricsBrowseId = 'UCB0oZn5mVBFj9Uwy91YB4FA'; // dummy
                  lyricsParams = '';
                }
                // Alternatif: direct browse endpoint
                const browseNav = item?.navigationEndpoint?.browseEndpoint;
                if (browseNav?.browseId) {
                  lyricsBrowseId = browseNav.browseId;
                  lyricsParams = browseNav.params || '';
                }
              }
            }
          }
        }
      }

      // 2) Lyrics browse endpoint'inden sözleri çek
      if (lyricsBrowseId) {
        try {
          const body: Record<string, unknown> = { browseId: lyricsBrowseId };
          if (lyricsParams) body.params = lyricsParams;
          const lyricsData = await this.request('browse', body);
          const lyricsContents = (lyricsData as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
          if (Array.isArray(lyricsContents)) {
            for (const lc of lyricsContents) {
              const shelf = lc?.musicDescriptionShelfRenderer;
              if (shelf?.description?.runs) {
                const text = shelf.description.runs.map((r: any) => r.text).join('');
                if (text && text.length > 10) return text;
              }
            }
          }
        } catch {}
      }

      // 3) LRCLIB.org fallback (açık kaynaklı söz API'si)
      try {
        const songTitle = (data as any)?.contents?.singleColumnMusicWatchNextResultsRenderer?.results?.results?.contents
          ?.find((c: any) => c?.musicResponsiveListItemRenderer)?.musicResponsiveListItemRenderer
          ?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
        const songArtist = (data as any)?.contents?.singleColumnMusicWatchNextResultsRenderer?.results?.results?.contents
          ?.find((c: any) => c?.musicResponsiveListItemRenderer)?.musicResponsiveListItemRenderer
          ?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
        
        if (songTitle) {
          const lrcUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(songTitle)}&artist_name=${encodeURIComponent(songArtist)}`;
          const lrcRes = await fetch(lrcUrl, {
            headers: { 'User-Agent': 'Harmonic/1.0.0 (https://github.com/harmonic)' }
          });
          if (lrcRes.ok) {
            const lrcData: any = await lrcRes.json();
            if (lrcData.plainLyrics) return lrcData.plainLyrics;
          }
        }
      } catch {}

      return null;
    } catch {
      return null;
    }
  }

  // ── YouTube Music Library ────────────────────
  async getLibraryPlaylists(): Promise<Playlist[]> {
    const data = await this.request('browse', { browseId: 'FEmusic_library' });
    const playlists: Playlist[] = [];
    const sections = (data as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

    if (Array.isArray(sections)) {
      for (const section of sections) {
        const shelf = section.musicShelfRenderer;
        if (!shelf) continue;
        for (const item of (shelf.contents || [])) {
          const r = item.musicResponsiveListItemRenderer;
          if (!r) continue;
          const nav = r.navigationEndpoint?.browseEndpoint;
          if (!nav) continue;
          playlists.push({
            browseId: nav.browseId,
            title: this.text(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text),
            thumbnail: this.thumb(r),
            songCount: 0
          });
        }
      }
    }

    return playlists;
  }

  async getLikedSongs(): Promise<Song[]> {
    const data = await this.request('browse', { browseId: 'VLPLAKBLuBWqGYwwzJL5VdKOlpkUeMn0jKZ' });
    const songs: Song[] = [];
    const contents = (data as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

    if (Array.isArray(contents)) {
      for (const section of contents) {
        const shelf = section.musicShelfRenderer || section.musicPlaylistShelfRenderer;
        if (!shelf) continue;
        for (const item of (shelf.contents || [])) {
          const song = this.parseSong(item);
          if (song) songs.push(song);
        }
      }
    }

    return songs;
  }

  async getLibraryArtists(): Promise<Artist[]> {
    const data = await this.request('browse', { browseId: 'FEmusic_library', params: 'Q20%3D' });
    const artists: Artist[] = [];
    const sections = (data as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

    if (Array.isArray(sections)) {
      for (const section of sections) {
        const shelf = section.musicShelfRenderer;
        if (!shelf) continue;
        for (const item of (shelf.contents || [])) {
          const r = item.musicResponsiveListItemRenderer;
          if (!r) continue;
          const nav = r.navigationEndpoint?.browseEndpoint;
          if (!nav) continue;
          artists.push({
            browseId: nav.browseId,
            name: this.text(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text),
            thumbnail: this.thumb(r)
          });
        }
      }
    }

    return artists;
  }

  async getLibraryAlbums(): Promise<Album[]> {
    const data = await this.request('browse', { browseId: 'FEmusic_library', params: 'Q0E%3D' });
    const albums: Album[] = [];
    const sections = (data as any)?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

    if (Array.isArray(sections)) {
      for (const section of sections) {
        const shelf = section.musicShelfRenderer;
        if (!shelf) continue;
        for (const item of (shelf.contents || [])) {
          const r = item.musicResponsiveListItemRenderer;
          if (!r) continue;
          const nav = r.navigationEndpoint?.browseEndpoint;
          if (!nav) continue;
          const col1 = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
          albums.push({
            browseId: nav.browseId,
            title: this.text(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text),
            artist: this.text(col1),
            thumbnail: this.thumb(r)
          });
        }
      }
    }

    return albums;
  }
}
