/* ============================================
   Harmonic - Lyrics View (R-03/R1, streaming-only)
   Söz paneli mantığı — app.ts'ten taşındı.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır
   (loadLyrics / renderLyricsContent / syncActiveLyric).
   Söz önbelleği → bot sunucusu beslemesi tekilleştirildi
   (cacheLyricsToBotServer: playSong/poll/loadLyrics tekrarı).
   system.ts dokunulmaz; offline/download kapsam dışıdır.
   ============================================ */

import { state } from './state';
import { api, ytLyrics } from './api-client';
import { parseLRC, findActiveLyricIndex, type LyricLine } from './views';
import {
  buildLyricsHtml,
  parseSeekTime,
  shouldSyncLyric,
  hasLyricChanged,
  isStaleLyricResponse,
} from './panels';

/** Lyrics panel yükleme yer tutucusu (app.ts loadLyrics ile birebir). */
export const LYRICS_LOADING_HTML =
  '<div class="empty-state"><p class="empty-hint-text">Yükleniyor...</p></div>';
/** Söz bulunamadı yedeği (app.ts loadLyrics ile birebir — retry düğmeli). */
export const LYRICS_NOT_FOUND_HTML =
  '<div class="empty-state"><p class="empty-text">Şarkı sözleri bulunamadı</p><p class="empty-hint-text">Bu şarkı için henüz söz eklenmemiş</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
/** Söz yükleme-hatası yedeği (app.ts loadLyrics ile birebir — retry düğmeli). */
export const LYRICS_ERROR_HTML =
  '<div class="empty-state"><p class="empty-text">Sözler yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

let currentParsedLyrics: LyricLine[] = [];
let lastActiveLyricIdx = -1;

/** Bot sunucusuna söz önbelleğini besle (app.ts playSong/poll/loadLyrics tekrarının tekilleştirilmesi).
 *  Stale guard: yanıt gelene kadar parça değiştiyse önbellek dokunulmaz. */
export function cacheLyricsToBotServer(songId: string, lyrics: string | null): void {
  if (state.currentSong?.id !== songId) return; // Stale parça
  state.currentLyrics = lyrics || null;
  if (api.botServer) {
    api.botServer.updateState({ lyrics: lyrics || undefined }).catch(() => {});
  }
}

export async function loadLyrics() {
  if (!state.currentSong) return;
  const body = $('#lyricsBody');
  const song = state.currentSong;

  if (state.currentLyrics) {
    renderLyricsContent(state.currentLyrics);
    return;
  }

  body.innerHTML = LYRICS_LOADING_HTML;
  try {
    const lyrics = await ytLyrics(song.id, song.title, song.artist, song.duration);
    if (isStaleLyricResponse(state.currentSong?.id, song.id)) return; // Stale parça

    cacheLyricsToBotServer(song.id, lyrics);

    if (lyrics) {
      renderLyricsContent(lyrics);
    } else {
      currentParsedLyrics = [];
      body.innerHTML = LYRICS_NOT_FOUND_HTML;
      body.querySelector('.btn-retry')?.addEventListener('click', () => {
        state.currentLyrics = undefined;
        loadLyrics();
      });
    }
  } catch {
    currentParsedLyrics = [];
    body.innerHTML = LYRICS_ERROR_HTML;
    body.querySelector('.btn-retry')?.addEventListener('click', () => {
      state.currentLyrics = undefined;
      loadLyrics();
    });
  }
}

export function renderLyricsContent(lyrics: string) {
  const body = $('#lyricsBody');
  const parsed = parseLRC(lyrics);
  currentParsedLyrics = parsed;
  lastActiveLyricIdx = -1;

  body.innerHTML = buildLyricsHtml(lyrics, parsed);

  if (parsed.length > 0) {
    body.querySelectorAll('.lyric-line.synced').forEach((el) => {
      el.addEventListener('click', () => {
        const t = parseSeekTime((el as HTMLElement).dataset.time);
        if (t !== null) api.player.seek(t).catch(() => {});
      });
    });
    syncActiveLyric(state.currentTime);
  }
}

export function syncActiveLyric(curTime: number) {
  if (!shouldSyncLyric(currentParsedLyrics.length, state.panelOpen)) return;
  const activeIdx = findActiveLyricIndex(currentParsedLyrics, curTime);

  if (hasLyricChanged(lastActiveLyricIdx, activeIdx)) {
    lastActiveLyricIdx = activeIdx;
    const body = $('#lyricsBody');
    body.querySelectorAll('.lyric-line.synced').forEach((el, idx) => {
      el.classList.toggle('active', idx === activeIdx);
    });

    if (activeIdx >= 0) {
      const activeEl = body.querySelector(`.lyric-line.synced[data-idx="${activeIdx}"]`);
      activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Bot sunucusuna anlık satırı aktar
      if (api.botServer && currentParsedLyrics[activeIdx]?.text) {
        api.botServer.updateState({
          currentLyricLine: currentParsedLyrics[activeIdx].text
        }).catch(() => {});
      }
    }
  }
}
