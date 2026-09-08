import Store from 'electron-store';

interface StoreData {
  theme: 'dark' | 'light' | 'system';
  volume: number;
  quality: 'low' | 'medium' | 'high';
  autoPlay: boolean;
  recentlyPlayed: Array<{ id: string; title: string; artist: string; thumbnail: string; timestamp: number }>;
  likedSongs: string[];
  queue: Array<{ id: string; title: string; artist: string; thumbnail: string }>;
  queueIndex: number;
  playlists: Array<{ id: string; name: string; songs: string[]; createdAt: number }>;
  windowBounds?: { x: number; y: number; width: number; height: number };
  oauthClientId?: string;
  oauthClientSecret?: string;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  discordToken?: string;
  discordEnabled?: boolean;
}

const defaults: StoreData = {
  theme: 'dark',
  volume: 80,
  quality: 'high',
  autoPlay: true,
  recentlyPlayed: [],
  likedSongs: [],
  queue: [],
  queueIndex: -1,
  playlists: [],
  shuffle: false,
  repeat: 'off'
};

export class StoreManager {
  private store: Store<StoreData>;

  constructor() {
    this.store = new Store<StoreData>({ name: 'harmonic-data', defaults });
  }

  get<K extends keyof StoreData>(key: K): StoreData[K] {
    try {
      return this.store.get(key);
    } catch {
      return defaults[key];
    }
  }

  set<K extends keyof StoreData>(key: K, value: StoreData[K]): void {
    try {
      this.store.set(key, value);
    } catch (e) {
      console.error('[Store] Set error:', key, e);
    }
  }

  addRecentlyPlayed(song: { id: string; title: string; artist: string; thumbnail: string }): void {
    const list = this.get('recentlyPlayed').filter(s => s.id !== song.id);
    list.unshift({ ...song, timestamp: Date.now() });
    this.set('recentlyPlayed', list.slice(0, 100));
  }

  toggleLike(songId: string): boolean {
    const likes = this.get('likedSongs');
    const idx = likes.indexOf(songId);
    if (idx > -1) {
      likes.splice(idx, 1);
      this.set('likedSongs', likes);
      return false;
    }
    likes.push(songId);
    this.set('likedSongs', likes);
    return true;
  }

  isLiked(songId: string): boolean {
    return this.get('likedSongs').includes(songId);
  }

  createPlaylist(name: string): string {
    const playlists = this.get('playlists');
    const id = `pl_${Date.now()}`;
    playlists.push({ id, name, songs: [], createdAt: Date.now() });
    this.set('playlists', playlists);
    return id;
  }

  deletePlaylist(id: string): void {
    this.set('playlists', this.get('playlists').filter(p => p.id !== id));
  }

  addToPlaylist(playlistId: string, songId: string): void {
    const playlists = this.get('playlists');
    const pl = playlists.find(p => p.id === playlistId);
    if (pl && !pl.songs.includes(songId)) {
      pl.songs.push(songId);
      this.set('playlists', playlists);
    }
  }

  removeFromPlaylist(playlistId: string, songId: string): void {
    const playlists = this.get('playlists');
    const pl = playlists.find(p => p.id === playlistId);
    if (pl) {
      pl.songs = pl.songs.filter(s => s !== songId);
      this.set('playlists', playlists);
    }
  }

  saveWindowBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.set('windowBounds', bounds);
  }

  getWindowBounds(): { x: number; y: number; width: number; height: number } | undefined {
    return this.get('windowBounds');
  }
}
