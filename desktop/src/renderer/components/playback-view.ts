/* ============================================
   Harmonic - Playback View (R-03/R3, streaming-only)
   Oynatma görünüm bağları — app.ts'ten taşındı.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır
   (updatePlayIcon: #btnPlay .icon-play/.icon-pause görünürlüğü).
   Saf karar transport.ts'tedir (playIconVisibility);
   orkestrasyon (playSong/poll/togglePlay) app.ts'te kalır.
   system.ts dokunulmaz; offline/download kapsam dışıdır.
   ============================================ */

import { state } from './state';
import { playIconVisibility } from './transport';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

/** Oynat/duraklat ikon görünürlüğünü tazele (app.ts updatePlayIcon ile birebir). */
export function updatePlayIcon(): void {
  const playIcon = $('#btnPlay .icon-play') as HTMLElement;
  const pauseIcon = $('#btnPlay .icon-pause') as HTMLElement;
  const vis = playIconVisibility(state.playing);
  playIcon.style.display = vis.play;
  pauseIcon.style.display = vis.pause;
}
