// P3-02: fetchLRCLIB sorgu zinciri (orijinal başlık → temizlenmiş varyant → arama yedeği)
// cleanTitle/fallback mock-fetch ile test edilir; gerçek ağ/electron-store'a dokunulmaz.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lyricsProvider } from './lyrics-provider';

vi.mock('electron-store', () => {
  const data = new Map<string, unknown>();
  return {
    default: class MockStore {
      get(key: string): unknown {
        return data.get(key);
      }
      set(key: string, value: unknown): void {
        data.set(key, value);
      }
    }
  };
});

vi.mock('../api/client-versions', () => ({ lrclibUA: () => 'test-ua' }));

interface FetchCall {
  url: string;
  signal: unknown;
}

let calls: FetchCall[] = [];
let responder: (url: string, index: number) => unknown = () => null;

beforeEach(() => {
  calls = [];
  responder = () => null;
  lyricsProvider.setEnabled(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, signal: init?.signal });
      return { ok: true, json: async () => responder(u, calls.length - 1) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchLRCLIB sorgu zinciri (P3-02)', () => {
  it('orijinal başlık önce denenir, temizlenmiş varyant sonra (ft/feat korunur)', async () => {
    responder = () => null;
    const res = await lyricsProvider.fetchLRCLIB('Dance Monkey ft. Tones and I (Official Video)', 'Tones and I - Topic', 210);
    expect(res).toBeNull();
    const urls = calls.map((c) => c.url);
    expect(urls).toHaveLength(5);
    const raw = encodeURIComponent('Dance Monkey ft. Tones and I (Official Video)');
    const clean = encodeURIComponent('Dance Monkey');
    const artist = encodeURIComponent('Tones and I');
    expect(urls[0]).toBe(`https://lrclib.net/api/get?track_name=${raw}&artist_name=${artist}&duration=210`);
    expect(urls[1]).toBe(`https://lrclib.net/api/get?track_name=${raw}&artist_name=${artist}`);
    expect(urls[2]).toBe(`https://lrclib.net/api/get?track_name=${clean}&artist_name=${artist}&duration=210`);
    expect(urls[3]).toBe(`https://lrclib.net/api/get?track_name=${clean}&artist_name=${artist}`);
    expect(urls[4]).toBe(`https://lrclib.net/api/search?q=${encodeURIComponent('Tones and I Dance Monkey')}`);
  });

  it('orijinal == temizlenmişse orijinal sorguları atlanır (tek tur, gereksiz istek yok)', async () => {
    responder = () => null;
    await lyricsProvider.fetchLRCLIB('Shape of You', 'Ed Sheeran', 234);
    const urls = calls.map((c) => c.url);
    expect(urls).toHaveLength(3);
    const clean = encodeURIComponent('Shape of You');
    const artist = encodeURIComponent('Ed Sheeran');
    expect(urls[0]).toBe(`https://lrclib.net/api/get?track_name=${clean}&artist_name=${artist}&duration=234`);
    expect(urls[1]).toBe(`https://lrclib.net/api/get?track_name=${clean}&artist_name=${artist}`);
    expect(urls[2]).toBe(`https://lrclib.net/api/search?q=${encodeURIComponent('Ed Sheeran Shape of You')}`);
  });

  it('orijinal başlıkla ilk sorgu eşleşirse erken döner (tek istek)', async () => {
    responder = (_u, i) => (i === 0 ? { syncedLyrics: '[00:01.00] test' } : null);
    const res = await lyricsProvider.fetchLRCLIB('Song ft. X', 'Artist', 100);
    expect(res).toBe('[00:01.00] test');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(encodeURIComponent('Song ft. X'));
  });

  it('temizlenmiş varyantla eşleşirse düz söz döner', async () => {
    responder = (_u, i) => (i === 2 ? { plainLyrics: 'plain' } : null);
    const res = await lyricsProvider.fetchLRCLIB('Song ft. X', 'Artist', 100);
    expect(res).toBe('plain');
    expect(calls).toHaveLength(3);
  });

  it('arama uç noktası yedeği senkronize öğeyi tercih eder', async () => {
    responder = (_u, i) => {
      if (i < 4) return null;
      return [{ plainLyrics: 'p1' }, { syncedLyrics: '[00:01] best' }, { plainLyrics: 'p2' }];
    };
    const res = await lyricsProvider.fetchLRCLIB('Song ft. X', 'Artist', 100);
    expect(res).toBe('[00:01] best');
  });

  it('arama yedeğinde senkronize yoksa ilk öğe döner', async () => {
    responder = (_u, i) => {
      if (i < 4) return null;
      return [{ plainLyrics: 'first-plain' }, { plainLyrics: 'second' }];
    };
    const res = await lyricsProvider.fetchLRCLIB('Song ft. X', 'Artist', 100);
    expect(res).toBe('first-plain');
  });

  it('zincir boyunca hata/null olursa null ile biter', async () => {
    responder = () => {
      throw new Error('net');
    };
    const res = await lyricsProvider.fetchLRCLIB('Song ft. X', 'Artist', 100);
    expect(res).toBeNull();
    expect(calls).toHaveLength(5);
  });

  it('istekler AbortController sinyali taşır (8sn tavan kodu durur)', async () => {
    responder = () => null;
    await lyricsProvider.fetchLRCLIB('Song', 'Artist', 100);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('duration <= 0 ise süreli sorgular atlanır', async () => {
    responder = () => null;
    await lyricsProvider.fetchLRCLIB('Song ft. X', 'Artist', 0);
    const urls = calls.map((c) => c.url);
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => !u.includes('duration='))).toBe(true);
    expect(urls[2]).toContain('/api/search');
  });

  it('temizlenebilir başlık tamamen silinirse istek yapılmaz', async () => {
    responder = () => null;
    const res = await lyricsProvider.fetchLRCLIB('(Audio)', 'Artist', 50);
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('cleanTitle parantez varyantlarını siler (Official/Lyrics/Audio/Visualizer/Clip Officiel/Video Oficial)', async () => {
    responder = () => null;
    await lyricsProvider.fetchLRCLIB('Song (Official Music Video) (Lyrics) (Visualizer) (Clip Officiel) (Video Oficial)', 'Artist', 50);
    const urls = calls.map((c) => c.url);
    expect(urls[2]).toContain(`track_name=${encodeURIComponent('Song')}&`);
  });
});

describe('LyricsProvider ayarları ve fetch delegasyonu', () => {
  it('isEnabled/setEnabled ayarları yuvarlar', () => {
    lyricsProvider.setEnabled(false);
    expect(lyricsProvider.isEnabled()).toBe(false);
    lyricsProvider.setEnabled(true);
    expect(lyricsProvider.isEnabled()).toBe(true);
  });

  it('fetch LRCLIB\u0027e delege eder, boşsa ytApi.getLyrics yedeğine düşer', async () => {
    responder = () => null;
    const ytApi = { getLyrics: vi.fn(async () => 'yt-lyrics') };
    const res = await lyricsProvider.fetch('vid1', ytApi, 'Song', 'Artist', 100);
    expect(res).toBe('yt-lyrics');
    expect(calls.length).toBeGreaterThan(0);
    expect(ytApi.getLyrics).toHaveBeenCalledWith('vid1');

    const throwing = { getLyrics: async () => { throw new Error('no'); } };
    const res2 = await lyricsProvider.fetch('vid1', throwing, 'Song', 'Artist', 100);
    expect(res2).toBeNull();
  });

  it('fetch etkin değilse null döner (istek yapılmaz)', async () => {
    lyricsProvider.setEnabled(false);
    const ytApi = { getLyrics: vi.fn(async () => 'yt-lyrics') };
    const res = await lyricsProvider.fetch('vid1', ytApi, 'Song', 'Artist', 100);
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
    expect(ytApi.getLyrics).not.toHaveBeenCalled();
  });

  it('fetch title yoksa doğrudan ytApi.getLyrics\u0027e gider', async () => {
    const ytApi = { getLyrics: vi.fn(async () => 'yt-only') };
    const res = await lyricsProvider.fetch('vid1', ytApi);
    expect(res).toBe('yt-only');
    expect(calls).toHaveLength(0);
  });
});
