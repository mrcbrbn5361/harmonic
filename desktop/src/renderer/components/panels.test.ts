import { describe, it, expect } from 'vitest';
import type { QueueItem } from './state';
import {
  resolvePanelToggle,
  contextMenuLikeLabel,
  buildContextMenuHtml,
  clampMenuPos,
  copyLinkFor,
  buildSyncedLyricsHtml,
  buildPlainLyricsHtml,
  buildLyricsHtml,
  parseSeekTime,
  shouldSyncLyric,
  hasLyricChanged,
  isStaleLyricResponse,
  QUEUE_EMPTY_HTML,
  isQueueEmpty,
  buildUserQueueSection,
  buildContextQueueSection,
  buildQueueHtml,
  queueIndexAfterUserPick,
  resolveContextQueuePick,
} from './panels';

function mkItem(over: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 's1',
    title: 'Title <b>',
    artist: 'Artist & Co',
    artistId: 'a1',
    thumbnail: 'http://img/x.jpg',
    duration: 125,
    ...over,
  } as QueueItem;
}

describe('resolvePanelToggle (setupPanels aç/kapat kararı)', () => {
  it('aynı panele tıklama kapatır', () => {
    expect(resolvePanelToggle('lyrics', 'lyrics')).toBeNull();
    expect(resolvePanelToggle('queue', 'queue')).toBeNull();
  });
  it('farklı panel / kapalıyken tıklama hedefi açar', () => {
    expect(resolvePanelToggle('lyrics', 'queue')).toBe('queue');
    expect(resolvePanelToggle('queue', 'lyrics')).toBe('lyrics');
    expect(resolvePanelToggle(null, 'lyrics')).toBe('lyrics');
    expect(resolvePanelToggle(null, 'queue')).toBe('queue');
  });
});

describe('context menu (showContextMenu saf kısmı)', () => {
  it('beğeni etiketi kayıt durumuna göre değişir', () => {
    expect(contextMenuLikeLabel(true)).toBe('Beğeniyi Kaldır');
    expect(contextMenuLikeLabel(false)).toBe('Beğeniye Ekle');
  });
  it('menü HTML aksiyonları ve beğeni dalını içerir', () => {
    const liked = buildContextMenuHtml(true);
    const unliked = buildContextMenuHtml(false);
    for (const html of [liked, unliked]) {
      expect(html).toContain('data-action="play"');
      expect(html).toContain('data-action="playNext"');
      expect(html).toContain('data-action="addToQueue"');
      expect(html).toContain('data-action="addToPlaylist"');
      expect(html).toContain('data-action="copyLink"');
    }
    expect(liked).toContain('Beğeniyi Kaldır');
    expect(unliked).toContain('Beğeniye Ekle');
  });
  it('konum taşmayı 200x250 ile kıstırır', () => {
    expect(clampMenuPos(100, 100, 1000, 800)).toEqual({ left: 100, top: 100 });
    expect(clampMenuPos(900, 100, 1000, 800)).toEqual({ left: 800, top: 100 });
    expect(clampMenuPos(100, 700, 1000, 800)).toEqual({ left: 100, top: 550 });
    expect(clampMenuPos(950, 750, 1000, 800)).toEqual({ left: 800, top: 550 });
  });
  it('paylaşım URL üretir', () => {
    expect(copyLinkFor('abc123')).toBe('https://music.youtube.com/watch?v=abc123');
  });
});

describe('lyrics html (renderLyricsContent dalları)', () => {
  it('senkronlu satırlar time/idx taşır, boş metin &nbsp; olur', () => {
    const html = buildSyncedLyricsHtml([
      { time: 12.5, text: 'Merhaba <dünya>' },
      { time: 15, text: '' },
    ]);
    expect(html).toContain('data-time="12.5"');
    expect(html).toContain('data-idx="0"');
    expect(html).toContain('Merhaba &lt;dünya&gt;');
    expect(html).toContain('&nbsp;');
  });
  it('düzyazı satırları kaçırır, boş satır &nbsp; olur', () => {
    const html = buildPlainLyricsHtml('nakarat <x>\n\nson');
    expect(html).toContain('nakarat &lt;x&gt;');
    expect(html).toContain('son');
    expect(html).toContain('&nbsp;');
  });
  it('parsed varsa synced, yoksa düz dal seçilir', () => {
    const synced = buildLyricsHtml('a\nb', [{ time: 1, text: 'x' }]);
    expect(synced).toContain('synced');
    const plain = buildLyricsHtml('a\nb', []);
    expect(plain).not.toContain('synced');
    expect(plain).toContain('class="lyric-line"');
  });
});

