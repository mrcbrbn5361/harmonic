import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  api,
  getApi,
  setApi,
  dlog,
  ytSearch,
  ytPlayer,
  ytHome,
  ytSuggestions,
  ytLyrics,
  ytNext,
  ytBrowse,
  storeGet,
  storeSet,
  playerSeek,
  playerSetVolume,
  playerPause,
  playerResume
} from './api-client';

describe('api-client', () => {
  beforeEach(() => {
    setApi(null);
  });

  describe('getApi & setApi & api proxy', () => {
    it('mock olmadığında ve window olmadığında undefined döner', () => {
      expect(getApi()).toBeUndefined();
      expect(api.youtube).toBeUndefined();
    });

    it('setApi ile mock atanabilir ve api proxy üzerinden erişilebilir', () => {
      const mockApi: Record<string, any> = {
        testVal: 42,
        youtube: { search: vi.fn() }
      };
      setApi(mockApi);
      expect(getApi()).toBe(mockApi);
      expect(api.testVal).toBe(42);
      expect(api.youtube).toBe(mockApi.youtube);

      // Proxy set tuzağı
      api.customField = 'hello';
      expect(mockApi['customField']).toBe('hello');
    });

    it('raw api yokken api proxy set işlemi target üzerine yazar', () => {
      setApi(null);
      api.foo = 'bar';
      expect(api.foo).toBe('bar');
    });

    it('window tanımlıysa window.api döner', () => {
      setApi(null);
      (globalThis as any).window = { api: { fromWindow: true } };
      expect(getApi()).toEqual({ fromWindow: true });
      delete (globalThis as any).window;
    });
  });

  describe('dlog', () => {
    it('argümanları serialize edip debugLog çağırır', () => {
      const debugLog = vi.fn();
      setApi({ debugLog });

      dlog('hello', { a: 1 }, 123);
      expect(debugLog).toHaveBeenCalledWith('hello {"a":1} 123');
    });

    it('circular objelerde çökmez ve debugLog hatasında sessiz kalır', () => {
      const debugLog = vi.fn().mockImplementation(() => {
        throw new Error('IPC failed');
      });
      setApi({ debugLog });

      const circular: any = {};
      circular.self = circular;

      expect(() => dlog('circular:', circular)).not.toThrow();
      expect(debugLog).toHaveBeenCalled();
    });

    it('raw api veya debugLog fonksiyonu yokken çökmez', () => {
      setApi({});
      expect(() => dlog('test')).not.toThrow();
      setApi(null);
      expect(() => dlog('test')).not.toThrow();
    });
  });

  describe('ytSearch', () => {
    it('başarılı aramada sonuçları döner', async () => {
      const mockResult = {
        songs: [{ id: 's1' }],
        videos: [],
        albums: []
      };
      setApi({
        youtube: {
          search: vi.fn().mockResolvedValue(mockResult)
        }
      });

      const res = await ytSearch('test query');
      expect(res).toEqual(mockResult);
    });

    it('hata durumunda boş koleksiyon fallbacki döner', async () => {
      setApi({
        youtube: {
          search: vi.fn().mockRejectedValue(new Error('Network error'))
        }
      });

      const res = await ytSearch('fail query');
      expect(res).toEqual({ songs: [], videos: [], albums: [], artists: [], playlists: [] });
    });
  });

  describe('ytPlayer', () => {
    it('başarılı sonuç döner', async () => {
      const mockResult = { streamUrl: 'https://stream.url', title: 'Song' };
      setApi({
        debugLog: vi.fn(),
        youtube: {
          player: vi.fn().mockResolvedValue(mockResult)
        }
      });

      const res = await ytPlayer('vid1');
      expect(res).toEqual(mockResult);
    });

    it('hata durumunda null döner', async () => {
      setApi({
        debugLog: vi.fn(),
        youtube: {
          player: vi.fn().mockRejectedValue(new Error('Not found'))
        }
      });

      const res = await ytPlayer('vid_fail');
      expect(res).toBeNull();
    });
  });

  describe('ytHome', () => {
    it('başarılı sonuç döner', async () => {
      const mockResult = { items: [{ id: 'h1' }] };
      setApi({
        youtube: {
          home: vi.fn().mockResolvedValue(mockResult)
        }
      });

      const res = await ytHome();
      expect(res).toEqual(mockResult);
    });

    it('hata durumunda items: [] döner', async () => {
      setApi({
        youtube: {
          home: vi.fn().mockRejectedValue(new Error('Failed'))
        }
      });

      const res = await ytHome();
      expect(res).toEqual({ items: [] });
    });
  });

  describe('ytSuggestions', () => {
    it('başarılı önerileri döner', async () => {
      setApi({
        youtube: {
          suggestions: vi.fn().mockResolvedValue(['a', 'b'])
        }
      });

      const res = await ytSuggestions('query');
      expect(res).toEqual(['a', 'b']);
    });

    it('hata durumunda boş dizi döner', async () => {
      setApi({
        youtube: {
          suggestions: vi.fn().mockRejectedValue(new Error('Failed'))
        }
      });

      const res = await ytSuggestions('query');
      expect(res).toEqual([]);
    });
  });

  describe('ytLyrics', () => {
    it('başarılı sözleri döner', async () => {
      setApi({
        youtube: {
          lyrics: vi.fn().mockResolvedValue('Lyrics text')
        }
      });

      const res = await ytLyrics('vid1', 'title', 'artist', 120);
      expect(res).toBe('Lyrics text');
    });

    it('hata durumunda null döner', async () => {
      setApi({
        youtube: {
          lyrics: vi.fn().mockRejectedValue(new Error('No lyrics'))
        }
      });

      const res = await ytLyrics('vid1');
      expect(res).toBeNull();
    });

    it('api null dönerse varsayılan fallback değerleri döner', async () => {
      setApi({
        youtube: {
          search: vi.fn().mockResolvedValue(null),
          home: vi.fn().mockResolvedValue(null),
          suggestions: vi.fn().mockResolvedValue(null),
          lyrics: vi.fn().mockResolvedValue(null)
        }
      });
      expect(await ytSearch('q')).toEqual({ songs: [], videos: [], albums: [], artists: [], playlists: [] });
      expect(await ytHome()).toEqual({ items: [] });
      expect(await ytSuggestions('q')).toEqual([]);
      expect(await ytLyrics('v')).toBeNull();
    });
  });

  describe('ytNext & ytBrowse', () => {
    it('ytNext başarılı çağrı ve hata yönetimi', async () => {
      const nextFn = vi.fn().mockResolvedValue({ items: [{ id: 'n1' }] });
      setApi({ youtube: { next: nextFn }, debugLog: vi.fn() });

      const res = await ytNext('vid1', 'list1');
      expect(res).toEqual({ items: [{ id: 'n1' }] });
      expect(nextFn).toHaveBeenCalledWith('vid1', 'list1');

      setApi({
        youtube: { next: vi.fn().mockRejectedValue(new Error('Next error')) },
        debugLog: vi.fn()
      });
      const failRes = await ytNext('vid1');
      expect(failRes).toBeNull();
    });

    it('ytBrowse başarılı çağrı ve hata yönetimi', async () => {
      const browseFn = vi.fn().mockResolvedValue({ sections: [] });
      setApi({ youtube: { browse: browseFn }, debugLog: vi.fn() });

      const res = await ytBrowse('FEmusic_home', 'param1');
      expect(res).toEqual({ sections: [] });
      expect(browseFn).toHaveBeenCalledWith('FEmusic_home', 'param1');

      setApi({
        youtube: { browse: vi.fn().mockRejectedValue(new Error('Browse error')) },
        debugLog: vi.fn()
      });
      const failRes = await ytBrowse('bad_id');
      expect(failRes).toBeNull();
    });
  });

  describe('storeGet & storeSet', () => {
    it('store verisi okur ve yazar', async () => {
      const storeData: Record<string, any> = { volume: 80 };
      setApi({
        store: {
          get: vi.fn().mockImplementation((k: string) => Promise.resolve(storeData[k])),
          set: vi.fn().mockImplementation((k: string, v: any) => {
            storeData[k] = v;
            return Promise.resolve();
          })
        }
      });

      const vol = await storeGet<number>('volume');
      expect(vol).toBe(80);

      await storeSet('volume', 90);
      expect(storeData.volume).toBe(90);
    });

    it('store hata durumlarında sessiz kalır', async () => {
      setApi({
        store: {
          get: vi.fn().mockRejectedValue(new Error('Store read fail')),
          set: vi.fn().mockRejectedValue(new Error('Store write fail'))
        }
      });

      const val = await storeGet('unknown');
      expect(val).toBeUndefined();

      await expect(storeSet('key', 'val')).resolves.not.toThrow();
    });
  });

  describe('player helpers (seek, setVolume, pause, resume)', () => {
    it('player fonksiyonlarını çağırır ve hataları sessizce yutar', async () => {
      const seek = vi.fn().mockResolvedValue(undefined);
      const setVolume = vi.fn().mockResolvedValue(undefined);
      const pause = vi.fn().mockResolvedValue(undefined);
      const resume = vi.fn().mockResolvedValue(undefined);

      setApi({
        player: { seek, setVolume, pause, resume }
      });

      await playerSeek(30);
      expect(seek).toHaveBeenCalledWith(30);

      await playerSetVolume(0.5);
      expect(setVolume).toHaveBeenCalledWith(0.5);

      await playerPause();
      expect(pause).toHaveBeenCalled();

      await playerResume();
      expect(resume).toHaveBeenCalled();

      // Hata durumunda fırlatmaz
      setApi({
        player: {
          seek: vi.fn().mockRejectedValue(new Error('err')),
          setVolume: vi.fn().mockRejectedValue(new Error('err')),
          pause: vi.fn().mockRejectedValue(new Error('err')),
          resume: vi.fn().mockRejectedValue(new Error('err'))
        }
      });

      await expect(playerSeek(10)).resolves.not.toThrow();
      await expect(playerSetVolume(1)).resolves.not.toThrow();
      await expect(playerPause()).resolves.not.toThrow();
      await expect(playerResume()).resolves.not.toThrow();
    });
  });
});
