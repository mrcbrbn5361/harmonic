import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  formatTime,
  parseLRC,
  sanitizeName,
  findActiveLyricIndex,
  resolveDisplayName,
  toHiResAvatar,
  getAvatarInitial,
  getUpcomingContext,
} from './views';
import type { QueueItem, Song } from './state';

function song(id: string): Song {
  return { id, title: id, artist: 'a', artistId: 'a', thumbnail: '', duration: 1 };
}

describe('escapeHtml', () => {
  it('null/undefined boş döner, özel karakterleri kaçırır', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('<a href="x">a&b\'c</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;a&amp;b&#39;c&lt;/a&gt;'
    );
  });

  it('sayıyı stringe çevirir', () => {
    expect(escapeHtml(42 as any)).toBe('42');
  });
});

describe('formatTime', () => {
  it('negatif/NaN/null geçersiz değerlerde 0:00', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(null as any)).toBe('0:00');
    expect(formatTime(undefined as any)).toBe('0:00');
    expect(formatTime(NaN, true)).toBe('00:00');
  });

  it('dakika:saniye pad eder', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(61, true)).toBe('01:01');
    expect(formatTime(3661)).toBe('61:01');
  });
});

describe('parseLRC', () => {
  it('boş girdide boş dizi', () => {
    expect(parseLRC('')).toEqual([]);
    expect(parseLRC(null as any)).toEqual([]);
  });

  it('zamanlı satırları ayrıştırıp sıralar', () => {
    const out = parseLRC('[00:10.00]hello\n[00:05.00]early\nplain line');
    expect(out.map((l) => l.text)).toEqual(['early', 'hello']);
    expect(out[0].time).toBeCloseTo(5, 5);
    expect(out[1].time).toBeCloseTo(10, 5);
  });

  it('çoklu etiketi aynı satırda çoğaltır', () => {
    const out = parseLRC('[00:01.00][00:02.00]repeat');
    expect(out).toHaveLength(2);
    expect(out[0].time).toBeCloseTo(1, 5);
    expect(out[1].time).toBeCloseTo(2, 5);
  });
});

describe('sanitizeName', () => {
  it('boş/kısa/menu kelimelerini eler', () => {
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName('a')).toBe('');
    expect(sanitizeName('  ')).toBe('');
    expect(sanitizeName('Guide')).toBe('');
    expect(sanitizeName('YouTube Music')).toBe('');
    expect(sanitizeName('  Gerçek İsim  ')).toBe('Gerçek İsim');
  });
});

describe('findActiveLyricIndex', () => {
  it('+0.3 toleransla son geçen satırı verir', () => {
    const lines = [
      { time: 1, text: 'a' },
      { time: 5, text: 'b' },
      { time: 10, text: 'c' },
    ];
    expect(findActiveLyricIndex([], 5)).toBe(-1);
    expect(findActiveLyricIndex(lines, 0)).toBe(-1);
    expect(findActiveLyricIndex(lines, 5)).toBe(1);
    expect(findActiveLyricIndex(lines, 9.8)).toBe(2);
    expect(findActiveLyricIndex(lines, 4.7)).toBe(1);
  });
});

describe('resolveDisplayName', () => {
  it('geçerli ismi, yoksa e-posta prefixini döner', () => {
    expect(resolveDisplayName(null)).toBe('');
    expect(resolveDisplayName({ name: 'Ada', email: 'ada@x.com' })).toBe('Ada');
    expect(resolveDisplayName({ name: 'x', email: 'ada@x.com' })).toBe('ada');
    expect(resolveDisplayName({ name: '', email: '' })).toBe('');
  });
});

describe('toHiResAvatar & getAvatarInitial', () => {
  it('avatar URL dönüşümü app.ts ile birebir', () => {
    expect(toHiResAvatar('https://img=s64')).toBe('https://img=s200');
    expect(getAvatarInitial('ada')).toBe('A');
    expect(getAvatarInitial('')).toBe('');
    expect(getAvatarInitial(null)).toBe('');
  });
});

describe('getUpcomingContext', () => {
  it('çalınandan sonrakileri, bulamazsa tamamını döner', () => {
    const q = [song('1'), song('2'), song('3')].map((s) => s as QueueItem);
    expect(getUpcomingContext(q, '2').map((s) => s.id)).toEqual(['3']);
    expect(getUpcomingContext(q, '9').map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(getUpcomingContext(q, null).map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(getUpcomingContext(q, '3')).toEqual([]);
  });
});
