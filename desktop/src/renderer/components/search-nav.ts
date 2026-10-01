/* ============================================
   Harmonic - Search + Navigation Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz arama/sayfa-geçiş mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   DOM/IPC (querySelector, api.*, playSong, setContext) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import type { Song, AppState } from './state';

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
