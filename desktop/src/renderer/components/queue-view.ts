/* ============================================
   Harmonic - Queue View (R-04/1, streaming-only)
   Kuyruk paneli görünüm bağları — app.ts'ten taşındı.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır
   (renderQueue: #queueBody HTML + #clearUserQueue/.queue-item wiring).
   Saf kararlar views.ts/panels.ts'tedir (getUpcomingContext/
   buildQueueHtml/queueIndexAfterUserPick/resolveContextQueuePick);
   orkestrasyon (clearUserQueue/playSong) DI ile enjekte edilir —
   app.ts ↔ queue-view döngüsüzlüğü böyle korunur.
   system.ts dokunulmaz; offline/download kapsam dışıdır.
   ============================================ */

import { state, rebuildMergedQueue, type QueueItem } from './state';
import { getUpcomingContext } from './views';
import {
  buildQueueHtml,
  queueIndexAfterUserPick,
  resolveContextQueuePick,
} from './panels';

/** renderQueue'un app.ts orkestrasyonuna olan tek bağımlılığı. */
export interface QueueViewDeps {
  clearUserQueue: () => void;
  playSong: (song: QueueItem) => void;
}

/** Kuyruk panelini çiz + satır/temizle etkileşimlerini bağla
 *  (app.ts renderQueue ile birebir). */
export function renderQueue(deps: QueueViewDeps): void {
  const body = document.querySelector('#queueBody') as HTMLElement;
  const contextLabel = state.contextName || 'Bağlam';
  const upcomingCtx = getUpcomingContext(state.contextQueue, state.currentSong?.id);
  body.innerHTML = buildQueueHtml(
    state.userQueue,
    state.contextQueue.length,
    upcomingCtx,
    contextLabel,
  );

  // Clear user queue
  const clearBtn = body.querySelector('#clearUserQueue');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      deps.clearUserQueue();
      renderQueue(deps);
    });
  }

  // Queue item click
  body.querySelectorAll('.queue-item').forEach((item) => {
    item.addEventListener('click', () => {
      const type = (item as HTMLElement).dataset.type;
      const idx = parseInt((item as HTMLElement).dataset.idx!);
      if (type === 'user') {
        const song = state.userQueue[idx];
        if (song) {
          // Kullanıcı queue'sundan seçildi → tüket, sonraki kaldığı yerden devam etsin
          state.userQueue.splice(idx, 1);
          state.queue = rebuildMergedQueue();
          state.queueIndex = queueIndexAfterUserPick(idx);
          deps.playSong(song);
        }
      } else if (type === 'context') {
        // idx dilimlenmiş upcomingCtx'e ait — tam dizinden değil dilimden oku
        const song = resolveContextQueuePick(
          getUpcomingContext(state.contextQueue, state.currentSong?.id),
          idx,
        );
        if (song) {
          state.queueIndex = state.queue.findIndex((s) => s.id === song.id);
          deps.playSong(song);
        }
      }
      renderQueue(deps);
    });
  });
}
