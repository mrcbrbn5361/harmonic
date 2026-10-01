/* ============================================
   Harmonic - Search + Navigation Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz arama/sayfa-geçiş mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC (querySelector, api.*, playSong, setContext) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { Song, AppState } from './state';
import { escapeHtml } from './views';

/** setupSearch'teki debounce süresi (ms). */
export const SEARCH_DEBOUNCE_MS = 200;
/** Öneri göstermek için gereken en az karakter (trim'lenmiş). */
export const SEARCH_MIN_SUGGEST_LEN = 1;
/** Doğrudan sonuç araması için gereken en az karakter (trim'lenmiş). */
export const SEARCH_MIN_DIRECT_LEN = 2;

export type SearchFilter = AppState['searchFilter'];
export type NavLoader = 'home' | 'library' | 'liked';

export interface SearchResults {
  songs?: Song[];
  videos?: Song[];
  albums?: unknown[];
  artists?: unknown[];
}

/** input.value → trim'lenmiş sorgu (app.ts setupSearch ile birebir). */
export function normalizeQuery(raw: string): string {
  return raw.trim();
}

/** doSearch erken-çıkış guard'ı: boş/boşluk sorguda arama yapma. */
export function isEmptyQuery(query: string): boolean {
  return query.trim().length === 0;
}

/** Anlık arama tetikleme eşiği: 1 karakterden itibaren öneri + debounce. */
export function shouldSuggestSearch(trimmed: string): boolean {
  return trimmed.length >= SEARCH_MIN_SUGGEST_LEN;
}

/** Aynı debounce içinde doğrudan sonuç gösterme eşiği: 2+ karakter. */
export function shouldDirectSearch(trimmed: string): boolean {
  return trimmed.length >= SEARCH_MIN_DIRECT_LEN;
}

/** Input temizlendiğinde sonuç alanını sıfırlama kararı. */
export function shouldClearOnEmpty(trimmed: string): boolean {
  return trimmed.length === 0;
}

/** doSearch istek sayacı: ++activeSearchId ile birebir. */
export function nextSearchId(activeId: number): number {
  return activeId + 1;
}

/** Stale yanıt guard'ı: eski istek yeni sorguyu ezemez. */
export function isStaleSearch(requestId: number, activeId: number): boolean {
  return requestId !== activeId;
}

/** Tıklama önbelleği: şarkılar + videolar (albümler tıklanabilir değil). */
export function buildSearchCache(results: SearchResults): Song[] {
  return [...(results.songs ?? []), ...(results.videos ?? [])];
}

/** Boş-sonuç guard'ı (app.ts: songs/videos/albums ile birebir, artists sayılmaz). */
export function hasAnyResults(results: SearchResults): boolean {
  return Boolean(results.songs?.length || results.videos?.length || results.albums?.length);
}

/** Chip filtresi bölüm görünürlüğü: 'all' her şeyi açar. */
export function isSearchSectionVisible(
  filter: SearchFilter,
  section: Exclude<SearchFilter, 'all'>,
): boolean {
  return filter === 'all' || filter === section;
}

/** Chip dataset → güvenli filtre (boş/bilinmeyen → 'all'). */
export function normalizeSearchFilter(raw: string | null | undefined): SearchFilter {
  if (raw === 'all' || raw === 'songs' || raw === 'videos' || raw === 'albums' || raw === 'artists') {
    return raw;
  }
  return 'all';
}

/** navigateTo yükleyici kararı: bilinmeyen sayfa → null (yükleme yok). */
export function resolveNavLoader(page: string): NavLoader | null {
  if (page === 'home') return 'home';
  if (page === 'library') return 'library';
  if (page === 'liked') return 'liked';
  return null;
}

/** navigateTo sayacı: state.navGeneration++ ile birebir. */
export function nextNavGeneration(gen: number): number {
  return gen + 1;
}

export interface AlbumCardInput {
  browseId?: string;
  title?: string;
  thumbnail?: string;
  artist?: string;
}

export interface ArtistCardInput {
  browseId?: string;
  name?: string;
  thumbnail?: string;
}

/** setupSearch öneri listesi HTML'i (app.ts dropdown.innerHTML ile birebir). */
export function buildSuggestionListHtml(suggestions: string[]): string {
  return suggestions.map((s: string) =>
    `<div class="suggestion-item" data-q="${escapeHtml(s)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>${escapeHtml(s)}</span>
              </div>`
  ).join('');
}

/** Arama boş-durum HTML'i (setupSearch input-temizleme + clear-butonu ile birebir). */
export function buildSearchEmptyHtml(): string {
  return `
            <div class="empty-state">
              <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
              <p class="empty-text">Müzik aramaya başlayın</p>
              <p class="empty-hint-text">Sanatçı, şarkı veya albüm adı yazın</p>
            </div>`;
}

/** doSearch yükleniyor HTML'i (container.innerHTML ile birebir). */
export function buildSearchLoadingHtml(): string {
  return '<div class="empty-state"><p class="empty-hint-text">Aranıyor...</p></div>';
}

/** doSearch boş-sonuç HTML'i (erken-dönüş + html|| fallback ile birebir). */
export function buildSearchNoResultsHtml(): string {
  return '<div class="empty-state"><p class="empty-text">Sonuç bulunamadı</p></div>';
}

/** doSearch hata HTML'i (catch bloğu ile birebir). */
export function buildSearchErrorHtml(): string {
  return '<div class="empty-state"><p class="empty-text">Arama yapılırken bir hata oluştu</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
}

/** Tek albüm kartı HTML'i (doSearch albümler bölümü ile birebir). */
export function buildAlbumCardHtml(a: AlbumCardInput): string {
  return `
          <div class="card" data-browse="${escapeHtml(a.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(a.title)}</div>
            <div class="card-sub">${escapeHtml(a.artist || '')}</div>
          </div>`;
}

/** Tek sanatçı kartı HTML'i (doSearch sanatçılar bölümü ile birebir). */
export function buildArtistCardHtml(a: ArtistCardInput): string {
  return `
          <div class="card" data-browse="${escapeHtml(a.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(a.name)}</div>
          </div>`;
}

/** Albümler bölümü sarmalayıcısı (doSearch Albümler bloğu ile birebir). */
export function buildAlbumsSectionHtml(albums: AlbumCardInput[]): string {
  return `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">Albümler</h3><div class="card-grid">${albums.map((a) => buildAlbumCardHtml(a)).join('')}</div></div>`;
}

/** Sanatçılar bölümü sarmalayıcısı (doSearch Sanatçılar bloğu ile birebir). */
export function buildArtistsSectionHtml(artists: ArtistCardInput[]): string {
  return `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">Sanatçılar</h3><div class="card-grid">${artists.map((a) => buildArtistCardHtml(a)).join('')}</div></div>`;
}

export interface SearchSectionVisibility {
  songs: boolean;
  videos: boolean;
  albums: boolean;
  artists: boolean;
}

/** doSearch bölüm dalları: sonuç-varlığı + chip filtresi (app.ts if'leri ile birebir). */
export function resolveSearchSections(results: SearchResults, filter: SearchFilter): SearchSectionVisibility {
  return {
    songs: Boolean(results.songs?.length && isSearchSectionVisible(filter, 'songs')),
    videos: Boolean(results.videos?.length && isSearchSectionVisible(filter, 'videos')),
    albums: Boolean(results.albums?.length && isSearchSectionVisible(filter, 'albums')),
    artists: Boolean(results.artists?.length && isSearchSectionVisible(filter, 'artists')),
  };
}
