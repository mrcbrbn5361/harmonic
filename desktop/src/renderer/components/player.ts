/* ============================================
   Harmonic - Player Logic (P0, streaming-only)
   Saf, DOM'suz oynatıcı mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC/CDP (ytPlayer, api.*, updatePlayIcon) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { Song, QueueItem } from './state';
import {
  buildMergedQueue,
  fisherYatesShuffle,
  type QueueStateSlice,
} from './queue';

export interface PlayerStateSlice extends QueueStateSlice {
  history: QueueItem[];
  recentlyPlayed: Song[];
}

export type RepeatMode = 'off' | 'all' | 'one';

/** playSong'un saf kısmı: queue pin/append + history-50 + currentSong + recent-100. */
export function applyPreparePlay(s: PlayerStateSlice, song: Song): void {
  const idx = s.queue.findIndex((t) => t.id === song.id);
  if (idx !== -1) {
    s.queueIndex = idx;
  } else {
    s.queue.push(song as QueueItem);
    s.queueIndex = s.queue.length - 1;
  }
  if (s.currentSong && s.currentSong.id !== song.id) {
    s.history = [s.currentSong, ...s.history.filter((t) => t.id !== song.id)].slice(0, 50);
  }
  s.currentSong = song as QueueItem;
  s.recentlyPlayed = [song, ...s.recentlyPlayed.filter((t) => t.id !== song.id)].slice(0, 100);
}

/** toggleShuffle'ın saf kısmı: bayrak + shuffleOrder üretim/temizleme. */
export function applyToggleShuffle(s: PlayerStateSlice): void {
  s.shuffle = !s.shuffle;
  if (s.shuffle) {
    s.shuffleOrder = fisherYatesShuffle(s.queue.map((_, i) => i));
  } else {
    s.shuffleOrder = [];
  }
}

/** toggleRepeat döngüsü: off → all → one → off. */
export function cycleRepeat(r: RepeatMode): RepeatMode {
  const modes: RepeatMode[] = ['off', 'all', 'one'];
  return modes[(modes.indexOf(r) + 1) % modes.length];
}

/** Radyo duplicate-filtresi: çalan parçayı ve (varsa) mevcut kuyruğu ele. */
export function filterRadioItems(
  items: Song[],
  excludeId: string,
  existingIds?: Set<string>
): Song[] {
  return items.filter((s) => {
    if (s.id === excludeId) return false;
    if (existingIds && existingIds.has(s.id)) return false;
    return true;
  });
}

/** Radyo öğelerini context'e ekleyip birleşik kuyruğu yeniden kur. */
export function applyAppendRadioItems(s: PlayerStateSlice, newItems: Song[]): void {
  s.contextQueue.push(...(newItems as QueueItem[]));
  s.queue = buildMergedQueue(s.userQueue, s.contextQueue);
}

export type EndedDecision = 'repeat-one' | 'stop' | 'next';

/** handleTrackEnded'in saf kararı: repeat-one → baştan, autoplay kapalı + sonda → dur, yoksa next. */
export function decideTrackEnded(
  s: Pick<PlayerStateSlice, 'repeat' | 'queueIndex' | 'queue' | 'currentSong'>,
  autoPlay: boolean
): EndedDecision {
  if (!s.currentSong) return 'stop';
  if (s.repeat === 'one') return 'repeat-one';
  if (autoPlay === false && s.repeat === 'off' && s.queueIndex >= s.queue.length - 1) {
    return 'stop';
  }
  return 'next';
}

export type TogglePlayAction = 'pause' | 'resume' | 'play-queue' | 'noop';

/** togglePlay'in saf kararı: çalıyorsa duraklat, şarkı varsa devam, kuyruk varsa baştan (app.ts ile birebir). */
export function resolveTogglePlayAction(
  playing: boolean,
  hasCurrentSong: boolean,
  queueLength: number
): TogglePlayAction {
  if (playing) return 'pause';
  if (hasCurrentSong) return 'resume';
  if (queueLength > 0) return 'play-queue';
  return 'noop';
}
