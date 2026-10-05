/* ============================================
   Harmonic - Library View Tests (R-04/5)
   loadLibrary — Node ortami: document vi.stubGlobal ile taklit edilir.
   Orkestrasyon (gen/recent/login/fetch/tab/render/wire/open/play/retry)
   mock deps ile enjekte edilir. Desen: liked-view.test.ts.
   10 test: %100 branch icin 3'lu .catch callback'leri + dis catch +
   fetchLocalPlaylists || [] iki yani + tab ternary iki yani +
   album bos/dolu ayri testlerde kapatilir.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_EMPTY_HTML, LIBRARY_ERROR_HTML } from './content';

type LibraryView = typeof import('./library-view');

let libraryView: LibraryView;

let htmlWrites: string[];
let retryHandler: (() => void) | null;
let localPlCards: FakeCard[];
let browseCards: FakeCard[];
let container: Record<string, unknown>;
let deps: {
  getGen: ReturnType<typeof vi.fn>;
  isStale: ReturnType<typeof vi.fn>;
  isLoggedIn: ReturnType<typeof vi.fn>;
  getRecent: ReturnType<typeof vi.fn>;
  fetchPlaylists: ReturnType<typeof vi.fn>;
  fetchArtists: ReturnType<typeof vi.fn>;
  fetchAlbums: ReturnType<typeof vi.fn>;
  fetchLocalPlaylists: ReturnType<typeof vi.fn>;
  getTab: ReturnType<typeof vi.fn>;
  renderRow: ReturnType<typeof vi.fn>;
  wireRowEvents: ReturnType<typeof vi.fn>;
  openLocalPlaylist: ReturnType<typeof vi.fn>;
  playLibraryBrowse: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

const song = (id: string) => ({ id, title: 'T' + id, artist: 'A' + id });
const card = (browseId: string) => ({ browseId, title: 'C' + browseId, thumbnail: 't' + browseId });

interface FakeCard {
  dataset: Record<string, string | undefined>;
  handlers: Array<() => unknown>;
  addEventListener: (ev: string, fn: () => unknown) => void;
}

function makeCard(dataset: Record<string, string | undefined>): FakeCard {
  const c: FakeCard = {
    dataset,
    handlers: [],
    addEventListener: (_ev: string, fn: () => unknown) => {
      c.handlers.push(fn);
    },
  };
  return c;
}

const lastHtml = () => htmlWrites[htmlWrites.length - 1] ?? '';

beforeEach(async () => {
  vi.resetModules();
  htmlWrites = [];
  retryHandler = null;
  localPlCards = [];
  browseCards = [];
  deps = {
    getGen: vi.fn(() => 7),
    isStale: vi.fn(() => false),
    isLoggedIn: vi.fn(() => false),
    getRecent: vi.fn(() => [] as unknown[]),
    fetchPlaylists: vi.fn(async () => []),
    fetchArtists: vi.fn(async () => []),
    fetchAlbums: vi.fn(async () => []),
    fetchLocalPlaylists: vi.fn(async () => []),
    getTab: vi.fn(() => 'recent'),
    renderRow: vi.fn((s: { id: string }, n?: number) => '<div class="song-row" data-id="' + s.id + '">' + String(n) + '</div>'),
    wireRowEvents: vi.fn(),
    openLocalPlaylist: vi.fn(),
    playLibraryBrowse: vi.fn(async () => {}),
    retry: vi.fn(),
  };
  const retryBtn = {
    addEventListener: (_ev: string, fn: () => void) => {
      retryHandler = fn;
    },
  };
  container = {
    querySelector: (sel: string) => (sel === '.btn-retry' ? (retryBtn as unknown as Element) : null),
    querySelectorAll: (sel: string) => {
      if (sel === '.card[data-local-pl]') return localPlCards as unknown as NodeList;
      if (sel === '.card[data-browse]') return browseCards as unknown as NodeList;
      return [] as unknown as NodeList;
    },
  };
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => lastHtml(),
    set: (v: string) => {
      htmlWrites.push(v);
    },
  });
  vi.stubGlobal('document', {
    querySelector: (sel: string) => (sel === '#libraryContent' ? (container as unknown as Element) : null),
  });
  libraryView = await import('./library-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLibrary', () => {
  it('stale gen ise fetch sonrasi erken doner (cizim/wiring yok)', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.fetchPlaylists.mockResolvedValue([card('p1')]);
    deps.isStale.mockReturnValue(true);

    await libraryView.loadLibrary(deps);

    expect(deps.getGen).toHaveBeenCalled();
    expect(deps.fetchPlaylists).toHaveBeenCalled();
    expect(deps.isStale).toHaveBeenCalledWith(7);
    // loading yazisi disinda cizim yok
    expect(htmlWrites).toHaveLength(1);
    expect(deps.wireRowEvents).not.toHaveBeenCalled();
  });

  it('login-disiyken fetch yapmaz, recent sarkilari cizer + wiring yapar', async () => {
    deps.isLoggedIn.mockReturnValue(false);
    deps.getRecent.mockReturnValue([song('r1'), song('r2')]);
    deps.getTab.mockReturnValue('recent');

    await libraryView.loadLibrary(deps);

    expect(deps.fetchPlaylists).not.toHaveBeenCalled();
    expect(deps.fetchArtists).not.toHaveBeenCalled();
    expect(deps.fetchAlbums).not.toHaveBeenCalled();
    expect(deps.renderRow).toHaveBeenCalledTimes(2);
    expect(lastHtml()).toContain('Son Çalınanlar');
    expect(lastHtml()).toContain('song-row');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container);
  });

  it('3 fetch de reddedilirse error gorunumu + retry calisir', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.fetchPlaylists.mockRejectedValue(new Error('x'));
    deps.fetchArtists.mockRejectedValue(new Error('y'));
    deps.fetchAlbums.mockRejectedValue(new Error('z'));
    deps.getRecent.mockReturnValue([]);
    deps.getTab.mockReturnValue('playlists');
    deps.fetchLocalPlaylists.mockResolvedValue([]);

    await libraryView.loadLibrary(deps);

    expect(lastHtml()).toBe(LIBRARY_ERROR_HTML);
    expect(retryHandler).not.toBeNull();
    retryHandler?.();
    expect(deps.retry).toHaveBeenCalledTimes(1);
    expect(deps.wireRowEvents).not.toHaveBeenCalled();
  });

  it('fetch senkron firlatirsa dis catch bayragi error gorunumu cizer', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.fetchPlaylists.mockImplementation(() => {
      throw new Error('sync');
    });
    deps.getRecent.mockReturnValue([]);
    deps.getTab.mockReturnValue('playlists');
    deps.fetchLocalPlaylists.mockResolvedValue([]);

    await libraryView.loadLibrary(deps);

    expect(lastHtml()).toBe(LIBRARY_ERROR_HTML);
    expect(retryHandler).not.toBeNull();
  });

  it('hic icerik yoksa bos gorunum cizer (retry yok)', async () => {
    deps.isLoggedIn.mockReturnValue(false);
    deps.getRecent.mockReturnValue([]);
    deps.getTab.mockReturnValue('recent');

    await libraryView.loadLibrary(deps);

    expect(lastHtml()).toBe(LIBRARY_EMPTY_HTML);
    expect(retryHandler).toBeNull();
    expect(deps.wireRowEvents).not.toHaveBeenCalled();
  });

  it('playlists sekmesi: yerel + yt listeler + local-pl click calisir, idsiz kart sessiz', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.getRecent.mockReturnValue([song('r1')]);
    deps.getTab.mockReturnValue('playlists');
    deps.fetchLocalPlaylists.mockResolvedValue([{ id: 'pl1', name: 'Benim', songs: [] }]);
    deps.fetchPlaylists.mockResolvedValue([card('yt1')]);
    localPlCards = [makeCard({ localPl: 'pl1' }), makeCard({ localPl: undefined })];

    await libraryView.loadLibrary(deps);

    // recent tab degil: sarki satiri yok, iki liste bolumu var
    expect(deps.renderRow).not.toHaveBeenCalled();
    expect(lastHtml()).toContain('Özel Listelerim');
    expect(lastHtml()).toContain('YouTube Music Listeleri');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container);
    await localPlCards[0].handlers[0]();
    expect(deps.openLocalPlaylist).toHaveBeenCalledWith('pl1');
    await localPlCards[1].handlers[0]();
    expect(deps.openLocalPlaylist).toHaveBeenCalledTimes(1);
  });

  it('albums sekmesi: album + sanatci, recent gizli', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.getRecent.mockReturnValue([song('r1')]);
    deps.getTab.mockReturnValue('albums');
    deps.fetchAlbums.mockResolvedValue([{ browseId: 'a1', title: 'A1', thumbnail: 't', artist: 'Ar1' }]);
    deps.fetchArtists.mockResolvedValue([{ browseId: 'ar1', title: 'Ar1', thumbnail: 't', name: 'Ar1' }]);

    await libraryView.loadLibrary(deps);

    expect(deps.renderRow).not.toHaveBeenCalled();
    expect(lastHtml()).toContain('Albümler');
    expect(lastHtml()).toContain('Sanatçılar');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container);
  });

  it('browse click playLibraryBrowse cagirir; yerel liste null + idsiz browse sessiz', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.getRecent.mockReturnValue([]);
    deps.getTab.mockReturnValue('playlists');
    deps.fetchLocalPlaylists.mockResolvedValue(null);
    deps.fetchPlaylists.mockResolvedValue([card('yt1')]);
    browseCards = [makeCard({ browse: 'b1' }), makeCard({ browse: undefined })];

    await libraryView.loadLibrary(deps);

    // null yerel liste: Ozel Listelerim yok, yt listeler var
    expect(lastHtml()).not.toContain('Özel Listelerim');
    expect(lastHtml()).toContain('YouTube Music Listeleri');
    await browseCards[0].handlers[0]();
    expect(deps.playLibraryBrowse).toHaveBeenCalledWith('b1');
    await browseCards[1].handlers[0]();
    expect(deps.playLibraryBrowse).toHaveBeenCalledTimes(1);
  });

  it('albums sekmesi album bosken yalnizca sanatcilari cizer', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.getRecent.mockReturnValue([]);
    deps.getTab.mockReturnValue('albums');
    deps.fetchAlbums.mockResolvedValue([]);
    deps.fetchArtists.mockResolvedValue([{ browseId: 'ar1', title: 'Ar1', thumbnail: 't', name: 'Ar1' }]);

    await libraryView.loadLibrary(deps);

    expect(lastHtml()).not.toContain('Albümler');
    expect(lastHtml()).toContain('Sanatçılar');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container);
  });

  it('songs sekmesi recent sarkilari Kütüphane Şarkıları basligiyla cizer', async () => {
    deps.isLoggedIn.mockReturnValue(false);
    deps.getRecent.mockReturnValue([song('r1')]);
    deps.getTab.mockReturnValue('songs');

    await libraryView.loadLibrary(deps);

    expect(lastHtml()).toContain('Kütüphane Şarkıları');
    expect(lastHtml()).not.toContain('Son Çalınanlar');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container);
  });
});
