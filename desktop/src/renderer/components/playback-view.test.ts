/* ============================================
   Harmonic - Playback View Tests (R-03/R3)
   updatePlayIcon — Node ortamı: document vi.stubGlobal ile taklit edilir.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PlaybackView = typeof import('./playback-view');
type StateModule = typeof import('./state');

let playbackView: PlaybackView;
let stateModule: StateModule;
let playEl: { style: Record<string, string> };
let pauseEl: { style: Record<string, string> };

beforeEach(async () => {
  vi.resetModules();
  playEl = { style: {} as Record<string, string> };
  pauseEl = { style: {} as Record<string, string> };
  vi.stubGlobal('document', {
    querySelector: (sel: string) => {
      if (sel === '#btnPlay .icon-play') return playEl as unknown as HTMLElement;
      if (sel === '#btnPlay .icon-pause') return pauseEl as unknown as HTMLElement;
      return null;
    },
  });
  stateModule = await import('./state');
  playbackView = await import('./playback-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('updatePlayIcon', () => {
  it('çalarken play gizlenir, pause gösterilir', () => {
    stateModule.state.playing = true;

    playbackView.updatePlayIcon();

    expect(playEl.style.display).toBe('none');
    expect(pauseEl.style.display).toBe('block');
  });

  it('duraklatılmışken play gösterilir, pause gizlenir', () => {
    stateModule.state.playing = false;

    playbackView.updatePlayIcon();

    expect(playEl.style.display).toBe('block');
    expect(pauseEl.style.display).toBe('none');
  });
});
