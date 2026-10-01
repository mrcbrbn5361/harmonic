/* ============================================
   Harmonic - Views Helpers (P0, streaming-only)
   Saf, DOM'suz görünüm mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC (document, api.*, updatePlayIcon) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { QueueItem } from './state';

export interface LyricLine {
  time: number;
  text: string;
}

export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTime(sec: number, padMinutes = false): string {
  if (sec === undefined || sec === null || isNaN(sec) || sec < 0) return padMinutes ? '00:00' : '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const mStr = padMinutes ? String(m).padStart(2, '0') : String(m);
  return `${mStr}:${s.toString().padStart(2, '0')}`;
}

export function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const matches = [...line.matchAll(timeRegex)];
    if (matches.length > 0) {
      const text = line.replace(timeRegex, '').trim();
      for (const match of matches) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const msStr = match[3] || '0';
        const ms = parseFloat(`0.${msStr}`);
        const totalSeconds = min * 60 + sec + ms;
        result.push({ time: totalSeconds, text });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

export function sanitizeName(name: string | undefined | null): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return '';
  if (/^(guide|hamburger|menu|account|hesap|profil|open guide|rehber|kılavuz|youtube music)$/i.test(trimmed)) return '';
  return trimmed;
}

/** syncActiveLyric'in saf kararı: curTime + 0.3 eşiğini geçen son satır. */
export function findActiveLyricIndex(lines: LyricLine[], curTime: number): number {
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= curTime + 0.3) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}

export interface DisplayUser {
  name: string;
  email: string;
}

/** updateAuthUI'daki görünen isim kararı: geçerli isim yoksa e-posta prefix'i. */
export function resolveDisplayName(user: DisplayUser | null | undefined): string {
  if (!user) return '';
  if (user.name && user.name.length > 1) return user.name;
  if (user.email) return user.email.split('@')[0];
  return user.name;
}

/** updateAuthUI'daki yüksek çözünürlüklü avatar dönüşümü. */
export function toHiResAvatar(picture: string): string {
  return picture.replace(/=s\d+/, '=s200').replace(/=w\d+.*/, '=s200-c-k-c0x00ffffff-no-rj');
}

/** Avatar harfi: isim varsa ilk harfin büyüğü. */
export function getAvatarInitial(name: string | undefined | null): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase();
}

/** renderQueue'daki upcoming dilimi: çalan parçadan sonrakiler, yoksa tamamı. */
export function getUpcomingContext(contextQueue: QueueItem[], currentSongId?: string | null): QueueItem[] {
  const idx = contextQueue.findIndex((s) => s.id === currentSongId);
  return idx >= 0 ? contextQueue.slice(idx + 1) : contextQueue;
}
