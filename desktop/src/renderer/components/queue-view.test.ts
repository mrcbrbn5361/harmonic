/* ============================================
   Harmonic - Queue View Tests (R-04/1)
   renderQueue — Node ortamı: document vi.stubGlobal ile taklit edilir.
   Orkestrasyon (clearUserQueue/playSong) mock deps ile enjekte edilir.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueueView = typeof import('./queue-view');
type StateModule = typeof import('./state');

let queueView: QueueView;
let stateModule: StateModule;

let bodyHtmlWrites: string[];
let items: FakeItem[];
let clearBtn: FakeClearBtn | null;
let deps: { clearUserQueue: ReturnType<typeof vi.fn>; playSong: ReturnType<typeof vi.fn> };

interface FakeItem {
  dataset: Record<string, string | undefined>;
  addEventListener: ReturnType<typeof vi.fn>;
  fireClick: () => void;
}

interface FakeClearBtn {
  addEventListener: ReturnType<typeof vi.fn>;
  fireClick: () => void;
}

function makeItem(type: string, idx: number): FakeItem {
  let clickHandler: (() => void) | null = null;
  return {
    dataset: { type, idx: String(idx) },
    addEventListener: vi.fn((ev: string, h: () => void) => {
      if (ev === 'click') clickHandler = h;
    }),
    fireClick: () => clickHandler?.(),
  };
}

function makeClearBtn(): FakeClearBtn {
  let clickHandler: (() => void) | null = null;
  return {
    addEventListener: vi.fn((ev: string, h: () => void) => {
      if (ev === 'click') clickHandler = h;
    }),
    fireClick: () => clickHandler?.(),
  };
}

const makeSong = (id: string) => ({
  id,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  artistId: 'a1',
  thumbnail: 't.jpg',
  duration: 10,
});

beforeEach(async () => {
  vi.resetModules();
  bodyHtmlWrites = [];
  items = [];
  clearBtn = null;
  deps = { clearUserQueue: vi.fn(), playSong: vi.fn() };
  const body = {
    set innerHTML(v: string) {
      bodyHtmlWrites.push(v);
    },
    get innerHTML() {
      return bodyHtmlWrites[bodyHtmlWrites.length - 1] ?? '';
    },
    querySelector: (sel: string) =>
      sel === '#clearUserQueue' ? (clearBtn as unknown as Element | null) : null,
    querySelectorAll: (sel: string) =>
      sel === '.queue-item' ? (items as unknown as Element[]) : [],
  };
  vi.stubGlobal('document', {
    querySelector: (sel: string) =>
      sel === '#queueBody' ? (body as unknown as HTMLElement) : null,
  });
  stateModule = await import('./state');
  queueView = await import('./queue-view');
  const s = stateModule.state;
  s.userQueue = [];
  s.contextQueue = [];
  s.queue = [];
  s.queueIndex = -1;
  s.currentSong = null;
  s.contextName = '';
  s.shuffleOrder = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderQueue', () => {
  it('iki liste de boşken boş görünüm yazar', () => {
    queueView.renderQueue(deps);

    expect(bodyHtmlWrites).toHaveLength(1);
    expect(bodyHtmlWrites[0]).toContain('Sıra boş');
    expect(deps.playSong).not.toHaveBeenCalled();
  });

  it('kullanıcı + bağlam bölümlerini context etiketiyle yazar', () => {
    const s = stateModule.state;
    s.userQueue = [makeSong('u1')];
    s.contextQueue = [makeSong('c1'), makeSong('c2')];
    s.currentSong = makeSong('c1');
    s.contextName = 'Test Bağlamı';

    queueView.renderQueue(deps);

    expect(bodyHtmlWrites[0]).toContain('Sıradaki Şarkılar');
    expect(bodyHtmlWrites[0]).toContain('Test Bağlamı');
  });

  it('temizle butonu deps.clearUserQueue çağırır ve yeniden çizer', () => {
    const s = stateModule.state;
    s.userQueue = [makeSong('u1')];
    clearBtn = makeClearBtn();

    queueView.renderQueue(deps);
    clearBtn.fireClick();

    expect(deps.clearUserQueue).toHaveBeenCalledTimes(1);
    expect(bodyHtmlWrites).toHaveLength(2);
  });

  it('user satır tıklaması tüketir, index kaydırır ve playSong çağırır', () => {
    const s = stateModule.state;
    const u1 = makeSong('u1');
    const u2 = makeSong('u2');
    s.userQueue = [u1, u2];
    s.contextQueue = [];
    items = [makeItem('user', 0)];

    queueView.renderQueue(deps);
    items[0].fireClick();

    expect(s.userQueue.map((x) => x.id)).toEqual(['u2']);
    expect(s.queueIndex).toBe(-1);
    expect(deps.playSong).toHaveBeenCalledTimes(1);
    expect(deps.playSong.mock.calls[0][0]).toMatchObject({ id: 'u1' });
    expect(bodyHtmlWrites).toHaveLength(2);
  });

  it('user satırında geçersiz idx playSong çağırmaz ama yeniden çizer', () => {
    const s = stateModule.state;
    s.userQueue = [makeSong('u1')];
    items = [makeItem('user', 5)];

    queueView.renderQueue(deps);
    items[0].fireClick();

    expect(deps.playSong).not.toHaveBeenCalled();
    expect(s.userQueue).toHaveLength(1);
    expect(bodyHtmlWrites).toHaveLength(2);
  });

  it('context satır tıklaması upcoming diliminden çözer ve tam indexe koyar', () => {
    const s = stateModule.state;
    const c1 = makeSong('c1');
    const c2 = makeSong('c2');
    const c3 = makeSong('c3');
    s.contextQueue = [c1, c2, c3];
    s.queue = [c1, c2, c3];
    s.currentSong = c1;
    s.queueIndex = 0;
    items = [makeItem('context', 0)];

    queueView.renderQueue(deps);
    items[0].fireClick();

    expect(deps.playSong).toHaveBeenCalledTimes(1);
    expect(deps.playSong.mock.calls[0][0]).toMatchObject({ id: 'c2' });
    expect(s.queueIndex).toBe(1);
    expect(bodyHtmlWrites).toHaveLength(2);
  });

  it('context satırında dilim-dışı idx playSong çağırmaz', () => {
    const s = stateModule.state;
    const c1 = makeSong('c1');
    s.contextQueue = [c1];
    s.queue = [c1];
    s.currentSong = c1;
    items = [makeItem('context', 3)];

    queueView.renderQueue(deps);
    items[0].fireClick();

    expect(deps.playSong).not.toHaveBeenCalled();
    expect(bodyHtmlWrites).toHaveLength(2);
  });

  it('bilinmeyen satır tipi playSong çağırmaz ama yeniden çizer', () => {
    const s = stateModule.state;
    s.userQueue = [makeSong('u1')];
    items = [makeItem('other', 0)];

    queueView.renderQueue(deps);
    items[0].fireClick();

    expect(deps.playSong).not.toHaveBeenCalled();
    expect(bodyHtmlWrites).toHaveLength(2);
  });
});
