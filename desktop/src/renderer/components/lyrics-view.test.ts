/* ============================================
   Harmonic - Lyrics View Tests (R-03/R1)
   cacheLyricsToBotServer + loadLyrics + syncActiveLyric
   Node ortamı: document vi.stubGlobal ile taklit edilir.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApi } from './api-client';

function makeBodyEl() {
  return {
    innerHTML: '',
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => [] as unknown[]),
    addEventListener: vi.fn(),
    classList: { toggle: vi.fn() },
    dataset: {} as Record<string, string | undefined>,
    scrollIntoView: vi.fn(),
  };
}

type LyricsView = typeof import('./lyrics-view');
type StateModule = typeof import('./state');

let lyricsView: LyricsView;
let stateModule: StateModule;
let mockApi: Record<string, any>;
let bodyEl: ReturnType<typeof makeBodyEl>;

beforeEach(async () => {
  vi.resetModules();
  bodyEl = makeBodyEl();
  vi.stubGlobal('document', {
    querySelector: (sel: string) =>
      sel === '#lyricsBody' ? (bodyEl as unknown as HTMLElement) : null,
  });
  const apiClient = await import('./api-client');
  mockApi = {
    botServer: { updateState: vi.fn().mockResolvedValue(undefined) },
    player: { seek: vi.fn().mockResolvedValue(undefined) },
    youtube: { lyrics: vi.fn().mockResolvedValue(null) },
  };
  apiClient.setApi(mockApi);
  stateModule = await import('./state');
  lyricsView = await import('./lyrics-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeSong = (id: string) => ({
  id,
  title: 'Test Song',
  artist: 'Test Artist',
  artistId: 'a1',
  thumbnail: 't.jpg',
  duration: 10,
});

function makeLineEl(time?: string) {
  return {
    addEventListener: vi.fn(),
    classList: { toggle: vi.fn() },
    dataset: { time: time ?? '1.5' } as Record<string, string | undefined>,
    scrollIntoView: vi.fn(),
  };
}

describe('cacheLyricsToBotServer', () => {
  it('eşleşen parçada önbelleği yazar ve bot sunucusuna besler', () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = null;

    lyricsView.cacheLyricsToBotServer('s1', 'yeni sözler');

    expect(stateModule.state.currentLyrics).toBe('yeni sözler');
    expect(mockApi.botServer.updateState).toHaveBeenCalledWith({ lyrics: 'yeni sözler' });
  });

  it('stale parçada önbelleğe dokunmaz ve beslemez', () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = 'eski';

    lyricsView.cacheLyricsToBotServer('baska-parca', 'yeni sözler');

    expect(stateModule.state.currentLyrics).toBe('eski');
    expect(mockApi.botServer.updateState).not.toHaveBeenCalled();
  });

  it('null sözlerde önbelleği null yapar ve lyrics: undefined besler', () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = 'eski';

    lyricsView.cacheLyricsToBotServer('s1', null);

    expect(stateModule.state.currentLyrics).toBeNull();
    expect(mockApi.botServer.updateState).toHaveBeenCalledWith({ lyrics: undefined });
  });

  it('bot sunucusu yokken yalnızca önbelleği yazar, throw etmez', () => {
    delete mockApi.botServer;
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = null;

    expect(() => lyricsView.cacheLyricsToBotServer('s1', 'sözler')).not.toThrow();
    expect(stateModule.state.currentLyrics).toBe('sözler');
  });
});

describe('loadLyrics', () => {
  it('currentSong yokken erken döner, fetch yapmaz', async () => {
    stateModule.state.currentSong = null;

    await lyricsView.loadLyrics();

    expect(mockApi.youtube.lyrics).not.toHaveBeenCalled();
  });

  it('önbellekte söz varsa anında render eder, fetch yapmaz', async () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = '[00:01.00] Merhaba';
    stateModule.state.panelOpen = null;

    await lyricsView.loadLyrics();

    expect(mockApi.youtube.lyrics).not.toHaveBeenCalled();
    expect(bodyEl.innerHTML).toContain('Merhaba');
  });

  it('fetch başarılıysa önbelleğe yazar, besler ve render eder', async () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = null;
    mockApi.youtube.lyrics.mockResolvedValue('[00:01.00] Merhaba');

    await lyricsView.loadLyrics();

    expect(mockApi.youtube.lyrics).toHaveBeenCalledWith('s1', 'Test Song', 'Test Artist', 10);
    expect(stateModule.state.currentLyrics).toBe('[00:01.00] Merhaba');
    expect(mockApi.botServer.updateState).toHaveBeenCalledWith({ lyrics: '[00:01.00] Merhaba' });
    expect(bodyEl.innerHTML).toContain('Merhaba');
  });

  it('fetch yanıtına kadar parça değiştiyse sonucu atar', async () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = null;
    mockApi.youtube.lyrics.mockResolvedValue('[00:01.00] Merhaba');

    const pending = lyricsView.loadLyrics();
    stateModule.state.currentSong = makeSong('s2');
    await pending;

    expect(stateModule.state.currentLyrics).toBeNull();
    expect(bodyEl.innerHTML).toBe(lyricsView.LYRICS_LOADING_HTML);
  });

  it('söz bulunamazsa not-found yedeğini yazar, retry yeniden fetch yapar', async () => {    const retryEl = makeBodyEl();
    bodyEl.querySelector = vi.fn((sel: string) =>
      sel === '.btn-retry' ? (retryEl as unknown as HTMLElement) : null
    );
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = null;

    await lyricsView.loadLyrics();

    expect(bodyEl.innerHTML).toBe(lyricsView.LYRICS_NOT_FOUND_HTML);
    const retryHandler = retryEl.addEventListener.mock.calls.find(
      (c) => c[0] === 'click'
    )?.[1] as () => void;
    expect(retryHandler).toBeDefined();
    retryHandler();

    expect(stateModule.state.currentLyrics).toBeUndefined();
    expect(mockApi.youtube.lyrics).toHaveBeenCalledTimes(2);
  });

  it('bot sunucusu erişimi patlarsa hata yedeğini yazar ve retry dinleyicisi ekler', async () => {
    mockApi.botServer = new Proxy({}, { get() { throw new Error('bot boom'); } });
    const retryEl = makeBodyEl();
    bodyEl.querySelector = vi.fn((sel: string) =>
      sel === '.btn-retry' ? (retryEl as unknown as HTMLElement) : null
    );
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = null;
    mockApi.youtube.lyrics.mockResolvedValue('[00:01.00] Merhaba');

    await lyricsView.loadLyrics();

    expect(bodyEl.innerHTML).toBe(lyricsView.LYRICS_ERROR_HTML);
    const retryHandler = retryEl.addEventListener.mock.calls.find(
      (c) => c[0] === 'click'
    )?.[1] as () => void;
    expect(retryHandler).toBeDefined();
    retryHandler();

    expect(stateModule.state.currentLyrics).toBeUndefined();
    expect(mockApi.youtube.lyrics).toHaveBeenCalledTimes(2);
  });

  it('synced satır tıklaması doğru sürede seek yapar', async () => {
    const line = makeLineEl('2.5');
    bodyEl.querySelectorAll = vi.fn(() => [line] as unknown as NodeListOf<Element>);
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = '[00:02.50] Merhaba';
    stateModule.state.panelOpen = null;

    await lyricsView.loadLyrics();

    const clickHandler = line.addEventListener.mock.calls.find(
      (c) => c[0] === 'click'
    )?.[1] as () => void;
    expect(clickHandler).toBeDefined();
    clickHandler();

    expect(mockApi.player.seek).toHaveBeenCalledWith(2.5);
  });
});

describe('syncActiveLyric', () => {
  it('panel açıksa aktif satırı işaretler ve bot sunucusuna anlık satırı aktarır', async () => {
    const lines = [makeLineEl(), makeLineEl()];
    bodyEl.querySelectorAll = vi.fn(() => lines as unknown as NodeListOf<Element>);
    bodyEl.querySelector = vi.fn((sel: string) =>
      sel === '.lyric-line.synced[data-idx="0"]' ? (lines[0] as unknown as HTMLElement) : null
    );
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.currentLyrics = '[00:01.00] Merhaba\n[00:02.00] Dunya';
    stateModule.state.panelOpen = null;

    await lyricsView.loadLyrics();

    stateModule.state.panelOpen = 'lyrics';
    stateModule.state.currentTime = 1.5;
    lyricsView.syncActiveLyric(1.5);

    expect(lines[0].classList.toggle).toHaveBeenCalledWith('active', true);
    expect(lines[1].classList.toggle).toHaveBeenCalledWith('active', false);
    expect(lines[0].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(mockApi.botServer.updateState).toHaveBeenCalledWith({ currentLyricLine: 'Merhaba' });
  });

  it('panel kapalıysa dokunmaz', () => {
    stateModule.state.panelOpen = null;

    lyricsView.syncActiveLyric(1.5);

    expect(bodyEl.querySelectorAll).not.toHaveBeenCalled();
    expect(mockApi.botServer.updateState).not.toHaveBeenCalled();
  });
});
