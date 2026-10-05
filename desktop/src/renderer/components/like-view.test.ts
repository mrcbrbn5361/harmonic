/* ============================================
   Harmonic - Like View Tests (R-03/R2)
   saveLiked + updateLikeBtn + syncLikeButtons
   Node ortamı: document vi.stubGlobal ile taklit edilir.
   ============================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApi } from './api-client';

function makeBtnEl(id?: string, withSvg = true) {
  const svg = withSvg ? { setAttribute: vi.fn() } : null;
  return {
    classList: { toggle: vi.fn() },
    dataset: { id } as Record<string, string | undefined>,
    querySelector: vi.fn(() => svg),
    __svg: svg,
  };
}

type LikeView = typeof import('./like-view');
type StateModule = typeof import('./state');

let likeView: LikeView;
let stateModule: StateModule;
let mockApi: Record<string, any>;
let btnLikeEl: ReturnType<typeof makeBtnEl>;
let listBtns: ReturnType<typeof makeBtnEl>[];

beforeEach(async () => {
  vi.resetModules();
  btnLikeEl = makeBtnEl();
  listBtns = [];
  vi.stubGlobal('document', {
    querySelector: (sel: string) =>
      sel === '#btnLike' ? (btnLikeEl as unknown as HTMLElement) : null,
    querySelectorAll: (sel: string) =>
      sel === '.like-btn' ? (listBtns as unknown[]) : [],
  });
  const apiClient = await import('./api-client');
  mockApi = { store: { set: vi.fn(), get: vi.fn() } };
  apiClient.setApi(mockApi);
  stateModule = await import('./state');
  likeView = await import('./like-view');
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

describe('saveLiked', () => {
  it('beğeni set/map içeriklerini store anahtarlarına yazar', () => {
    stateModule.state.liked = new Set(['s1', 's2']);
    stateModule.state.likedSongsMap = { s1: makeSong('s1') };

    likeView.saveLiked();

    expect(mockApi.store.set).toHaveBeenCalledWith('likedSongs', ['s1', 's2']);
    expect(mockApi.store.set).toHaveBeenCalledWith('likedSongsDetails', {
      s1: expect.objectContaining({ id: 's1' }),
    });
  });
});

describe('updateLikeBtn', () => {
  it('currentSong yokken DOMa dokunmaz', () => {
    stateModule.state.currentSong = null;

    likeView.updateLikeBtn();

    expect(btnLikeEl.classList.toggle).not.toHaveBeenCalled();
  });

  it('beğenilen parçada active + currentColor yazar', () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.liked = new Set(['s1']);

    likeView.updateLikeBtn();

    expect(btnLikeEl.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(btnLikeEl.__svg?.setAttribute).toHaveBeenCalledWith('fill', 'currentColor');
  });

  it('beğenilmeyen parçada active kapatır + none yazar', () => {
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.liked = new Set();

    likeView.updateLikeBtn();

    expect(btnLikeEl.classList.toggle).toHaveBeenCalledWith('active', false);
    expect(btnLikeEl.__svg?.setAttribute).toHaveBeenCalledWith('fill', 'none');
  });

  it('svg yokken throw etmez', () => {
    btnLikeEl = makeBtnEl(undefined, false);
    stateModule.state.currentSong = makeSong('s1');
    stateModule.state.liked = new Set(['s1']);

    expect(() => likeView.updateLikeBtn()).not.toThrow();
    expect(btnLikeEl.classList.toggle).toHaveBeenCalledWith('active', true);
  });
});

describe('syncLikeButtons', () => {
  it('yalnızca eşleşen data-id düğmelerini senkronlar', () => {
    const match = makeBtnEl('s1');
    const other = makeBtnEl('s2');
    const noSvg = makeBtnEl('s1', false);
    listBtns = [match, other, noSvg];
    stateModule.state.liked = new Set(['s1']);

    likeView.syncLikeButtons('s1');

    expect(match.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(match.__svg?.setAttribute).toHaveBeenCalledWith('fill', 'currentColor');
    expect(other.classList.toggle).not.toHaveBeenCalled();
    expect(noSvg.classList.toggle).toHaveBeenCalledWith('active', true);
  });

  it('beğeni kalkınca active kapatır', () => {
    const match = makeBtnEl('s1');
    listBtns = [match];
    stateModule.state.liked = new Set();

    likeView.syncLikeButtons('s1');

    expect(match.classList.toggle).toHaveBeenCalledWith('active', false);
    expect(match.__svg?.setAttribute).toHaveBeenCalledWith('fill', 'none');
  });
});
