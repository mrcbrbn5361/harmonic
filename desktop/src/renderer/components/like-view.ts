/* ============================================
   Harmonic - Like View (R-03/R2, streaming-only)
   Beğeni görünüm bağları — app.ts'ten taşındı.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır
   (saveLiked / updateLikeBtn / .like-btn senkronu).
   Saf kararlar transport.ts'tedir (likeFill/applyLikeToggle);
   orkestrasyon (findSong/registry/loadLiked) app.ts'te kalır.
   system.ts dokunulmaz; offline/download kapsam dışıdır.
   ============================================ */

import { state } from './state';
import { api } from './api-client';
import { likeFill } from './transport';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

/** Beğenileri kalıcı depoya yaz (app.ts saveLiked ile birebir). */
export function saveLiked(): void {
  api.store.set('likedSongs', Array.from(state.liked));
  api.store.set('likedSongsDetails', state.likedSongsMap);
}

/** Ana oynatıcıdaki #btnLike durumunu tazele (app.ts updateLikeBtn ile birebir). */
export function updateLikeBtn(): void {
  if (!state.currentSong) return;
  const btn = $('#btnLike');
  const liked = state.liked.has(state.currentSong.id);
  btn.classList.toggle('active', liked);
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', likeFill(liked));
}

/** Listedeki tüm .like-btn düğmelerini parça için senkronla
 *  (app.ts toggleLike içindeki forEach ile birebir). */
export function syncLikeButtons(id: string): void {
  const liked = state.liked.has(id);
  document.querySelectorAll('.like-btn').forEach((btn) => {
    if ((btn as HTMLElement).dataset.id === id) {
      btn.classList.toggle('active', liked);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', likeFill(liked));
    }
  });
}
