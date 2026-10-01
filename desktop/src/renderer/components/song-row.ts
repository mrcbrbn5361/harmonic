/* ============================================
   Harmonic - Song Row Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz şarkı satırı mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC (querySelector, api.*, playSong, setContext) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { QueueItem, QueueContext, Song } from './state';
import { escapeHtml, formatTime } from './views';

export interface SongLookup {
  currentSong?: QueueItem | null;
  registryGet?: (id: string) => Song | QueueItem | undefined;
  registryHas?: (id: string) => boolean;
  queue?: QueueItem[];
  likedMap?: Record<string, Song>;
  lastSearchResults?: Song[];
}

/** findSong'un saf kararı: current → registry → queue → likedMap → lastSearch. */
export function findSongIn(lookup: SongLookup, id: string | undefined): Song | QueueItem | undefined {
  if (!id) return undefined;
  if (lookup.currentSong?.id === id) return lookup.currentSong;
  if (lookup.registryHas?.(id)) return lookup.registryGet?.(id);
  const inQueue = lookup.queue?.find((s) => s.id === id);
  if (inQueue) return inQueue;
  const inLiked = lookup.likedMap?.[id];
  if (inLiked) return inLiked;
  return lookup.lastSearchResults?.find((s) => s.id === id);
}

/** songRow'un saf HTML kararı: kayıt (registry) yan etkisi app.ts wrapper'ındadır. */
export function buildSongRow(song: Song, opts: { isPlaying: boolean; isLiked: boolean; num?: number }): string {
  const subtitle = song.album
    ? `${escapeHtml(song.artist)} · ${escapeHtml(song.album)}`
    : escapeHtml(song.artist);
  return `
      <div class="song-row${opts.isPlaying ? ' playing' : ''}" data-id="${escapeHtml(song.id)}">
        ${opts.num != null ? `<span class="song-num">${opts.num}</span>` : ''}
        <img class="song-thumb" src="${escapeHtml(song.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="song-meta">
          <div class="song-title">${escapeHtml(song.title)}</div>
          <div class="song-artist">${subtitle}</div>
        </div>
        <span class="song-dur">${formatTime(song.duration)}</span>
        <div class="song-actions">
          <button class="icon-btn like-btn${opts.isLiked ? ' active' : ''}" data-id="${escapeHtml(song.id)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${opts.isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>
      </div>`;
}

export interface HomeOrSearchFlags {
  inSearchResults: boolean;
  inHomeContent: boolean;
  page: string;
}

/** attachSongEvents'teki radyo-yönlendirme kararı (home/search bağlamı). */
export function isHomeOrSearchContext(
  contextType: QueueContext['type'] | undefined,
  flags: HomeOrSearchFlags,
): boolean {
  return (
    contextType === 'radio' ||
    flags.inSearchResults ||
    flags.inHomeContent ||
    flags.page === 'search' ||
    flags.page === 'home'
  );
}

/** Radyo devam parçaları: tıklanan şarkı hariç tutulur (app.ts satır 482 ile birebir). */
export function filterRadioRecs(items: Song[], excludeId: string): QueueItem[] {
  return items.filter((s) => s.id !== excludeId) as QueueItem[];
}

export interface PlaybackContext {
  songs: QueueItem[];
  clickedIdx: number;
}

/** Normal bağlam kararı: satır listesinden tıklanan konuma göre kuyruk dilimi. */
export function buildPlaybackContext(
  rowIds: Array<string | undefined>,
  find: (id: string | undefined) => Song | QueueItem | undefined,
  clickedId: string | undefined,
): PlaybackContext {
  const songs: QueueItem[] = [];
  let clickedIdx = 0;
  for (const rid of rowIds) {
    const s = find(rid);
    if (s) {
      if (s.id === clickedId) clickedIdx = songs.length;
      songs.push(s as QueueItem);
    }
  }
  return { songs, clickedIdx };
}
