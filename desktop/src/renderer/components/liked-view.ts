/* ============================================
   Harmonic - Liked View (R-04/4, streaming-only)
   Begenilenler loaderi — app.ts loadLiked fonksiyonundan tasindi.
   Davranis birebir aynidir (local likes + login-kosullu likedSongs
   -> ikinci stale kontrolu -> ytRows/localRows -> buildLikedHtml ->
   wireRowEvents). likedSongs throw ederse yerel-only devam edilir.
   system.ts dokunulmaz.
   Orkestrasyon DI ile enjekte edilir — app.ts dongusu yok.
   ============================================ */

import { buildLikedHtml } from './content';
import type { Song } from './state';

/** loadLiked fonksiyonunun app.ts orkestrasyonuna olan bagimliliklari. */
export interface LikedViewDeps {
  getGen: () => number;
  isStale: (gen: number) => boolean;
  isLoggedIn: () => boolean;
  fetchYtLiked: () => Promise<Song[]>;
  getLocalIds: () => string[];
  resolveLocal: (ids: readonly string[]) => Song[];
  renderRow: (song: Song, num?: number) => string;
  wireRowEvents: (container: HTMLElement, title: string, type: 'playlist') => void;
}

/** Begenilenler icerigini yukle + ciz + etkilesimleri bagla (app.ts loadLiked ile birebir). */
export async function loadLiked(deps: LikedViewDeps): Promise<void> {
  const gen = deps.getGen();
  const container = document.querySelector('#likedContent') as HTMLElement;

  // Yerel begenenler
  const localLikes = deps.getLocalIds();

  // YouTube Music begenilenler (giris yapildiysa)
  let ytLiked: Song[] = [];
  if (deps.isLoggedIn()) {
    try {
      ytLiked = await deps.fetchYtLiked();
    } catch {}
  }

  if (deps.isStale(gen)) return; // stale, discard

  const ytRows = ytLiked.length ? ytLiked.map((s, i) => deps.renderRow(s, i + 1)).join('') : '';

  // Yerel begenilenler
  const localSongs = deps.resolveLocal(localLikes);
  const localRows = localSongs.length ? localSongs.map((s, i) => deps.renderRow(s, i + 1)).join('') : '';

  container.innerHTML = buildLikedHtml(ytRows, localRows);
  deps.wireRowEvents(container, 'Beğenilen Şarkılar', 'playlist');
}