describe('lyrics etkileşim guardları', () => {
  it('parseSeekTime: geçerli sayı, tanımsız → 0, geçersiz → null', () => {
    expect(parseSeekTime('12.5')).toBe(12.5);
    expect(parseSeekTime('0')).toBe(0);
    expect(parseSeekTime(undefined)).toBe(0);
    expect(parseSeekTime(null)).toBe(0);
    expect(parseSeekTime('abc')).toBeNull();
  });
  it('shouldSyncLyric: söz + lyrics paneli açıkken true', () => {
    expect(shouldSyncLyric(2, 'lyrics')).toBe(true);
    expect(shouldSyncLyric(0, 'lyrics')).toBe(false);
    expect(shouldSyncLyric(2, 'queue')).toBe(false);
    expect(shouldSyncLyric(2, null)).toBe(false);
    expect(shouldSyncLyric(0, null)).toBe(false);
  });
  it('hasLyricChanged ve stale kararı', () => {
    expect(hasLyricChanged(1, 1)).toBe(false);
    expect(hasLyricChanged(1, 2)).toBe(true);
    expect(isStaleLyricResponse('a', 'a')).toBe(false);
    expect(isStaleLyricResponse('b', 'a')).toBe(true);
    expect(isStaleLyricResponse(undefined, 'a')).toBe(true);
  });
});

describe('queue html (renderQueue dalları)', () => {
  it('iki liste boşsa boş görünüm', () => {
    expect(isQueueEmpty(0, 0)).toBe(true);
    expect(isQueueEmpty(1, 0)).toBe(false);
    expect(isQueueEmpty(0, 2)).toBe(false);
    expect(isQueueEmpty(1, 1)).toBe(false);
    expect(buildQueueHtml([], 0, [], 'Bağlam')).toBe(QUEUE_EMPTY_HTML);
    expect(QUEUE_EMPTY_HTML).toContain('Sıra boş');
  });
  it('kullanıcı bölümü meta/süre/idx taşır ve kaçırır', () => {
    const html = buildUserQueueSection([mkItem()]);
    expect(html).toContain('Sıradaki Şarkılar');
    expect(html).toContain('data-type="user"');
    expect(html).toContain('data-idx="0"');
    expect(html).toContain('Title &lt;b&gt;');
    expect(html).toContain('2:05');
  });
  it('bağlam bölümü etiketi kaçırır', () => {
    const html = buildContextQueueSection([mkItem({ id: 'c1' })], 'Bağlam <x>');
    expect(html).toContain('Bağlam &lt;x&gt;');
    expect(html).toContain('data-type="context"');
  });
  it('kullanıcı + bağlam birlikte kurulur', () => {
    const html = buildQueueHtml(
      [mkItem({ id: 'u1' })],
      2,
      [mkItem({ id: 'c1', title: 'Ctx' })],
      'Albüm',
    );
    expect(html).toContain('Sıradaki Şarkılar');
    expect(html).toContain('Ctx');
    expect(html).toContain('Albüm');
  });
  it('yalnız kullanıcı kuyruğu bağlam bölümsüz kurulur', () => {
    const html = buildQueueHtml([mkItem({ id: 'u1' })], 0, [], 'Bağlam');
    expect(html).toContain('Sıradaki Şarkılar');
    expect(html).not.toContain('data-type="context"');
  });
  it('bağlam var ama upcoming boşsa boş görünüme düşer', () => {
    expect(buildQueueHtml([], 3, [], 'Bağlam')).toBe(QUEUE_EMPTY_HTML);
  });
});

describe('queue seçim kararları', () => {
  it('kullanıcı seçiminde kuyruk bir geri kayar', () => {
    expect(queueIndexAfterUserPick(0)).toBe(-1);
    expect(queueIndexAfterUserPick(2)).toBe(1);
  });
  it('bağlam seçimi dilimden okunur', () => {
    const up = [mkItem({ id: 'c1' }), mkItem({ id: 'c2' })];
    expect(resolveContextQueuePick(up, 1)?.id).toBe('c2');
    expect(resolveContextQueuePick(up, 5)).toBeUndefined();
  });
});
