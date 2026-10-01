/* ============================================
   Harmonic - Panels Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz panel/lyrics/queue mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC (querySelector, api.*, playSong, setContext) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { QueueItem } from './state';
import { escapeHtml, formatTime, type LyricLine } from './views';

export type PanelKind = 'lyrics' | 'queue';

/** setupPanels'taki aç/kapat kararı: aynı panele tıklama → kapat (null). */
export function resolvePanelToggle(
  current: PanelKind | null,
  clicked: PanelKind,
): PanelKind | null {
  if (current === clicked) return null;
  return clicked;
}

// ── Context menu (showContextMenu'deki saf kısım) ──

/** Beğeni satırı etiketi: kayıtlıysa kaldır, yoksa ekle. */
export function contextMenuLikeLabel(isLiked: boolean): string {
  return isLiked ? 'Beğeniyi Kaldır' : 'Beğeniye Ekle';
}

/** Context menü iç HTML'i (app.ts satır 1393-1402 ile birebir). */
export function buildContextMenuHtml(isLiked: boolean): string {
  return `
      <div class="ctx-item" data-action="play">Şimdi Çal</div>
      <div class="ctx-item" data-action="playNext">Önce Çal</div>
      <div class="ctx-item" data-action="addToQueue">Sıraya Ekle</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="addToLiked">${contextMenuLikeLabel(isLiked)}</div>
      <div class="ctx-item" data-action="addToPlaylist">Çalma Listesine Ekle...</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="copyLink">Bağlantıyı Kopyala</div>
    `;
}

export interface MenuPos {
  left: number;
  top: number;
}

/** Menü konumu: taşmayı 200x250 menü ölçüsüyle kıstırır. */
export function clampMenuPos(
  x: number,
  y: number,
  innerWidth: number,
  innerHeight: number,
  menuW = 200,
  menuH = 250,
): MenuPos {
  return {
    left: Math.min(x, innerWidth - menuW),
    top: Math.min(y, innerHeight - menuH),
  };
}

/** copyLink aksiyonundaki paylaşım URL'i. */
export function copyLinkFor(songId: string): string {
  return `https://music.youtube.com/watch?v=${songId}`;
}

// ── Lyrics (renderLyricsContent + syncActiveLyric saf kısmı) ──

/** Zaman senkronlu satırların HTML'i (app.ts satır 1585-1589 ile birebir). */
export function buildSyncedLyricsHtml(parsed: LyricLine[]): string {
  return parsed.map((item, idx) => `
        <div class="lyric-line synced" data-time="${item.time}" data-idx="${idx}">
          ${item.text ? escapeHtml(item.text) : '&nbsp;'}
        </div>
      `).join('');
}

/** Düzyazı sözlerin HTML'i (app.ts satır 1599-1601 ile birebir). */
export function buildPlainLyricsHtml(lyrics: string): string {
  return lyrics.split('\n').map((line: string) =>
    `<div class="lyric-line">${line ? escapeHtml(line) : '&nbsp;'}</div>`
  ).join('');
}

/** renderLyricsContent dallanması: senkronlu varsa synced, yoksa düz. */
export function buildLyricsHtml(lyrics: string, parsed: LyricLine[]): string {
  if (parsed.length > 0) return buildSyncedLyricsHtml(parsed);
  return buildPlainLyricsHtml(lyrics);
}

/** Söz satırı tıklamasındaki süre ayrıştırması: geçersizse null (çağıran seek yapmaz). */
export function parseSeekTime(raw: string | undefined | null): number | null {
  const t = parseFloat(raw || '0');
  if (isNaN(t)) return null;
  return t;
}

/** syncActiveLyric guard'ı: söz yoksa ya da lyrics paneli kapalıysa dokunma. */
export function shouldSyncLyric(parsedLen: number, panelOpen: string | null): boolean {
  return parsedLen > 0 && panelOpen === 'lyrics';
}

/** Aktif satır değişti mi? (değişmediyse DOM/scroll/bot dokunulmaz). */
export function hasLyricChanged(prevIdx: number, nextIdx: number): boolean {
  return prevIdx !== nextIdx;
}

/** loadLyrics stale guard'ı: yanıt gelene kadar parça değiştiyse sonucu at. */
export function isStaleLyricResponse(
  currentId: string | undefined | null,
  requestedId: string | undefined | null,
): boolean {
  return currentId !== requestedId;
}

// ── Queue (renderQueue saf kısmı) ──

export const QUEUE_EMPTY_HTML =
  '<div class="empty-state"><p class="empty-hint-text">Sıra boş</p></div>';

/** renderQueue boş dalı: iki liste de boşsa boş görünüm. */
export function isQueueEmpty(userLen: number, contextLen: number): boolean {
  return userLen === 0 && contextLen === 0;
}

