/* ============================================
   Harmonic - Liked View Tests (R-04/4)
   loadLiked — Node ortami: document vi.stubGlobal ile taklit edilir.
   Orkestrasyon (gen/login/fetch/local/render/wire) mock deps ile
   enjekte edilir. Desen: home-view.test.ts.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIKED_EMPTY_HTML } from './content';

type LikedView = typeof import('./liked-view');

let likedView: LikedView;

let htmlWrites: string[];
let container: Record<string, unknown>;
let deps: {
  getGen: ReturnType<typeof vi.fn>;
  isStale: ReturnType<typeof vi.fn>;
  isLoggedIn: ReturnType<typeof vi.fn>;
  fetchYtLiked: ReturnType<typeof vi.fn>;
  getLocalIds: ReturnType<typeof vi.fn>;
  resolveLocal: ReturnType<typeof vi.fn>;
  renderRow: ReturnType<typeof vi.fn>;
  wireRowEvents: ReturnType<typeof vi.fn>;
};

const song = (id: string) => ({ id, title: 'T' + id, artist: 'A' + id });

beforeEach(async () => {
  vi.resetModules();
  htmlWrites = [];
  deps = {
    getGen: vi.fn(() => 7),
    isStale: vi.fn(() => false),
    isLoggedIn: vi.fn(() => false),
    fetchYtLiked: vi.fn(async () => []),
    getLocalIds: vi.fn(() => [] as string[]),
    resolveLocal: vi.fn((_ids: readonly string[]) => [] as unknown[]),
    renderRow: vi.fn((s: { id: string }, n?: number) => '<div class="song-row" data-id="' + s.id + '">' + String(n) + '</div>'),
    wireRowEvents: vi.fn(),
  };
  container = {
    querySelector: (_sel: string) => null,
    querySelectorAll: (_sel: string) => [],
  };
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => htmlWrites[htmlWrites.length - 1] ?? '',
    set: (v: string) => {
      htmlWrites.push(v);
    },
  });
  vi.stubGlobal('document', {
    querySelector: (sel: string) => (sel === '#likedContent' ? (container as unknown as Element) : null),
  });
  likedView = await import('./liked-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLiked', () => {
  it('stale gen ise fetch sonrasi erken doner (cizim/wiring yok)', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.fetchYtLiked.mockResolvedValue([song('y1')]);
    deps.isStale.mockReturnValue(true);

    await likedView.loadLiked(deps);

    expect(deps.getGen).toHaveBeenCalled();
    expect(deps.fetchYtLiked).toHaveBeenCalled();
    expect(deps.isStale).toHaveBeenCalledWith(7);
    expect(htmlWrites).toEqual([]);
    expect(deps.wireRowEvents).not.toHaveBeenCalled();
  });

  it('login-disiyken fetch yapmaz, sadece yerel begenileri cizer', async () => {
    deps.isLoggedIn.mockReturnValue(false);
    deps.getLocalIds.mockReturnValue(['l1', 'l2']);
    deps.resolveLocal.mockReturnValue([song('l1'), song('l2')]);

    await likedView.loadLiked(deps);

    expect(deps.fetchYtLiked).not.toHaveBeenCalled();
    expect(deps.resolveLocal).toHaveBeenCalledWith(['l1', 'l2']);
    expect(deps.renderRow).toHaveBeenCalledTimes(2);
    expect(htmlWrites).toHaveLength(1);
    expect(htmlWrites[0]).toContain('Yerel Beğeniler');
    expect(htmlWrites[0]).toContain('data-id="l1"');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container, 'Beğenilen Şarkılar', 'playlist');
  });

  it('login + yt doluyken iki bolumu de cizer', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.fetchYtLiked.mockResolvedValue([song('y1')]);
    deps.getLocalIds.mockReturnValue(['l1']);
    deps.resolveLocal.mockReturnValue([song('l1')]);

    await likedView.loadLiked(deps);

    expect(deps.renderRow).toHaveBeenCalledTimes(2);
    expect(htmlWrites).toHaveLength(1);
    expect(htmlWrites[0]).toContain('YouTube Music Beğenilenler');
    expect(htmlWrites[0]).toContain('Yerel Beğeniler');
    expect(htmlWrites[0]).toContain('data-id="y1"');
    expect(htmlWrites[0]).toContain('data-id="l1"');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container, 'Beğenilen Şarkılar', 'playlist');
  });

  it('likedSongs throw ederse yerel-only devam eder', async () => {
    deps.isLoggedIn.mockReturnValue(true);
    deps.fetchYtLiked.mockRejectedValue(new Error('net'));
    deps.getLocalIds.mockReturnValue(['l1']);
    deps.resolveLocal.mockReturnValue([song('l1')]);

    await likedView.loadLiked(deps);

    expect(deps.isStale).toHaveBeenCalledWith(7);
    expect(htmlWrites).toHaveLength(1);
    expect(htmlWrites[0]).not.toContain('YouTube Music Beğenilenler');
    expect(htmlWrites[0]).toContain('Yerel Beğeniler');
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container, 'Beğenilen Şarkılar', 'playlist');
  });

  it('yt + yerel bosken bos-goerunumu cizer', async () => {
    deps.isLoggedIn.mockReturnValue(false);
    deps.getLocalIds.mockReturnValue([]);
    deps.resolveLocal.mockReturnValue([]);

    await likedView.loadLiked(deps);

    expect(deps.renderRow).not.toHaveBeenCalled();
    expect(htmlWrites).toHaveLength(1);
    expect(htmlWrites[0]).toBe(LIKED_EMPTY_HTML);
    expect(deps.wireRowEvents).toHaveBeenCalledWith(container, 'Beğenilen Şarkılar', 'playlist');
  });
});
