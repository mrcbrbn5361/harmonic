/* ============================================
   Harmonic - Queue Logic (P0, streaming-only)
   Saf, DOM'suz kuyruk mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { Song, QueueItem, QueueContext } from './state';

export interface QueueStateSlice {
  queue: QueueItem[];
  queueIndex: number;
  userQueue: QueueItem[];
  contextQueue: QueueItem[];
  contextName: string;
  contextType: QueueContext['type'];
  currentSong: QueueItem | null;
  shuffle: boolean;
  shuffleOrder: number[];
  repeat: 'off' | 'all' | 'one';
}

export function fisherYatesShuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildMergedQueue(
  userQueue: QueueItem[],
  contextQueue: QueueItem[]
): QueueItem[] {
  return [...userQueue, ...contextQueue];
}

export function applyAddToQueue(s: QueueStateSlice, song: Song): void {
  s.userQueue.push(song as QueueItem);
  s.queue = buildMergedQueue(s.userQueue, s.contextQueue);
}

export function applyPlayNext(s: QueueStateSlice, song: Song): void {
  s.userQueue.unshift(song as QueueItem);
  s.queue = buildMergedQueue(s.userQueue, s.contextQueue);
}

export function applyClearUserQueue(s: QueueStateSlice): void {
  s.userQueue = [];
  s.queue = buildMergedQueue(s.userQueue, s.contextQueue);
}

export function applySetContext(
  s: QueueStateSlice,
  songs: Song[],
  name: string,
  type: QueueContext['type']
): void {
  s.contextQueue = songs as QueueItem[];
  s.contextName = name;
  s.contextType = type;
  s.queue = buildMergedQueue(s.userQueue, s.contextQueue);
  // Yeni bağlam: eski shuffle sırası geçersiz
  s.shuffleOrder = [];
  if (s.queue.length === 0) {
    s.queueIndex = -1;
  } else if (s.currentSong) {
    const idx = s.queue.findIndex((t) => t.id === s.currentSong!.id);
    s.queueIndex =
      idx !== -1
        ? idx
        : Math.min(Math.max(s.queueIndex, 0), s.queue.length - 1);
  } else {
    s.queueIndex = Math.min(Math.max(s.queueIndex, -1), s.queue.length - 1);
  }
}

export type NextDecision =
  | { kind: 'play'; index: number; shuffleOrder?: number[] }
  | { kind: 'repeat-current' }
  | { kind: 'radio' }
  | { kind: 'stop' };

export function getNextIndex(s: QueueStateSlice): NextDecision {
  if (s.queue.length === 0) return { kind: 'stop' };
  if (s.repeat === 'one') {
    return { kind: 'repeat-current' };
  }
  if (s.shuffle) {
    const order =
      s.shuffleOrder.length === 0
        ? fisherYatesShuffle(s.queue.map((_, i) => i))
        : [...s.shuffleOrder];
    const pos = order.indexOf(s.queueIndex);
    const nextPos = pos + 1;
    if (nextPos < order.length) {
      return {
        kind: 'play',
        index: order[nextPos],
        ...(s.shuffleOrder.length === 0 ? { shuffleOrder: order } : {}),
      };
    }
    if (s.repeat === 'all') {
      const fresh = fisherYatesShuffle(s.queue.map((_, i) => i));
      return { kind: 'play', index: fresh[0], shuffleOrder: fresh };
    }
    return s.currentSong ? { kind: 'radio' } : { kind: 'stop' };
  }
  const nextIdx = s.queueIndex + 1;
  if (nextIdx < s.queue.length) {
    return { kind: 'play', index: nextIdx };
  }
  if (s.repeat === 'all') {
    return { kind: 'play', index: 0 };
  }
  return s.currentSong ? { kind: 'radio' } : { kind: 'stop' };
}

export type PrevDecision =
  | { kind: 'play'; index: number; shuffleOrder?: number[] }
  | { kind: 'restart' }
  | { kind: 'noop' };

export function getPrevIndex(
  s: QueueStateSlice,
  currentTime: number
): PrevDecision {
  if (s.queue.length === 0) return { kind: 'noop' };
  if (currentTime > 3) return { kind: 'restart' };
  if (s.shuffle) {
    const order =
      s.shuffleOrder.length === 0
        ? fisherYatesShuffle(s.queue.map((_, i) => i))
        : [...s.shuffleOrder];
    const pos = order.indexOf(s.queueIndex);
    if (pos > 0) {
      return {
        kind: 'play',
        index: order[pos - 1],
        ...(s.shuffleOrder.length === 0 ? { shuffleOrder: order } : {}),
      };
    }
    return { kind: 'restart' };
  }
  if (s.queueIndex <= 0) return { kind: 'restart' };
  return { kind: 'play', index: s.queueIndex - 1 };
}
