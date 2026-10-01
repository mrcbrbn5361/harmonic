import { describe, it, expect } from 'vitest';
import {
  applyPreparePlay,
  applyToggleShuffle,
  cycleRepeat,
  filterRadioItems,
  applyAppendRadioItems,
  decideTrackEnded,
  type PlayerStateSlice,
} from './player';
import type { QueueItem, Song } from './state';

function song(id: string): Song {
  return { id, title: id, artist: 'a', artistId: 'a', thumbnail: '', duration: 1 };
}

function baseState(over: Partial<PlayerStateSlice> = {}): PlayerStateSlice {
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
    history: [],
    recentlyPlayed: [],
    ...over,
  };
}

describe('applyPreparePlay', () => {
  it('mevcut şarkıda indexi sabitler, yenisini sona ekler', () => {
    const s = baseState();
    applyPreparePlay(s, song('2'));
    expect(s.queueIndex).toBe(1);
    expect(s.queue).toHaveLength(3);
    applyPreparePlay(s, song('9'));
    expect(s.queueIndex).toBe(3);
    expect(s.queue.map((t) => t.id)).toEqual(['1', '2', '3', '9']);
  });

  it('history-50 ve recent-100 cap uygular', () => {
    const hist = Array.from({ length: 60 }, (_, i) => song(`h${i}`) as QueueItem);
    const rec = Array.from({ length: 120 }, (_, i) => song(`r${i}`));
    const s = baseState({ history: [...hist], recentlyPlayed: [...rec] });
    applyPreparePlay(s, song('new'));
    expect(s.history).toHaveLength(50);
    expect(s.history[0].id).toBe('1');
    expect(s.recentlyPlayed).toHaveLength(100);
    expect(s.recentlyPlayed[0].id).toBe('new');
  });
});

describe('applyToggleShuffle', () => {
  it('açınca order üretir, kapatınca temizler', () => {
    const s = baseState();
    applyToggleShuffle(s);
    expect(s.shuffle).toBe(true);
    expect([...s.shuffleOrder].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    applyToggleShuffle(s);
    expect(s.shuffle).toBe(false);
    expect(s.shuffleOrder).toEqual([]);
  });
});

describe('cycleRepeat', () => {
  it('off → all → one → off döner', () => {
    expect(cycleRepeat('off')).toBe('all');
    expect(cycleRepeat('all')).toBe('one');
    expect(cycleRepeat('one')).toBe('off');
  });
});

describe('filterRadioItems', () => {
  it('çalan parçayı ve mevcut kuyruğu eler', () => {
    const items = [song('1'), song('4'), song('5')];
    expect(filterRadioItems(items, '1').map((s) => s.id)).toEqual(['4', '5']);
    expect(filterRadioItems(items, '9', new Set(['4'])).map((s) => s.id)).toEqual(['1', '5']);
  });
});

describe('applyAppendRadioItems', () => {
  it('contexte ekler ve birleşik kuyruğu kurar', () => {
    const s = baseState();
    applyAppendRadioItems(s, [song('4'), song('5')]);
    expect(s.contextQueue.map((t) => t.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(s.queue.map((t) => t.id)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('decideTrackEnded', () => {
  it('repeat-one ve autoplay-kapalı-son dalları', () => {
    const one = baseState({ repeat: 'one' });
    expect(decideTrackEnded(one, true)).toBe('repeat-one');
    const end = baseState({ repeat: 'off', queueIndex: 2 });
    expect(decideTrackEnded(end, false)).toBe('stop');
  });

  it('ortada next, şarkı yoksa stop', () => {
    const end = baseState({ repeat: 'off', queueIndex: 2 });
    expect(decideTrackEnded(end, true)).toBe('next');
    const mid = baseState({ queueIndex: 0 });
    expect(decideTrackEnded(mid, false)).toBe('next');
    const noSong = baseState({ currentSong: null });
    expect(decideTrackEnded(noSong, true)).toBe('stop');
  });
});