/** Kullanıcı sırası bölümü (app.ts satır 1641-1655 ile birebir). */
export function buildUserQueueSection(userQueue: QueueItem[]): string {
  return `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h4 style="font-size:13px;font-weight:600;color:var(--c-text-2)">Sıradaki Şarkılar</h4>
          <button class="icon-btn" id="clearUserQueue" style="font-size:11px;padding:4px 8px;background:var(--c-bg-3);border-radius:4px;color:var(--c-text-2);border:none;cursor:pointer">Temizle</button>
        </div>
        <div class="song-list">${userQueue.map((s, i) => `
          <div class="queue-item" data-type="user" data-idx="${i}">
            <img class="song-thumb" src="${escapeHtml(s.thumbnail)}" alt="" style="width:36px;height:36px" onerror="this.style.display='none'">
            <div class="song-meta">
              <div class="song-title">${escapeHtml(s.title)}</div>
              <div class="song-artist">${escapeHtml(s.artist)}</div>
            </div>
            <span class="song-dur">${formatTime(s.duration)}</span>
          </div>`).join('')}</div>
      </div>`;
}

/** Bağlam bölümü (app.ts satır 1663-1674 ile birebir). */
export function buildContextQueueSection(
  upcomingCtx: QueueItem[],
  contextLabel: string,
): string {
  return `<div>
          <h4 style="font-size:13px;font-weight:600;color:var(--c-text-2);margin-bottom:8px">${escapeHtml(contextLabel)}</h4>
          <div class="song-list">${upcomingCtx.map((s, i) => `
            <div class="queue-item" data-type="context" data-idx="${i}">
              <img class="song-thumb" src="${escapeHtml(s.thumbnail)}" alt="" style="width:36px;height:36px" onerror="this.style.display='none'">
              <div class="song-meta">
                <div class="song-title">${escapeHtml(s.title)}</div>
                <div class="song-artist">${escapeHtml(s.artist)}</div>
              </div>
              <span class="song-dur">${formatTime(s.duration)}</span>
            </div>`).join('')}</div>
        </div>`;
}

/**
 * renderQueue HTML kararı (app.ts satır 1630-1678 ile birebir):
 * boş → boş görünüm; kullanıcı + upcoming bağlam bölümleri; ikisi de
 * boşsa (örn. bağlam var ama upcoming dilimi boş) boş görünüme düşer.
 */
export function buildQueueHtml(
  userQueue: QueueItem[],
  contextQueueLen: number,
  upcomingCtx: QueueItem[],
  contextLabel: string,
): string {
  if (isQueueEmpty(userQueue.length, contextQueueLen)) return QUEUE_EMPTY_HTML;

  let html = '';

  if (userQueue.length) {
    html += buildUserQueueSection(userQueue);
  }

  if (contextQueueLen) {
    if (upcomingCtx.length) {
      html += buildContextQueueSection(upcomingCtx, contextLabel);
    }
  }

  return html || QUEUE_EMPTY_HTML;
}

/** Kullanıcı sırasından seçim: tüketilen ögenin ardından kuyruk bir geri kayar. */
export function queueIndexAfterUserPick(idx: number): number {
  return idx - 1;
}

/** Bağlam diliminden seçim: idx dilimlenmiş upcomingCtx'e aittir. */
export function resolveContextQueuePick(
  upcomingCtx: QueueItem[],
  idx: number,
): QueueItem | undefined {
  return upcomingCtx[idx];
}

// ── Add-to-playlist modal (openAddToPlaylistModal saf kısmı) ──

export interface PlaylistPickerEntry {
  id: string;
  name: string;
  songs?: readonly { id: string }[];
}

export const PLAYLIST_PICKER_EMPTY_HTML =
  '<div class="empty-hint" style="padding:16px;text-align:center;color:var(--c-text-2)">Henüz bir çalma listesi oluşturmadınız.</div>';

/** Parça listede kayıtlı mı? (songs boş/undefined → false). */
export function playlistHasSong(
  songs: readonly { id: string }[] | undefined,
  songId: string,
): boolean {
  return (songs || []).some((s) => s.id === songId);
}

/** addToPlaylist modal liste HTML'i (app.ts renderList map'i ile birebir). */
export function buildPlaylistPickerListHtml(
  playlists: readonly PlaylistPickerEntry[],
  songId: string,
): string {
  if (!playlists.length) return PLAYLIST_PICKER_EMPTY_HTML;
  return playlists.map((pl) => {
    const hasSong = playlistHasSong(pl.songs, songId);
    return `
          <button class="btn btn-ghost" data-pl-id="${escapeHtml(pl.id)}" style="width:100%;justify-content:space-between;padding:10px 12px;border-radius:8px;background:var(--c-bg-3);border:1px solid var(--c-border);cursor:pointer;display:flex;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;text-align:left;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <div>
                <div style="font-weight:600;font-size:13px;color:var(--c-text-0)">${escapeHtml(pl.name)}</div>
                <div style="font-size:11px;color:var(--c-text-2)">${(pl.songs || []).length} şarkı</div>
              </div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${hasSong ? 'var(--c-accent)' : 'var(--c-text-2)'}">${hasSong ? '✓ Eklendi' : '+ Ekle'}</span>
          </button>
        `;
  }).join('');
}
