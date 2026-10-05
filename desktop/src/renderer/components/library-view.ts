/* ============================================
   Harmonic - Library View (R-04/5, streaming-only)
   Kutuphane loaderi — app.ts loadLibrary fonksiyonundan tasindi.
   Davranis birebir aynidir (loading -> yerel recent + login-kosullu
   3'lu Promise.all (call-basi .catch + dis try/catch) -> stale discard
   -> normalizeLibraryTab + 5 section guard'i -> resolveLibraryEmpty
   3 kolu (content/error+retry/empty) -> wireRowEvents ->
   .card[data-local-pl] -> openLocalPlaylist ->
   .card[data-browse] -> playLibraryBrowse). Inline browse-play
   govdesi playLibraryBrowse dep'ine tasindi (playSong/setContext
   app.ts closure'inda kalir).
   system.ts dokunulmaz.
   Orkestrasyon DI ile enjekte edilir — app.ts dongusu yok.
   ============================================ */

import {
  RECENT_SONGS_LIMIT,
  CONTENT_LOADING_HTML,
  LIBRARY_ERROR_HTML,
  LIBRARY_EMPTY_HTML,
  takeFirst,
  buildSongSection,
  buildLibraryLocalPlaylistsSection,
  buildLibraryYtPlaylistsSection,
  buildLibraryAlbumsSection,
  buildLibraryArtistsSection,
  normalizeLibraryTab,
  shouldShowRecentSection,
  shouldShowPlaylistSection,
  shouldShowAlbumSection,
  shouldShowArtistsSection,
  resolveLibraryEmpty,
} from './content';
import type { CardSource } from './content';
import type { Song } from './state';
import type { LocalPlaylist } from './system';

/** loadLibrary fonksiyonunun app.ts orkestrasyonuna olan bagimliliklari. */
export interface LibraryViewDeps {
  getGen: () => number;
  isStale: (gen: number) => boolean;
  isLoggedIn: () => boolean;
  getRecent: () => Song[];
  fetchPlaylists: () => Promise<CardSource[]>;
  fetchArtists: () => Promise<CardSource[]>;
  fetchAlbums: () => Promise<CardSource[]>;
  fetchLocalPlaylists: () => Promise<LocalPlaylist[] | null>;
  getTab: () => unknown;
  renderRow: (song: Song, num?: number) => string;
  wireRowEvents: (container: HTMLElement) => void;
  openLocalPlaylist: (plId: string) => void;
  playLibraryBrowse: (browseId: string) => Promise<void>;
  retry: () => void;
}

/** Kutuphane icerigini yukle + ciz + etkilesimleri bagla (app.ts loadLibrary ile birebir). */
export async function loadLibrary(deps: LibraryViewDeps): Promise<void> {
  const gen = deps.getGen();
  const container = document.querySelector('#libraryContent') as HTMLElement;
  container.innerHTML = CONTENT_LOADING_HTML;

  // Yerel olarak dinlenenler
  const localRecent = deps.getRecent();

  // YouTube Music kutuphanesi (giris yapildiysa)
  let ytPlaylists: CardSource[] = [];
  let ytArtists: CardSource[] = [];
  let ytAlbums: CardSource[] = [];

  let libraryLoadError = false;
  if (deps.isLoggedIn()) {
    try {
      [ytPlaylists, ytArtists, ytAlbums] = await Promise.all([
        deps.fetchPlaylists().catch(() => { libraryLoadError = true; return []; }),
        deps.fetchArtists().catch(() => { libraryLoadError = true; return []; }),
        deps.fetchAlbums().catch(() => { libraryLoadError = true; return []; }),
      ]);
    } catch {
      libraryLoadError = true;
    }
  }

  if (deps.isStale(gen)) return; // stale, discard

  let html = '';
  const tab = normalizeLibraryTab(deps.getTab());

  // 1. Son Calinanlar
  if (shouldShowRecentSection(tab)) {
    if (localRecent.length) {
      html += buildSongSection(tab === 'recent' ? 'Son Çalınanlar' : 'Kütüphane Şarkıları', takeFirst(localRecent, RECENT_SONGS_LIMIT).map((s, i) => deps.renderRow(s, i + 1)).join(''));
    }
  }

  // 2. Calma Listeleri
  if (shouldShowPlaylistSection(tab)) {
    const localPlaylists = (await deps.fetchLocalPlaylists()) || [];
    if (localPlaylists.length) {
      html += buildLibraryLocalPlaylistsSection(localPlaylists);
    }

    if (ytPlaylists.length) {
      html += buildLibraryYtPlaylistsSection(ytPlaylists);
    }
  }

  // 3. Albumler
  if (shouldShowAlbumSection(tab)) {
    if (ytAlbums.length) {
      html += buildLibraryAlbumsSection(ytAlbums);
    }
  }

  // Sanatcilar (genel kutuphanede veya albumler/listeler yokken destekleyici)
  if (shouldShowArtistsSection(ytArtists.length, tab)) {
    html += buildLibraryArtistsSection(ytArtists);
  }

  const libraryEmptyKind = resolveLibraryEmpty(!!html, libraryLoadError, deps.isLoggedIn());
  if (libraryEmptyKind !== 'content') {
    container.innerHTML = libraryEmptyKind === 'error' ? LIBRARY_ERROR_HTML : LIBRARY_EMPTY_HTML;
    if (libraryEmptyKind === 'error') {
      container.querySelector('.btn-retry')?.addEventListener('click', () => deps.retry());
    }
    return;
  }

  container.innerHTML = html;
  deps.wireRowEvents(container);

  // Ozel liste kartlarina tiklama
  container.querySelectorAll('.card[data-local-pl]').forEach((card) => {
    card.addEventListener('click', () => {
      const plId = (card as HTMLElement).dataset.localPl;
      if (plId) deps.openLocalPlaylist(plId);
    });
  });

  // YouTube kartlarina tiklama
  container.querySelectorAll('.card[data-browse]').forEach((card) => {
    card.addEventListener('click', async () => {
      const browseId = (card as HTMLElement).dataset.browse;
      if (!browseId) return;
      await deps.playLibraryBrowse(browseId);
    });
  });
}
