/* ============================================
   Harmonic - Browse View (R-04/3, streaming-only)
   Browse loaderi — app.ts openBrowse fonksiyonundan tasindi.
   Davranis birebir aynidir (hedef container -> loading ->
   fetchBrowse -> songs/cards/empty dallari -> wireRowEvents ->
   back dali -> alt-kart wiring -> catch retry+back). Stale guard
   orijinalde yok — eklenmedi. system.ts dokunulmaz.
   Orkestrasyon DI ile enjekte edilir — app.ts dongusu yok.
   ============================================ */

import {
  BROWSE_EMPTY_HTML,
  BROWSE_ERROR_HTML,
  CONTENT_LOADING_HTML,
  buildBrowseCardsBody,
  buildBrowseHeader,
  buildBrowseSongsBody,
  buildCardFor,
  partitionBrowseCards,
  partitionSongs,
  resolveBrowseBack,
  resolveBrowseContainerId,
} from './content';
import type { Song } from './state';

/** fetchBrowse donus sekli (api.youtube.browse ile ayni). */
export interface BrowseData {
  items?: any[];
  title?: string;
}

/** openBrowse fonksiyonunun app.ts orkestrasyonuna olan bagimliliklari. */
export interface BrowseViewDeps {
  getPage: () => string;
  fetchBrowse: (browseId: string) => Promise<BrowseData>;
  renderRow: (song: Song, num?: number) => string;
  enterContext: (songs: Song[], name: string, type: 'playlist') => void;
  wireRowEvents: (container: HTMLElement, title: string, type: 'playlist') => void;
  openSub: (browseId: string, title?: string, thumb?: string, onBack?: () => void) => void;
  goSearch: (query: string) => void;
  goLibrary: () => void;
  goHome: () => void;
  getSearchQuery: () => string;
  retry: (browseId: string, title?: string, thumb?: string, onBack?: () => void) => void;
}

/** Browse icerigini yukle + ciz + etkilesimleri bagla (app.ts openBrowse ile birebir). */
export async function openBrowse(
  deps: BrowseViewDeps,
  browseId: string,
  fallbackTitle?: string,
  fallbackThumb?: string,
  onBack?: () => void,
): Promise<void> {
  const activePage = deps.getPage();
  const targetContainer = document.querySelector(`#${resolveBrowseContainerId(activePage)}`) as HTMLElement | null;
  if (!targetContainer) return;

  targetContainer.innerHTML = CONTENT_LOADING_HTML;
  try {
    const browseData = await deps.fetchBrowse(browseId);
    const items: any[] = browseData.items || [];
    const songs = partitionSongs(items) as Song[];
    const title = browseData.title || fallbackTitle || 'Liste';
    const thumb = fallbackThumb || '';

    let html = buildBrowseHeader(title, thumb, songs.length);

    if (songs.length) {
      html += buildBrowseSongsBody(songs.map((s, i) => deps.renderRow(s, i + 1)).join(''));
      deps.enterContext(songs, title, 'playlist');
    } else if (items.length) {
      const cards = partitionBrowseCards(items);
      html += buildBrowseCardsBody(cards.map((c: any) => buildCardFor(c, String(c.artist || ''))).join(''));
    } else {
      html += BROWSE_EMPTY_HTML;
    }

    targetContainer.innerHTML = html;
    deps.wireRowEvents(targetContainer, title, 'playlist');

    targetContainer.querySelector('#btnBrowseBack')?.addEventListener('click', () => {
      const backTarget = resolveBrowseBack(!!onBack, activePage);
      if (backTarget === 'callback') {
        onBack?.();
      } else if (backTarget === 'search') {
        const q = deps.getSearchQuery();
        if (q) deps.goSearch(q);
      } else if (backTarget === 'library') {
        deps.goLibrary();
      } else {
        deps.goHome();
      }
    });

    // Alt kartlara tiklandiginda kendi browseId'siyle acilsin (sonsuz dongu engellendi)
    targetContainer.querySelectorAll('.card[data-browse]').forEach((subCard) => {
      subCard.addEventListener('click', () => {
        const subId = (subCard as HTMLElement).dataset.browse;
        const subTitle = (subCard as HTMLElement).querySelector('.card-title')?.textContent || '';
        const subThumb = (subCard as HTMLElement).querySelector('img')?.src || '';
        if (subId) deps.openSub(subId, subTitle, subThumb, () => deps.openSub(browseId, title, thumb, onBack));
      });
    });
  } catch {
    targetContainer.innerHTML = BROWSE_ERROR_HTML;
    targetContainer.querySelector('#btnBrowseRetry')?.addEventListener('click', () => deps.retry(browseId, fallbackTitle, fallbackThumb, onBack));
    targetContainer.querySelector('#btnBrowseBack')?.addEventListener('click', () => {
      if (onBack) onBack();
      else deps.goHome();
    });
  }
}
