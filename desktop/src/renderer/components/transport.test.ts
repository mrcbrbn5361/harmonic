import { describe, it, expect } from 'vitest';
import type { Song } from './state';
import {
  clampVolume,
  volumeTier,
  volumeStepTo,
  muteToggleTarget,
  seekFraction,
  seekTimeFor,
  clampSeekTarget,
  keySeekStep,
  playIconVisibility,
  likeFill,
  applyLikeToggle,
  isTypingTarget,
  resolveKeyAction,
  isRepeatActive,
  isRepeatOne,
} from './transport';

function mkSong(over: Partial<Song> = {}): Song {
  return {
    id: 's1',
    title: 'T',
    artist: 'A',
    artistId: 'a1',
    thumbnail: 'http://img/x.jpg',
    duration: 200,
    ...over,
  };
}

describe('clampVolume (app.ts applyVol ile birebir)', () => {
  it('0..100 aralığına kıstırır ve yuvarlar', () => {
    expect(clampVolume(80.4)).toBe(80);
    expect(clampVolume(80.5)).toBe(81);
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(142)).toBe(100);
    expect(clampVolume(0)).toBe(0);
  });
});

describe('volumeTier (updateVolumeSliderBg ikon dalları)', () => {
  it('0 → muted, <50 → low, >=50 → high', () => {
    expect(volumeTier(0)).toBe('muted');
    expect(volumeTier(1)).toBe('low');
    expect(volumeTier(49)).toBe('low');
    expect(volumeTier(50)).toBe('high');
    expect(volumeTier(100)).toBe('high');
  });
});

describe('volumeStepTo / muteToggleTarget', () => {
  it('tekerlek adımı (+5/-5) kıstırılır', () => {
    expect(volumeStepTo(80, 5)).toBe(85);
    expect(volumeStepTo(98, 5)).toBe(100);
    expect(volumeStepTo(2, -5)).toBe(0);
  });
  it('mute: ses>0 → 0, yoksa lastVolume||80', () => {
    expect(muteToggleTarget(60, 60)).toBe(0);
    expect(muteToggleTarget(0, 42)).toBe(42);
    expect(muteToggleTarget(0, 0)).toBe(80);
  });
});

describe('seekFraction / seekTimeFor (scrubber matematiği)', () => {
  it('oranı 0..1 aralığına kıstırır', () => {
    expect(seekFraction(50, 0, 100)).toBeCloseTo(0.5);
    expect(seekFraction(-10, 0, 100)).toBe(0);
    expect(seekFraction(150, 0, 100)).toBe(1);
    expect(seekFraction(10, 0, 0)).toBe(0);
  });
  it('süre yoksa null, varsa oran*süre', () => {
    expect(seekTimeFor(0.5, 0)).toBeNull();
    expect(seekTimeFor(0.5, 200)).toBeCloseTo(100);
    expect(seekTimeFor(1, 200)).toBe(200);
  });
  it('klavye/medya hedefi 0..duration kıstırılır, süre yoksa current', () => {
    expect(clampSeekTarget(50, -5, 200)).toBe(45);
    expect(clampSeekTarget(2, -10, 200)).toBe(0);
    expect(clampSeekTarget(198, 10, 200)).toBe(200);
    expect(clampSeekTarget(30, -10, 0)).toBe(30);
    expect(keySeekStep(true)).toBe(10);
    expect(keySeekStep(false)).toBe(5);
  });
});

describe('playIconVisibility / likeFill', () => {
  it('çalıyor → play gizli, pause görünür', () => {
    expect(playIconVisibility(true)).toEqual({ play: 'none', pause: 'block' });
    expect(playIconVisibility(false)).toEqual({ play: 'block', pause: 'none' });
  });
  it('like dolgusu', () => {
    expect(likeFill(true)).toBe('currentColor');
    expect(likeFill(false)).toBe('none');
  });
});

describe('applyLikeToggle (toggleLike saf Set/Map kısmı)', () => {
  it('beğenilmemiş → ekler ve true döner; beğenilmiş → siler ve false döner', () => {
    const slice = { liked: new Set<string>(), likedSongsMap: {} as Record<string, Song> };
    const song = mkSong({ id: 'x' });
    expect(applyLikeToggle(slice, 'x', song)).toBe(true);
    expect(slice.liked.has('x')).toBe(true);
    expect(slice.likedSongsMap['x']).toBe(song);
    expect(applyLikeToggle(slice, 'x')).toBe(false);
    expect(slice.liked.has('x')).toBe(false);
    expect(slice.likedSongsMap['x']).toBeUndefined();
  });
  it('şarkı yoksa map yazılmaz ama set eklenir', () => {
    const slice = { liked: new Set<string>(), likedSongsMap: {} as Record<string, Song> };
    expect(applyLikeToggle(slice, 'y')).toBe(true);
    expect(slice.liked.has('y')).toBe(true);
    expect(slice.likedSongsMap['y']).toBeUndefined();
  });
});

describe('isTypingTarget / resolveKeyAction (klavye haritası)', () => {
  it('INPUT/TEXTAREA guard', () => {
    expect(isTypingTarget('INPUT')).toBe(true);
    expect(isTypingTarget('TEXTAREA')).toBe(true);
    expect(isTypingTarget('DIV')).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
  it('code → aksiyon haritası app.ts ile birebir', () => {
    expect(resolveKeyAction('Space', { ctrlKey: false })).toBe('togglePlay');
    expect(resolveKeyAction('ArrowLeft', { ctrlKey: true })).toBe('prev');
    expect(resolveKeyAction('ArrowLeft', { ctrlKey: false })).toBe('seekBack');
    expect(resolveKeyAction('ArrowRight', { ctrlKey: true })).toBe('next');
    expect(resolveKeyAction('ArrowRight', { ctrlKey: false })).toBe('seekFwd');
    expect(resolveKeyAction('ArrowUp', { ctrlKey: false })).toBe('volUp');
    expect(resolveKeyAction('ArrowDown', { ctrlKey: false })).toBe('volDown');
    expect(resolveKeyAction('KeyN', { ctrlKey: false })).toBe('next');
    expect(resolveKeyAction('KeyP', { ctrlKey: false })).toBe('prev');
    expect(resolveKeyAction('KeyL', { ctrlKey: false })).toBe('like');
    expect(resolveKeyAction('KeyQ', { ctrlKey: false })).toBe('queue');
    expect(resolveKeyAction('KeyT', { ctrlKey: false })).toBe('lyrics');
    expect(resolveKeyAction('KeyM', { ctrlKey: false })).toBe('mute');
    expect(resolveKeyAction('KeyS', { ctrlKey: false })).toBe('shuffle');
    expect(resolveKeyAction('KeyR', { ctrlKey: false })).toBe('repeat');
    expect(resolveKeyAction('KeyF', { ctrlKey: false })).toBe('maximize');
    expect(resolveKeyAction('Escape', { ctrlKey: false })).toBe('escape');
    expect(resolveKeyAction('KeyZ', { ctrlKey: false })).toBeNull();
  });
});

describe('isRepeatActive / isRepeatOne', () => {
  it('off pasif, all/one aktif; one rozet dalı', () => {
    expect(isRepeatActive('off')).toBe(false);
    expect(isRepeatActive('all')).toBe(true);
    expect(isRepeatActive('one')).toBe(true);
    expect(isRepeatOne('one')).toBe(true);
    expect(isRepeatOne('all')).toBe(false);
    expect(isRepeatOne('off')).toBe(false);
  });
});
