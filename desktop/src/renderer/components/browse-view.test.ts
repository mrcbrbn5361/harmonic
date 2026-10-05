/* ============================================
   Harmonic - Browse View Tests (R-04/3)
   openBrowse — Node ortami: document vi.stubGlobal ile taklit edilir.
   Orkestrasyon (fetch/render/wire/context/search/library/home/retry)
   mock deps ile enjekte edilir. Desen: home-view.test.ts.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BrowseView = typeof import('./browse-view');

let browseView: BrowseView;

let htmlWrites: string[];
let backBtn: FakeButton | null;
let retryBtn: FakeButton | null;
let cards: FakeCard[];
let page: string;
let containerPresent: boolean;
let container: Record<string, unknown>;
let deps: {
  getPage: ReturnType<typeof vi.fn>;
  fetchBrowse: ReturnType<typeof vi.fn>;
  renderRow: ReturnType<typeof vi.fn>;
  enterContext: ReturnType<typeof vi.fn>;
  wireRowEvents: ReturnType<typeof vi.fn>;
  openSub: ReturnType<typeof vi.fn>;
  goSearch: ReturnType<typeof vi.fn>;
  goLibrary: ReturnType<typeof vi.fn>;
  goHome: ReturnType<typeof vi.fn>;
  getSearchQuery: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};
let onBack: ReturnType<typeof vi.fn>;

interface FakeButton {
  addEventListener: ReturnType<typeof vi.fn>;
  fireClick: () => void;
}

interface FakeCard {
  dataset: Record<string, string | undefined>;
  addEventListener: ReturnType<typeof vi.fn>;
  fireClick: () => void;
  querySelector: (sel: string) => { textContent?: string; src?: string } | null;
}

function makeButton(): FakeButton {
  let clickHandler: (() => void) | null = null;
  return {
    addEventListener: vi.fn((ev: string, h: () => void) => {
      if (ev === 'click') clickHandler = h;
    }),
    fireClick: () => clickHandler?.(),
  };
}

function makeCard(browseId: string | undefined, bare = false): FakeCard {
  let clickHandler: (() => void) | null = null;
  return {
    dataset: browseId === undefined ? {} : { browse: browseId },
    addEventListener: vi.fn((ev: string, h: () => void) => {
      if (ev === 'click') clickHandler = h;
    }),
    fireClick: () => clickHandler?.(),
    querySelector: (sel: string) => {
      if (bare || browseId === undefined) return null;
      if (sel === '.card-title') return { textContent: 'CardTitle' };
      if (sel === 'img') return { src: 'thumb.jpg' };
      return null;
    },
  };
}

const CONTAINER_IDS: Record<string, string> = {
  search: 'searchResults',
  library: 'libraryContent',
  home: 'homeContent',
};

const songItem = (id: string) => ({ id, title: 'T' + id, artist: 'A' + id });
const cardItem = (browseId: string) => ({ browseId, title: 'C' + browseId, artist: 'CA' + browseId });

beforeEach(async () => {
  vi.resetModules();
  htmlWrites = [];
  backBtn = null;
  retryBtn = null;
  cards = [];
  page = 'home';
  containerPresent = true;
  onBack = vi.fn();
  deps = {
    getPage: vi.fn(() => page),
    fetchBrowse: vi.fn(),
    renderRow: vi.fn((s: { id: string }, n?: number) => '<div>' + s.id + n + '</div>'),
    enterContext: vi.fn(),
    wireRowEvents: vi.fn(),
    openSub: vi.fn(),
    goSearch: vi.fn(),
    goLibrary: vi.fn(),
    goHome: vi.fn(),
    getSearchQuery: vi.fn(() => ''),
    retry: vi.fn(),
  };
  container = {
    querySelector: (sel: string) => {
      if (sel === '#btnBrowseBack') return backBtn as unknown as Element | null;
      if (sel === '#btnBrowseRetry') return retryBtn as unknown as Element | null;
      return null;
    },
    querySelectorAll: (sel: string) =>
      sel === '.card[data-browse]' ? (cards as unknown as Element[]) : [],
  };
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => htmlWrites[htmlWrites.length - 1] ?? '',
    set: (v: string) => {
      htmlWrites.push(v);
    },
  });
  vi.stubGlobal('document', {
    querySelector: (sel: string) => {
      if (!containerPresent) return null;
      const want = '#' + (CONTAINER_IDS[page] ?? 'homeContent');
      return sel === want ? (container as unknown as Element) : null;
    },
  });
  browseView = await import('./browse-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openBrowse', () => {
  it('once loading yazar (fetch cozulmeden once)', async () => {
    deps.fetchBrowse.mockReturnValue(new Promise(() => {}));
    const p = browseView.openBrowse(deps, 'b1');
    expect(htmlWrites[0]).toContain('Yükleniyor');
    expect(deps.fetchBrowse).toHaveBeenCalledWith('b1');
    await Promise.race([p, Promise.resolve()]);
  });

  it('hedef container yoksa erken doner (fetch yok, yazim yok)', async () => {
    containerPresent = false;
    await browseView.openBrowse(deps, 'b1');
    expect(deps.fetchBrowse).not.toHaveBeenCalled();
    expect(htmlWrites).toHaveLength(0);
  });

  it('songs dali: header + enterContext + wiring, back home kolu', async () => {
    deps.fetchBrowse.mockResolvedValue({ title: 'BrowseT', items: [songItem('s1')] });
    backBtn = makeButton();
    await browseView.openBrowse(deps, 'b1');
    expect(deps.renderRow).toHaveBeenCalledTimes(1);
    expect(deps.enterContext).toHaveBeenCalledTimes(1);
    const ctx = deps.enterContext.mock.calls[0] as unknown[];
    expect(ctx[1]).toBe('BrowseT');
    expect(ctx[2]).toBe('playlist');
    expect(deps.wireRowEvents).toHaveBeenCalledTimes(1);
    const wire = deps.wireRowEvents.mock.calls[0] as unknown[];
    expect(wire[1]).toBe('BrowseT');
    expect(wire[2]).toBe('playlist');
    const last = htmlWrites[htmlWrites.length - 1];
    expect(last).toContain('BrowseT');
    expect(last).toContain('song-list');
    backBtn.fireClick();
    expect(deps.goHome).toHaveBeenCalledTimes(1);
  });

  it('fallback baslik + callback back kolu', async () => {
    deps.fetchBrowse.mockResolvedValue({ items: [songItem('s1')] });
    backBtn = makeButton();
    await browseView.openBrowse(deps, 'b1', 'FallbackT', 'ft.jpg', onBack);
    const last = htmlWrites[htmlWrites.length - 1];
    expect(last).toContain('FallbackT');
    expect(last).toContain('ft.jpg');
    backBtn.fireClick();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(deps.goHome).not.toHaveBeenCalled();
  });

  it('cards dali: enterContext yok, sub kart openSub + back library kolu', async () => {
    page = 'library';
    deps.fetchBrowse.mockResolvedValue({ title: 'CardsT', items: [cardItem('c1'), { browseId: 'c2' }] });
    backBtn = makeButton();
    cards = [makeCard('sub1')];
    await browseView.openBrowse(deps, 'b1');
    expect(deps.enterContext).not.toHaveBeenCalled();
    expect(deps.wireRowEvents).toHaveBeenCalledTimes(1);
    expect(htmlWrites[htmlWrites.length - 1]).toContain('card-grid');
    cards[0].fireClick();
    expect(deps.openSub).toHaveBeenCalledTimes(1);
    const sub = deps.openSub.mock.calls[0] as unknown[];
    expect(sub[0]).toBe('sub1');
    expect(sub[1]).toBe('CardTitle');
    expect(sub[2]).toBe('thumb.jpg');
    expect(typeof sub[3]).toBe('function');
    (sub[3] as () => void)();
    expect(deps.openSub).toHaveBeenCalledWith('b1', 'CardsT', '', undefined);
    backBtn.fireClick();
    expect(deps.goLibrary).toHaveBeenCalledTimes(1);
  });

  it('items tanimsiz -> empty HTML + Liste basligi', async () => {
    deps.fetchBrowse.mockResolvedValue({});
    backBtn = makeButton();
    await browseView.openBrowse(deps, 'b1');
    const last = htmlWrites[htmlWrites.length - 1];
    expect(last).toContain('İçerik bulunamadı');
    expect(last).toContain('Liste');
    expect(deps.enterContext).not.toHaveBeenCalled();
    expect(deps.wireRowEvents).toHaveBeenCalledTimes(1);
  });

  it('fetch throw -> error HTML + retry ayni argumanlarla + back goHome', async () => {
    deps.fetchBrowse.mockRejectedValue(new Error('net down'));
    retryBtn = makeButton();
    backBtn = makeButton();
    await browseView.openBrowse(deps, 'b1', 'FT', 'FTh');
    expect(htmlWrites[htmlWrites.length - 1]).toContain('btnBrowseRetry');
    retryBtn.fireClick();
    expect(deps.retry).toHaveBeenCalledWith('b1', 'FT', 'FTh', undefined);
    backBtn.fireClick();
    expect(deps.goHome).toHaveBeenCalledTimes(1);
  });

  it('catch back onBack varsa onBack cagrilir', async () => {
    deps.fetchBrowse.mockRejectedValue(new Error('x'));
    retryBtn = makeButton();
    backBtn = makeButton();
    await browseView.openBrowse(deps, 'b1', undefined, undefined, onBack);
    retryBtn.fireClick();
    expect(deps.retry).toHaveBeenCalledWith('b1', undefined, undefined, onBack);
    backBtn.fireClick();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(deps.goHome).not.toHaveBeenCalled();
  });

  it('search back kolu: sorgu varsa goSearch, bossa no-op', async () => {
    page = 'search';
    deps.fetchBrowse.mockResolvedValue({ title: 'ST', items: [songItem('s1')] });
    backBtn = makeButton();
    deps.getSearchQuery.mockReturnValue('query1');
    await browseView.openBrowse(deps, 'b1');
    backBtn.fireClick();
    expect(deps.goSearch).toHaveBeenCalledWith('query1');
    deps.getSearchQuery.mockReturnValue('');
    await browseView.openBrowse(deps, 'b1');
    backBtn.fireClick();
    expect(deps.goSearch).toHaveBeenCalledTimes(1);
  });

  it('browse idsiz kart no-op; sorgusuz kart bos stringlerle openSub', async () => {
    deps.fetchBrowse.mockResolvedValue({ title: 'ST', items: [songItem('s1')] });
    backBtn = makeButton();
    const noId = makeCard(undefined);
    const bare = makeCard('bare1', true);
    cards = [noId, bare];
    await browseView.openBrowse(deps, 'b1');
    noId.fireClick();
    expect(deps.openSub).not.toHaveBeenCalled();
    bare.fireClick();
    expect(deps.openSub).toHaveBeenCalledWith('bare1', '', '', expect.any(Function));
  });
});
