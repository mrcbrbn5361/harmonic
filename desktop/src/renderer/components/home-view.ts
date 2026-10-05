/* ============================================
   Harmonic - Home View (R-04/2, streaming-only)
   Ana sayfa loaderi — app.ts loadHome fonksiyonundan tasindi.
   Davranis birebir aynidir (skeleton -> fetchHome -> stale guard ->
   bos-items error+retry -> discover/song bolumleri -> kosullu
   enterContext -> wireRowEvents -> .card[data-browse] wiring ->
   catch dalinda error+retry). Debug console.log satirlari tasinmadi
   (davranis degil); system.ts dokunulmaz.
   Orkestrasyon (fetch/wire/context/browse/retry) DI ile enjekte
   edilir — app.ts ile home-view dongusuzlugu boyle korunur.
   ============================================ */

import { state, type Song } from './state';
import {
  CONTENT_ERROR_HTML,
  HOME_CARDS_LIMIT,
  HOME_QUEUE_LIMIT,
  HOME_SONGS_LIMIT,
  buildCardFor,
  buildDiscoverSection,
  buildSongSection,
  isStaleContent,
  partitionBrowseCards,
  partitionSongs,
  resolveHomeHtml,
  shouldInitHomeQueue,
  takeFirst,
  type BrowseItem,
  type IdItem,
} from './content';

/** loadHome fonksiyonunun app.ts orkestrasyonuna olan bagimliliklari. */
export interface HomeViewDeps {
  fetchHome: () => Promise<{ items?: Array<IdItem & BrowseItem> }>;
  renderRow: (song: Song, num?: number) => string;
  wireRowEvents: (container: HTMLElement) => void;
  enterContext: (songs: Song[], name: string, type: 'home') => void;
  openBrowse: (browseId: string, title: string, thumb: string) => void;
  retry: () => void;
}

/** Ana sayfa icerigini yukle + ciz + etkilesimleri bagla
 *  (app.ts loadHome ile birebir, debug loglari haric). */
export async function loadHome(deps: HomeViewDeps): Promise<void> {
  const gen = state.navGeneration;
  const container = document.querySelector('#homeContent') as HTMLElement;
  container.innerHTML =
    '<div class="skeleton-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';

  try {
    const data = await deps.fetchHome();
    if (isStaleContent(gen, state.navGeneration)) return; // stale, discard

    if (!data.items?.length) {
      container.innerHTML = CONTENT_ERROR_HTML;
      container.querySelector('.btn-retry')?.addEventListener('click', () => deps.retry());
      return;
    }

    const songs = partitionSongs(data.items) as Song[];
    const cards = partitionBrowseCards(data.items);

    let html = '';

    const topCards = takeFirst(cards, HOME_CARDS_LIMIT);
    if (topCards.length) {
      html += buildDiscoverSection(topCards.map((c: any) => buildCardFor(c, String(c.artist || ''))).join(''));
    }

    if (songs.length) {
      html += buildSongSection(
        'Önerilen Şarkılar',
        takeFirst(songs, HOME_SONGS_LIMIT).map((s: Song, i: number) => deps.renderRow(s, i + 1)).join(''),
      );
    }

    container.innerHTML = resolveHomeHtml(html);

    // Set queue from songs — sadece sarki calmiyorsa VE kuyruk bossa queue guncelle
    if (shouldInitHomeQueue(songs.length, !!state.currentSong, state.queue.length)) {
      deps.enterContext(takeFirst(songs, HOME_QUEUE_LIMIT), 'Önerilen Şarkılar', 'home');
    }

    deps.wireRowEvents(container);

    // Kartlara tiklama -> listenin icine gir
    container.querySelectorAll('.card[data-browse]').forEach((card) => {
      card.addEventListener('click', () => {
        const browseId = (card as HTMLElement).dataset.browse;
        const title = (card as HTMLElement).querySelector('.card-title')?.textContent || '';
        const thumb = (card as HTMLElement).querySelector('img')?.src || '';
        if (browseId) deps.openBrowse(browseId, title, thumb);
      });
    });
  } catch {
    container.innerHTML = CONTENT_ERROR_HTML;
    container.querySelector('.btn-retry')?.addEventListener('click', () => deps.retry());
  }
}
