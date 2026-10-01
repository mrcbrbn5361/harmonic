/* ============================================
   Harmonic - Content Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz içerik mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır
   (loadHome / openBrowse / loadLibrary / loadLiked).
   DOM/IPC (querySelector, api.*, playSong, setContext,
   attachSongEvents, songRow state) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import { escapeHtml } from './views';

/** Ana sayfa kart limiti (app.ts: cards.slice(0, 8)). */
export const HOME_CARDS_LIMIT = 8;
/** Ana sayfa şarkı listesi limiti (app.ts: songs.slice(0, 10)). */
export const HOME_SONGS_LIMIT = 10;
/** Ana sayfa kuyruk kurulum limiti (app.ts: songs.slice(0, 30)). */
export const HOME_QUEUE_LIMIT = 30;
/** Kütüphane "Son Çalınanlar" limiti (app.ts: localRecent.slice(0, 30)). */
export const RECENT_SONGS_LIMIT = 30;

/** Ana sayfa boş-içerik yedeği (app.ts loadHome ile birebir). */
export const HOME_EMPTY_HTML =
  '<div class="empty-state"><p class="empty-text">İçerik bulunamadı</p></div>';
/** Browse boş-içerik yedeği (app.ts openBrowse ile birebir). */
export const BROWSE_EMPTY_HTML =
  '<div class="empty-state"><p class="empty-text">İçerik bulunamadı</p></div>';
/** Beğenilenler boş-içerik yedeği (app.ts loadLiked ile birebir). */
export const LIKED_EMPTY_HTML =
  '<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div><p class="empty-text">Henüz beğeni yok</p><p class="empty-hint-text">Beğendiğiniz şarkılar burada görünecek</p></div>';
/** Kütüphane yükleme-hatası yedeği (app.ts loadLibrary ile birebir). */
export const LIBRARY_ERROR_HTML =
  '<div class="empty-state"><p class="empty-text">Kütüphane yüklenemedi</p><p class="empty-hint-text">YouTube Music verileri alınırken bir sorun oluştu</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
/** Kütüphane genel boş-sekme yedeği (app.ts loadLibrary ile birebir). */
export const LIBRARY_EMPTY_HTML =
  '<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><p class="empty-text">Bu sekmede henüz içerik yok</p><p class="empty-hint-text">Müzik dinledikçe veya listeler oluşturdukça burada görünecek</p></div>';

export interface IdItem {
  id?: unknown;
}

export interface BrowseItem {
  browseId?: unknown;
}

export interface CardSource {
  browseId?: unknown;
  thumbnail?: unknown;
  title?: unknown;
  name?: unknown;
  artist?: unknown;
}

/** loadHome/openBrowse şarkı ayrımı: id'si olanlar (app.ts filter ile birebir). */
export function partitionSongs<T extends IdItem>(items: readonly T[]): T[] {
  return items.filter((i) => (i as { id?: unknown }).id);
}

/** loadHome/openBrowse kart ayrımı: browseId'si olanlar (app.ts filter ile birebir). */
export function partitionBrowseCards<T extends BrowseItem>(items: readonly T[]): T[] {
  return items.filter((i) => (i as { browseId?: unknown }).browseId);
}

/** İlk n eleman (cards.slice(0, 8) / songs.slice(0, 10|30) ile birebir). */
export function takeFirst<T>(arr: readonly T[], n: number): T[] {
  return arr.slice(0, n);
}

/** Ana sayfa kuyruk kurulum guard'ı: şarkı var + çalan yok + kuyruk boş. */
export function shouldInitHomeQueue(
  songCount: number,
  hasCurrentSong: boolean,
  queueLength: number,
): boolean {
  return songCount > 0 && !hasCurrentSong && queueLength === 0;
}

/** Stale yanıt guard'ı: istek nesli güncel nesille eşleşmiyorsa çöpe at. */
export function isStaleContent(requestGen: number, currentGen: number): boolean {
  return requestGen !== currentGen;
}

/** Parça sayısı etiketi: 0 ise boş (app.ts browse başlığı ile birebir). */
export function songCountLabel(count: number): string {
  return count ? `${count} şarkı` : '';
}

/** Kart başlığı: title yoksa name (app.ts c.title || c.name || '' ile birebir). */
export function cardTitleOf(card: CardSource): string {
  return String((card.title as string) || (card.name as string) || '');
}

/**
 * Tekli medya kartı HTML'i (home/browse/library ile birebir).
 * sub === undefined ise alt satır div'i yazılmaz (YT liste/sanatçı kartları);
 * aksi halde (boş string dahil) yazılır (home/browse/albüm kartları).
 */
export function buildMediaCard(
  browseId: unknown,
  thumbnail: unknown,
  title: unknown,
  sub?: string,
): string {
  const subHtml = sub === undefined ? '' : `<div class="card-sub">${escapeHtml(sub)}</div>`;
  return `<div class="card" data-browse="${escapeHtml(browseId)}" style="cursor:pointer">`
    + `<img class="card-thumb" src="${escapeHtml(thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">`
    + `<div class="card-title">${escapeHtml(title)}</div>`
    + `${subHtml}</div>`;
}

/** Kart kaynağından tekli kart HTML'i (başlık + alt-satır kararı tek noktada). */
export function buildCardFor(card: CardSource, sub?: string): string {
  return buildMediaCard(card.browseId, card.thumbnail, cardTitleOf(card), sub);
}

/** "Keşfet" bölümü sarmalayıcısı (app.ts loadHome ile birebir). */
export function buildDiscoverSection(cardsInner: string): string {
  return `<div style="margin-bottom:32px">`
    + `<h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--c-text-0)">Keşfet</h2>`
    + `<div class="card-grid">${cardsInner}</div></div>`;
}

