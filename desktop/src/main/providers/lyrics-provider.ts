// ytmdesktop2 lyrics provider uyarlaması — LRCLIB + YouTube fallback
import Store from 'electron-store';
import { lrclibUA } from '../api/client-versions';

const s = new Store<{ lyricsEnabled: boolean }>({ name: 'harmonic-settings', defaults: { lyricsEnabled: true } });

export class LyricsProvider {
  isEnabled() { return s.get('lyricsEnabled') !== false; }
  setEnabled(v: boolean) { s.set('lyricsEnabled', v); }

  private cleanTitle(title: string): string {
    return (title || '')
      .replace(/\s*\(Official\s*(?:Music\s*)?(?:Video|Audio|Lyric\s*Video)\)/gi, '')
      .replace(/\s*\[Official\s*(?:Music\s*)?(?:Video|Audio|Lyric\s*Video)\]/gi, '')
      .replace(/\s*\(Lyrics\)/gi, '')
      .replace(/\s*\[Lyrics\]/gi, '')
      .replace(/\s*\(Audio\)/gi, '')
      .replace(/\s*\[Audio\]/gi, '')
      .replace(/\s*\(Visualizer\)/gi, '')
      .replace(/\s*\(Clip Officiel\)/gi, '')
      .replace(/\s*\(Video Oficial\)/gi, '')
      .replace(/\s*ft\..*$/gi, '')
      .replace(/\s*feat\..*$/gi, '')
      .trim();
  }

  // Asılı istek yok: tüm LRCLIB çağrıları timeout'lu (bk. P3-03).
  private async fetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': lrclibUA() }, signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async fetchLRCLIB(title: string, artist: string, duration?: number): Promise<string | null> {
    const cleanT = this.cleanTitle(title);
    const cleanA = (artist || '').replace(/\s*-\s*Topic$/i, '').trim();
    if (!cleanT) return null;

    // 1. Süre ile tam eşleşme
    if (duration && duration > 0) {
      const data = await this.fetchJson(
        `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanT)}&artist_name=${encodeURIComponent(cleanA)}&duration=${Math.round(duration)}`
      );
      if (data?.syncedLyrics) return data.syncedLyrics;
      if (data?.plainLyrics) return data.plainLyrics;
    }

    // 2. Süresiz eşleşme
    {
      const data = await this.fetchJson(
        `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanT)}&artist_name=${encodeURIComponent(cleanA)}`
      );
      if (data?.syncedLyrics) return data.syncedLyrics;
      if (data?.plainLyrics) return data.plainLyrics;
    }

    // 3. Arama uç noktası yedeği
    {
      const list: any = await this.fetchJson(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanA} ${cleanT}`.trim())}`
      );
      if (Array.isArray(list) && list.length > 0) {
        const best = list.find((item: any) => item.syncedLyrics) || list[0];
        if (best?.syncedLyrics) return best.syncedLyrics;
        if (best?.plainLyrics) return best.plainLyrics;
      }
    }

    return null;
  }

  async fetch(videoId: string, ytApi: any, title?: string, artist?: string, duration?: number): Promise<string | null> {
    if (!this.isEnabled()) return null;

    // 1) İlk tercih: LRCLIB (yüksek kaliteli senkronize veya düz sözler)
    if (title) {
      try {
        const lrc = await this.fetchLRCLIB(title, artist || '', duration);
        if (lrc) return lrc;
      } catch {}
    }

    // 2) Yedek: YouTube Music dahili API
    try {
      return await ytApi.getLyrics(videoId);
    } catch {
      return null;
    }
  }
}

export const lyricsProvider = new LyricsProvider();
