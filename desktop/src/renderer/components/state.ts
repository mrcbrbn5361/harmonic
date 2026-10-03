/* ============================================
   Harmonic - Desktop Music Client
   Application State & Type Definitions
   ============================================ */

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  thumbnail: string;
  duration: number;
  album?: string;
  durationText?: string;
}

export interface QueueItem extends Song {}

export interface QueueContext {
  name: string;
  type: 'playlist' | 'album' | 'search' | 'home' | 'auto' | 'radio';
  songs: QueueItem[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface AppState {
  page: string;
  currentSong: QueueItem | null;
  queue: QueueItem[];
  queueIndex: number;
  userQueue: QueueItem[];
  contextQueue: QueueItem[];
  contextName: string;
  contextType: 'playlist' | 'album' | 'search' | 'home' | 'auto' | 'radio';
  history: QueueItem[];
  playing: boolean;
  shuffle: boolean;
  shuffleOrder: number[];
  repeat: 'off' | 'all' | 'one';
  volume: number;
  lastVolume: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  lastPausedAt: number;
  liked: Set<string>;
  likedSongsMap: Record<string, Song>;
  recentlyPlayed: Song[];
  panelOpen: 'lyrics' | 'queue' | null;
  lastSearchResults: Song[];
  libraryTab: 'recent' | 'songs' | 'albums' | 'playlists';
  searchFilter: 'all' | 'songs' | 'videos' | 'albums' | 'artists';
  navGeneration: number;
  isLoggedIn: boolean;
  user: UserProfile | null;
  currentLyrics?: string | null;
}

export const state: AppState = {
  page: 'home',
  currentSong: null,
  queue: [],
  queueIndex: -1,
  userQueue: [],
  contextQueue: [],
  contextName: '',
  contextType: 'home',
  history: [],
  playing: false,
  shuffle: false,
  shuffleOrder: [],
  repeat: 'off',
  volume: 80,
  lastVolume: 80,
  currentTime: 0,
  duration: 0,
  paused: false,
  lastPausedAt: 0,
  liked: new Set<string>(),
  likedSongsMap: {},
  recentlyPlayed: [],
  panelOpen: null,
  lastSearchResults: [],
  libraryTab: 'recent',
  searchFilter: 'all',
  navGeneration: 0,
  isLoggedIn: false,
  user: null,
  currentLyrics: null
};

// Global Song Registry (Tüm sayfalardaki şarkıların kalıcı nesne önbelleği)
export const songRegistry = new Map<string, Song>();

// State yardımcı mutasyon fonksiyonları
// Tek kaynak: birleştirme mantığı queue.ts buildMergedQueue'dadır.
import { buildMergedQueue } from './queue';

export function rebuildMergedQueue(): QueueItem[] {
  return buildMergedQueue(state.userQueue, state.contextQueue);
}

export function resetQueue(): void {
  state.queue = [];
  state.userQueue = [];
  state.contextQueue = [];
  state.queueIndex = -1;
  state.shuffleOrder = [];
}