/** Genel şarkı bölümü sarmalayıcısı (home + library recent ile birebir yapı). */
export function buildSongSection(heading: string, rowsInner: string): string {
  return `<div${heading === 'Önerilen Şarkılar' ? '' : ' style="margin-bottom:24px"'}>`
    + `<h${heading === 'Önerilen Şarkılar' ? '2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--c-text-0)"' : '3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)"'}>${heading}</h${heading === 'Önerilen Şarkılar' ? '2' : '3'}>`
    + `<div class="song-list">${rowsInner}</div></div>`;
}

/** Ana sayfa birleşimi: boşsa yedek HTML (app.ts `html || ...` ile birebir). */
export function resolveHomeHtml(combined: string): string {
  return combined || HOME_EMPTY_HTML;
}

/** openBrowse hedef kap kararı (app.ts activePage üçlüsü ile birebir). */
export function resolveBrowseContainerId(
  page: string,
): 'searchResults' | 'libraryContent' | 'homeContent' {
  if (page === 'search') return 'searchResults';
  if (page === 'library') return 'libraryContent';
  return 'homeContent';
}

/** Browse geri-düğmesi kararı (app.ts onBack/page zinciri ile birebir). */
export function resolveBrowseBack(
  hasOnBack: boolean,
  page: string,
): 'callback' | 'search' | 'library' | 'home' {
  if (hasOnBack) return 'callback';
  if (page === 'search') return 'search';
  if (page === 'library') return 'library';
  return 'home';
}

/** Browse başlık bloğu (kapak + başlık + sayı, app.ts ile birebir). */
export function buildBrowseHeader(title: string, thumb: string, songCount: number): string {
  return `<button id="btnBrowseBack" class="btn btn-ghost" style="margin-bottom:16px;display:flex;align-items:center;gap:6px">`
    + `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Geri</button>`
    + `<div style="display:flex;gap:16px;align-items:center;margin-bottom:20px;flex-wrap:wrap">`
    + `${thumb ? `<img src="${escapeHtml(thumb)}" style="width:96px;height:96px;border-radius:12px;object-fit:cover" onerror="this.style.display='none'">` : ''}`
    + `<div><h2 style="font-size:22px;font-weight:700;margin:0 0 4px">${escapeHtml(title)}</h2>`
    + `<p style="margin:0;color:var(--c-text-2);font-size:13px">${songCountLabel(songCount)}</p>`
    + `</div></div>`;
}

/** Browse gövde: şarkı listesi (app.ts songs dalı ile birebir). */
export function buildBrowseSongsBody(rowsInner: string): string {
  return `<div class="song-list">${rowsInner}</div>`;
}

/** Browse gövde: kart ızgarası (app.ts cards dalı ile birebir). */
export function buildBrowseCardsBody(cardsInner: string): string {
  return `<div class="card-grid">${cardsInner}</div>`;
}

export type LibraryTab = 'recent' | 'songs' | 'playlists' | 'albums';

/** Kütüphane sekmesi normalizasyonu (boş/bilinmeyen → 'recent'). */
export function normalizeLibraryTab(raw: unknown): LibraryTab {
  if (raw === 'recent' || raw === 'songs' || raw === 'playlists' || raw === 'albums') return raw;
  return 'recent';
}

/** Recent/songs bölümü görünürlüğü (app.ts tab === 'recent' || 'songs' ile birebir). */
export function shouldShowRecentSection(tab: LibraryTab): boolean {
  return tab === 'recent' || tab === 'songs';
}

/** Playlist bölümleri görünürlüğü (app.ts tab === 'playlists' ile birebir). */
export function shouldShowPlaylistSection(tab: LibraryTab): boolean {
  return tab === 'playlists';
}

/** Albüm bölümü görünürlüğü (app.ts tab === 'albums' ile birebir). */
export function shouldShowAlbumSection(tab: LibraryTab): boolean {
  return tab === 'albums';
}

/** Sanatçı bölümü görünürlüğü (app.ts `ytArtists.length && tab === 'albums'` ile birebir). */
export function shouldShowArtistsSection(artistCount: number, tab: LibraryTab): boolean {
  return artistCount > 0 && tab === 'albums';
}

export type LibraryEmptyKind = 'content' | 'error' | 'empty';

/** Kütüphane boş-durum kararı (app.ts !html + loadError + isLoggedIn zinciri ile birebir). */
export function resolveLibraryEmpty(
  hasHtml: boolean,
  loadError: boolean,
  isLoggedIn: boolean,
): LibraryEmptyKind {
  if (hasHtml) return 'content';
  if (loadError && isLoggedIn) return 'error';
  return 'empty';
}

/** Yerel beğenilerin çözümlenmesi: id → kayıt/registry/kuyruk/recent, boşlar atılır. */
export function resolveLocalLiked<T>(ids: readonly string[], lookup: (id: string) => T | undefined): T[] {
  const out: T[] = [];
  for (const id of ids) {
    const found = lookup(id);
    if (found) out.push(found);
  }
  return out;
}

/** Beğenilenler birleşimi (YT + yerel bölümler, boşsa yedek — app.ts ile birebir yapı). */
export function buildLikedHtml(ytRowsInner: string, localRowsInner: string): string {
  let html = '';
  if (ytRowsInner) {
    html += `<div style="margin-bottom:24px">`
      + `<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">YouTube Music Beğenilenler</h3>`
      + `<div class="song-list">${ytRowsInner}</div></div>`;
  }
  if (localRowsInner) {
    html += `<div>`
      + `<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Yerel Beğeniler</h3>`
      + `<div class="song-list">${localRowsInner}</div></div>`;
  }
  return html || LIKED_EMPTY_HTML;
}
