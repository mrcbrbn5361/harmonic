/* ============================================
   Harmonic - Home View Tests (R-04/2)
   loadHome — Node ortami: document vi.stubGlobal ile taklit edilir.
   Orkestrasyon (fetch/render/wire/context/browse/retry) mock deps
   ile enjekte edilir. Desen: queue-view.test.ts / lyrics-view.test.ts.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type HomeView = typeof import('./home-view');
type StateModule = typeof import('./state');

let homeView: HomeView;
let stateModule: StateModule;

let htmlWrites: string[];
let retryBtn: FakeButton | null;
let cards: FakeCard[];
let deps: {
  fetchHome: ReturnType<typeof vi.fn>;
  renderRow: ReturnType<typeof vi.fn>;
  wireRowEvents: ReturnType<typeof vi.fn>;
  enterContext: ReturnType<typeof vi.fn>;
  openBrowse: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};
let container: Record<string, unknown>;

interface FakeButton {
  addEventListener: ReturnType<typeof vi.fn>;
  fireClick: () => void;
}

interface FakeCard {
  dataset: Record<string, string | undefined>;
  titleText: string;
  thumbSrc: string;
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

function makeCard(browseId: string | undefined): FakeCard {
  let clickHandler: (() => void) | null = null;
  const card: FakeCard = {
    dataset: browseId === undefined ? {} : { browse: browseId },
    titleText: 'CardTitle',
    thumbSrc: 'thumb.jpg',
    addEventListener: vi.fn((ev: string, h: () => void) => {
      if (ev === 'click') clickHandler = h;
    }),
    fireClick: () => clickHandler?.(),
    querySelector: (sel: string) => {
      if (browseId === undefined) return null;
      if (sel === '.card-title') return { textContent: card.titleText };
      if (sel === 'img') return { src: card.thumbSrc };
      return null;
    },
  };
  return card;
}

const songItem = (id: string) => ({ id, title: 'T' + id, artist: 'A' + id });
const cardItem = (browseId: string) => ({ browseId, title: 'C' + browseId, artist: 'CA' + browseId });

beforeEach(async () => {
  vi.resetModules();
  htmlWrites = [];
  retryBtn = null;
  cards = [];
  deps = {
    fetchHome: vi.fn(),
    renderRow: vi.fn((s: { id: string }, n?: number) => '<div class="song-row" data-id="' + s.id + '">' + String(n) + '</div>'),
    wireRowEvents: vi.fn(),
    enterContext: vi.fn(),
    openBrowse: vi.fn(),
    retry: vi.fn(),
  };
  container = {
    querySelector: (sel: string) =>
      sel === '.btn-retry' ? (retryBtn as unknown as Element | null) : null,
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
    querySelector: (sel: string) => (sel === '#homeContent' ? (container as unknown as Element) : null),
  });
  homeView = await import('./home-view');
  stateModule = await import('./state');
  stateModule.state.navGeneration = 1;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadHome', () => {
  it('once skeleton yazar (fetch cozulmeden once)', async () => {
    deps.fetchHome.mockReturnValue(new Promise(() => {}));
    const p = homeView.loadHome(deps);
    expect(htmlWrites[0]).toContain('skeleton-grid');
    expect(deps.fetchHome).toHaveBeenCalledTimes(1);
    await Promise.race([p, Promise.resolve()]);
  });

  it('bos items -> error HTML + retry butonu retry depsini cagirir', async () => {
    deps.fetchHome.mockResolvedValue({ items: [] });
    retryBtn = makeButton();
    await homeView.loadHome(deps);
    const last = htmlWrites[htmlWrites.length - 1];
    expect(last).toContain('btn-retry');
    expect(deps.enterContext).not.toHaveBeenCalled();
    retryBtn.fireClick();
    expect(deps.retry).toHaveBeenCalledTimes(1);
  });

  it('songs + cards cizer, kosul saglaninca enterContext + wiring calisir', async () => {
    deps.fetchHome.mockResolvedValue({ items: [songItem('s1'), cardItem('b1'), { browseId: 'b0', title: 'C0' }] });
    cards = [makeCard('b1')];
    await homeView.loadHome(deps);
    expect(deps.renderRow).toHaveBeenCalledTimes(1);
    expect(deps.enterContext).toHaveBeenCalledTimes(1);
    const ctxArgs = deps.enterContext.mock.calls[0] as unknown[];
    expect(ctxArgs[1]).toBe('Önerilen Şarkılar');
    expect(ctxArgs[2]).toBe('home');
    expect(deps.wireRowEvents).toHaveBeenCalledTimes(1);
    cards[0].fireClick();
    expect(deps.openBrowse).toHaveBeenCalledWith('b1', 'CardTitle', 'thumb.jpg');
  });

  it('sarki yoksa (sadece kart) enterContext cagrilmaz', async () => {
    deps.fetchHome.mockResolvedValue({ items: [cardItem('b9')] });
    cards = [makeCard('b9')];
    await homeView.loadHome(deps);
    expect(deps.enterContext).not.toHaveBeenCalled();
    expect(deps.wireRowEvents).toHaveBeenCalledTimes(1);
  });

  it('stale generation -> sonuc discard edilir (context/wire calismaz)', async () => {
    deps.fetchHome.mockImplementation(async () => {
      stateModule.state.navGeneration += 1;
      return { items: [songItem('s1')] };
    });
    await homeView.loadHome(deps);
    expect(deps.enterContext).not.toHaveBeenCalled();
    expect(deps.wireRowEvents).not.toHaveBeenCalled();
    expect(htmlWrites).toHaveLength(1);
  });

  it('fetch throw -> error HTML + retry wiring', async () => {
    deps.fetchHome.mockRejectedValue(new Error('net down'));
    retryBtn = makeButton();
    await homeView.loadHome(deps);
    const last = htmlWrites[htmlWrites.length - 1];
    expect(last).toContain('btn-retry');
    retryBtn.fireClick();
    expect(deps.retry).toHaveBeenCalledTimes(1);
  });

  it('data-browse olmayan karta tiklama openBrowse cagirmaz', async () => {
    deps.fetchHome.mockResolvedValue({ items: [songItem('s1'), cardItem('b2')] });
    cards = [makeCard(undefined)];
    await homeView.loadHome(deps);
    cards[0].fireClick();
    expect(deps.openBrowse).not.toHaveBeenCalled();
  });
});
