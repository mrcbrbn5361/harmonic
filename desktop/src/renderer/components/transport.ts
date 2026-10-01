/* ============================================
   Harmonic - Transport Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz transport mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC (querySelector, api.*, playSong) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { Song } from './state';

export type VolumeTier = 'muted' | 'low' | 'high';

/** applyVol / klavye / tekerlek ortak: 0..100'e yuvarlayıp kıstırır. */
export function clampVolume(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** updateVolumeSliderBg'deki ikon dalı: 0 → muted, <50 → low, else high. */
export function volumeTier(volume: number): VolumeTier {
  if (volume === 0) return 'muted';
  if (volume < 50) return 'low';
  return 'high';
}

/** Tekerlek/klavye adımı: mevcut + delta, 0..100 kıstırılmış. */
export function volumeStepTo(current: number, delta: number): number {
  return clampVolume(current + delta);
}

/** Mute düğmesi hedefi: ses>0 → 0, yoksa lastVolume||80 (app.ts ile birebir). */
export function muteToggleTarget(volume: number, lastVolume: number): number {
  if (volume > 0) return 0;
  return lastVolume || 80;
}

/** Scrubber tıklama/sürükleme oranı: 0..1 kıstırılmış, geçersiz genişlikte 0. */
export function seekFraction(clientX: number, rectLeft: number, rectWidth: number): number {
  if (!rectWidth || rectWidth <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - rectLeft) / rectWidth));
}

/** Oran → saniye: süre yoksa null (çağıran erken döner). */
export function seekTimeFor(fraction: number, duration: number): number | null {
  if (!duration) return null;
  return fraction * duration;
}

/** Klavye/medya-session kaydırma hedefi: 0..duration kıstırılmış, süre yoksa current. */
export function clampSeekTarget(currentTime: number, delta: number, duration: number): number {
  if (!duration) return currentTime;
  return Math.max(0, Math.min(duration, currentTime + delta));
}

/** Klavye ok adımı: Shift → 10sn, yoksa 5sn (app.ts ile birebir). */
export function keySeekStep(shiftKey: boolean): 5 | 10 {
  return shiftKey ? 10 : 5;
}

/** updatePlayIcon'un saf kararı. */
export function playIconVisibility(playing: boolean): { play: 'none' | 'block'; pause: 'none' | 'block' } {
  return playing ? { play: 'none', pause: 'block' } : { play: 'block', pause: 'none' };
}

/** Like dolgusu: aktif → currentColor, yoksa none. */
export function likeFill(liked: boolean): 'currentColor' | 'none' {
  return liked ? 'currentColor' : 'none';
}

export interface LikeSlice {
  liked: Set<string>;
  likedSongsMap: Record<string, Song>;
}

/**
 * toggleLike'ın saf Set/Map kısmı: registry + DOM + loadLiked app.ts wrapper'ındadır.
 * Dönüş: şimdi beğeniliyor mu?
 */
export function applyLikeToggle(slice: LikeSlice, id: string, song?: Song): boolean {
  if (slice.liked.has(id)) {
    slice.liked.delete(id);
    delete slice.likedSongsMap[id];
    return false;
  }
  slice.liked.add(id);
  if (song) slice.likedSongsMap[id] = song;
  return true;
}

/** Klavye guard'ı: INPUT/TEXTAREA içinde yazarken kısayol çalışmaz. */
export function isTypingTarget(tagName: string | undefined | null): boolean {
  return tagName === 'INPUT' || tagName === 'TEXTAREA';
}

export type KeyAction =
  | 'togglePlay'
  | 'prev'
  | 'next'
  | 'seekBack'
  | 'seekFwd'
  | 'volUp'
  | 'volDown'
  | 'like'
  | 'queue'
  | 'lyrics'
  | 'mute'
  | 'shuffle'
  | 'repeat'
  | 'maximize'
  | 'escape'
  | null;

/**
 * setupKeyboardShortcuts'taki code → aksiyon haritası (saf çıkarım).
 * ArrowLeft/Right + Ctrl → prev/next, yoksa seek; süre guard'ı çağırandadır.
 */
export function resolveKeyAction(code: string, opts: { ctrlKey: boolean }): KeyAction {
  switch (code) {
    case 'Space': return 'togglePlay';
    case 'ArrowLeft': return opts.ctrlKey ? 'prev' : 'seekBack';
    case 'ArrowRight': return opts.ctrlKey ? 'next' : 'seekFwd';
    case 'ArrowUp': return 'volUp';
    case 'ArrowDown': return 'volDown';
    case 'KeyN': return 'next';
    case 'KeyP': return 'prev';
    case 'KeyL': return 'like';
    case 'KeyQ': return 'queue';
    case 'KeyT': return 'lyrics';
    case 'KeyM': return 'mute';
    case 'KeyS': return 'shuffle';
    case 'KeyR': return 'repeat';
    case 'KeyF': return 'maximize';
    case 'Escape': return 'escape';
    default: return null;
  }
}

/** toggleRepeat düğme durumu: repeat !== 'off' → aktif. */
export function isRepeatActive(repeat: string): boolean {
  return repeat !== 'off';
}

/** repeat === 'one' → "1" rozetli ikon dalı. */
export function isRepeatOne(repeat: string): boolean {
  return repeat === 'one';
}
