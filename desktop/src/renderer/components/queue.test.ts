import { describe, it, expect, vi } from 'vitest';
import {
  buildMergedQueue,
  applyAddToQueue,
  applyPlayNext,
  applyClearUserQueue,
  applySetContext,
  getNextIndex,
  getPrevIndex,
  fisherYatesShuffle,
  type QueueStateSlice,
} from './queue';
import type { QueueItem, Song } from './state';

function song(id: string): Song {
  return { id, title: id, artist: 'a', artistId: 'a', thumbnail: '', duration: 1 };
}

function baseState(over: Partial<QueueStateSlice> = {}): QueueStateSlice {
  const q: QueueItem[] = [song('1'), song('2'), song('3')].map((s) => s as QueueItem);
  return {
    queue: [...q],
    queueIndex: 0,
    userQueue: [],
    contextQueue: [...q],
    contextName: 'ctx',
    contextType: 'home',
    currentSong: q[0],
    shuffle: false,
    shuffleOrder: [],
    repeat: 'off',
    ...over,
  };
}

describe('buildMergedQueue', () => {
  it('user + context sırasını korur', () => {
    const u = [song('u1') as QueueItem];
    const c = [song('c1'), song('c2')].map((s) => s as QueueItem);
    expect(buildMergedQueue(u, c).map((s) => s.id)).toEqual(['u1', 'c1', 'c2']);
  });
});

describe('apply helpers', () => {
  it('add/playNext/clear birleşik kuyruğu günceller', () => {
    const s = baseState({ queue: [], queueIndex: -1, userQueue: [], contextQueue: [], currentSong: null });
    applyAddToQueue(s, song('x'));
    expect(s.queue.map((t) => t.id)).toEqual(['x']);
    applyPlayNext(s, song('y'));
    expect(s.queue.map((t) => t.id)).toEqual(['y', 'x']);
    applyClearUserQueue(s);
    expect(s.queue).toEqual([]);
  });

  it('setContext shuffle sırasını sıfırlar ve indexi sabitler', () => {
    const s = baseState({ shuffleOrder: [2, 0, 1], queueIndex: 0 });
    applySetContext(s, [song('a'), song('b')], 'ctx2', 'playlist');
    expect(s.shuffleOrder).toEqual([]);
    expect(s.queue.map((t) => t.id)).toEqual(['a', 'b']);
    expect(s.queueIndex).toBe(0);
  });
});

describe('getNextIndex', () => {
  it('sıralı ilerler, sonda repeat-off + şarkı varsa radio', () => {
    expect(getNextIndex(baseState({ queueIndex: 0 }))).toEqual({ kind: 'play', index: 1 });
    expect(getNextIndex(baseState({ queueIndex: 2 }))).toEqual({ kind: 'radio' });
  });

  it('repeat-one mevcut şarkıyı tekrarlar', () => {
    expect(getNextIndex(baseState({ repeat: 'one' }))).toEqual({ kind: 'repeat-current' });
  });

  it('repeat-all sonda başa sarar', () => {
    expect(getNextIndex(baseState({ queueIndex: 2, repeat: 'all' }))).toEqual({ kind: 'play', index: 0 });
  });

  it('boş kuyruk stop verir', () => {
    expect(getNextIndex(baseState({ queue: [], queueIndex: -1, currentSong: null }))).toEqual({ kind: 'stop' });
  });
});

describe('getPrevIndex', () => {
  it('3sn üstü restart verir', () => {
    expect(getPrevIndex(baseState(), 5)).toEqual({ kind: 'restart' });
  });

  it('ilk şarkıda restart, sonra geri gider', () => {
    expect(getPrevIndex(baseState({ queueIndex: 0 }), 0)).toEqual({ kind: 'restart' });
    expect(getPrevIndex(baseState({ queueIndex: 2 }), 0)).toEqual({ kind: 'play', index: 1 });
  });
});

describe('getNextIndex shuffle', () => {
  it('verili shuffleOrder ile sırada ilerler', () => {
    const s = baseState({ shuffle: true, shuffleOrder: [2, 0, 1], queueIndex: 2 });
    expect(getNextIndex(s)).toEqual({ kind: 'play', index: 0 });
  });

  it('boş shuffleOrder ilk çağrıda üretilir', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    try {
      const s = baseState({ shuffle: true, shuffleOrder: [], queueIndex: 0 });
      const d = getNextIndex(s);
      expect(d).toEqual({ kind: 'play', index: 1, shuffleOrder: [0, 1, 2] });
    } finally {
      spy.mockRestore();
    }
  });

  it('shuffle tükendi + repeat-all reshuffle üretir', () => {
    const s = baseState({ shuffle: true, shuffleOrder: [0, 1, 2], queueIndex: 2, repeat: 'all' });
    const d = getNextIndex(s);
    expect(d.kind).toBe('play');
    if (d.kind === 'play') {
      expect(d.shuffleOrder).toBeDefined();
      expect([...(d.shuffleOrder ?? [])].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    }
  });

  it('shuffle tükendi + repeat-off: şarkı varsa radio, yoksa stop', () => {
    const withSong = baseState({ shuffle: true, shuffleOrder: [0, 1, 2], queueIndex: 2, repeat: 'off' });
    expect(getNextIndex(withSong)).toEqual({ kind: 'radio' });
    const noSong = baseState({
      shuffle: true, shuffleOrder: [0, 1, 2], queueIndex: 2, repeat: 'off',
      currentSong: null,
    });
    expect(getNextIndex(noSong)).toEqual({ kind: 'stop' });
  });
});

describe('getPrevIndex shuffle', () => {
  it('verili shuffleOrder ile geri gider, baştaysa restart', () => {
    const s = baseState({ shuffle: true, shuffleOrder: [2, 0, 1], queueIndex: 0 });
    expect(getPrevIndex(s, 0)).toEqual({ kind: 'play', index: 2 });
    const head = baseState({ shuffle: true, shuffleOrder: [2, 0, 1], queueIndex: 2 });
    expect(getPrevIndex(head, 0)).toEqual({ kind: 'restart' });
  });
});

describe('applySetContext pin', () => {
  it('currentSong yeni bağlamda varsa indexi ona sabitler', () => {
    const q = [song('1'), song('2'), song('3')].map((s) => s as QueueItem);
    const s = baseState({ queue: [...q], queueIndex: 0, currentSong: q[2] });
    applySetContext(s, [song('9'), song('3'), song('8')], 'ctx3', 'album');
    expect(s.queueIndex).toBe(1);
  });
});
describe('fisherYatesShuffle', () => {
  it('aynı elemanları permüte eder, girdiyi değiştirmez', () => {
    const input = [0, 1, 2, 3, 4];
    const out = fisherYatesShuffle(input);
    expect(input).toEqual([0, 1, 2, 3, 4]);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});
