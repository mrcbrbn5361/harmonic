/* ============================================
   Harmonic - API Client (P0, streaming-only)
   Saf IPC sarmalayıcı modülü — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır.
   Offline/download kapsam dışıdır.
   ============================================ */

let customApi: any = null;

export function getApi(): any {
  if (customApi) return customApi;
  if (typeof window !== 'undefined') {
    return (window as any).api;
  }
  return undefined;
}

export function setApi(mockApi: any): void {
  customApi = mockApi;
}

export const api: any = new Proxy(
  {},
  {
    get(target, prop) {
      const raw = getApi();
      return raw ? raw[prop] : (target as any)[prop];
    },
    set(target, prop, value) {
      const raw = getApi();
      if (raw) {
        raw[prop] = value;
      } else {
        (target as any)[prop] = value;
      }
      return true;
    }
  }
);

/** Logları ana sürece gönder (stdout'tan izlenebilir) */
export function dlog(...args: any[]): void {
  const line = args
    .map((a) => {
      try {
        return typeof a === 'string' ? a : JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  console.log('[Harmonic]', line);
  try {
    const raw = getApi();
    if (raw && typeof raw.debugLog === 'function') {
      raw.debugLog(line);
    }
  } catch {}
}

export async function ytSearch(query: string) {
  try {
    const raw = getApi();
    const r = await raw?.youtube?.search(query);
    console.log(
      '[Renderer] Search result:',
      JSON.stringify({
        songs: r?.songs?.length,
        videos: r?.videos?.length,
        albums: r?.albums?.length
      })
    );
    return r ?? { songs: [], videos: [], albums: [], artists: [], playlists: [] };
  } catch (e) {
    console.error('[Renderer] Search error:', e);
    return { songs: [], videos: [], albums: [], artists: [], playlists: [] };
  }
}

export async function ytPlayer(videoId: string) {
  try {
    const raw = getApi();
    const r = await raw?.youtube?.player(videoId);
    dlog('Player sonucu:', { streamUrl: !!r?.streamUrl, title: r?.title });
    return r;
  } catch (e) {
    dlog('Player HATASI:', String(e));
    return null;
  }
}

export async function ytHome() {
  try {
    const raw = getApi();
    const r = await raw?.youtube?.home();
    console.log('[Renderer] Home result:', JSON.stringify({ items: r?.items?.length }));
    return r ?? { items: [] };
  } catch (e) {
    console.error('[Renderer] Home error:', e);
    return { items: [] };
  }
}

export async function ytSuggestions(input: string) {
  try {
    const raw = getApi();
    return (await raw?.youtube?.suggestions(input)) ?? [];
  } catch {
    return [];
  }
}

export async function ytLyrics(
  videoId: string,
  title?: string,
  artist?: string,
  duration?: number
) {
  try {
    const raw = getApi();
    return (await raw?.youtube?.lyrics(videoId, title, artist, duration)) ?? null;
  } catch {
    return null;
  }
}

export async function ytNext(videoId: string, playlistId?: string) {
  try {
    const raw = getApi();
    return await raw?.youtube?.next(videoId, playlistId);
  } catch (e) {
    dlog('ytNext HATASI:', String(e));
    return null;
  }
}

export async function ytBrowse(browseId: string, params?: string) {
  try {
    const raw = getApi();
    return await raw?.youtube?.browse(browseId, params);
  } catch (e) {
    dlog('ytBrowse HATASI:', String(e));
    return null;
  }
}

export async function storeGet<T = any>(key: string): Promise<T | undefined> {
  try {
    const raw = getApi();
    return await raw?.store?.get(key);
  } catch {
    return undefined;
  }
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  try {
    const raw = getApi();
    await raw?.store?.set(key, value);
  } catch {}
}

export async function playerSeek(seconds: number): Promise<void> {
  try {
    const raw = getApi();
    await raw?.player?.seek(seconds);
  } catch {}
}

export async function playerSetVolume(volumeRatio: number): Promise<void> {
  try {
    const raw = getApi();
    await raw?.player?.setVolume(volumeRatio);
  } catch {}
}

export async function playerPause(): Promise<void> {
  try {
    const raw = getApi();
    await raw?.player?.pause();
  } catch {}
}

export async function playerResume(): Promise<void> {
  try {
    const raw = getApi();
    await raw?.player?.resume();
  } catch {}
}
