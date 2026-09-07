import { BrowserWindow } from 'electron';
import { MUSIC_PARTITION, CHROME_UA } from '../auth/music-auth';

// ── Gizli oynatıcı (artık tüm playback buradan) ─
// YouTube Music watch sayfasını gizli bir pencerede açarız.
// Ses AÇIK: kullanıcı reklam dahil tüm sesleri buradan duyar.
// Ana renderer'ın <audio> elementi yok — sadece metadata + kontrol IPC'si.

const WATCH_URL = 'https://music.youtube.com/watch?v=';
const POLL_MS = 1200;

interface PlaybackUpdate {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  isAd: boolean;
  src: string;
}

type UpdateListener = (u: PlaybackUpdate) => void;

// Shadow DOM derin araması + video element bulma + metadata.
// ÖNCE YouTube'un resmi movie_player API'si denenir (en güvenilir yol),
// bulunamazsa Shadow DOM içindeki <video> elementine düşülür.
const RESOLVE_MEDIA_JS = `(() => {
  try {
    const findPlayer = () => {
      if (window.__hmp && window.__hmp.isConnected) return window.__hmp;
      let mp = null;
      try { mp = document.getElementById('movie_player'); } catch {}
      if (!mp) {
        const walk = (root) => {
          try { const m = root.getElementById('movie_player'); if (m) return m; } catch {}
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) { const r = walk(el.shadowRoot); if (r) return r; }
          }
          return null;
        };
        mp = walk(document);
      }
      if (mp) window.__hmp = mp;
      return mp;
    };
    const mp = findPlayer();
    const hasApi = !!(mp && typeof mp.getPlayerState === 'function');

    // --- 1) movie_player API yolu (tercih edilen) ---
    if (hasApi) {
      let isAd = false;
      try { if (typeof mp.getAdState === 'function' && mp.getAdState() === 1) isAd = true; } catch {}
      if (!isAd && mp.classList && mp.classList.contains('ad-showing')) isAd = true;
      let vd = null;
      try { vd = mp.getVideoData ? mp.getVideoData() : null; } catch {}
      let cur = 0, dur = 0, pstate = -1;
      try { cur = mp.getCurrentTime ? mp.getCurrentTime() : 0; } catch {}
      try { dur = mp.getDuration ? mp.getDuration() : 0; } catch {}
      try { pstate = mp.getPlayerState ? mp.getPlayerState() : -1; } catch {}
      let src = '';
      try {
        const el = mp.querySelector('video') || mp.querySelector('audio');
        if (el) src = el.currentSrc || el.src || '';
      } catch {}
      const vid = (vd && vd.video_id) || '';
      return {
        ok: true, via: 'api',
        currentTime: cur || 0,
        duration: dur || 0,
        paused: pstate !== 1,
        playerState: pstate,
        isAd,
        src,
        title: (vd && vd.title) || '',
        artist: (vd && vd.author) || '',
        thumbnail: vid ? ('https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg') : '',
        videoId: vid
      };
    }

    // --- 2) Yedek: Shadow DOM <video> taraması ---
    const getMedia = () => {
      if (window.__hmedia && window.__hmedia.isConnected) return window.__hmedia;
      let el = mp ? (mp.querySelector('video') || mp.querySelector('audio')) : null;
      if (!el) {
        const walkM = (root) => {
          for (const tag of ['video', 'audio']) {
            const list = root.querySelectorAll(tag);
            if (list.length) return list[0];
          }
          for (const e of root.querySelectorAll('*')) {
            if (e.shadowRoot) { const r = walkM(e.shadowRoot); if (r) return r; }
          }
          return null;
        };
        el = walkM(document);
      }
      if (el) window.__hmedia = el;
      return el;
    };
    const el = getMedia();
    if (!el) return { ok: false };
    let isAd = false;
    if (mp && mp.classList && mp.classList.contains('ad-showing')) isAd = true;

    // Metadata: önce ytmusic-player-bar dene, sonra document.title parse
    let title = '', artist = '', thumbnail = '';
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
      const tEl = playerBar.querySelector('.title, .byline + .title');
      const bEl = playerBar.querySelector('.byline');
      const imgEl = playerBar.querySelector('img.thumb, .thumbnail img, img');
      if (tEl) title = (tEl.textContent || '').trim();
      if (bEl) {
        const t = (bEl.textContent || '').trim();
        const parts = t.split('•').map((s) => s.trim());
        artist = parts[0] || t;
      }
      if (imgEl) thumbnail = imgEl.currentSrc || imgEl.src || '';
    }
    // Yedek: document.title'dan parse et ("Şarkı - Sanatçı | YouTube Music" veya "Şarkı | Sanatçı, Kanal, 100 Mn kez dinlendi - YouTube Music")
    if (!title || !artist) {
      const docTitle = (document.title || '').trim();
      // Sondaki " - YouTube Music" veya " | YouTube Music" kaldır
      let cleaned = docTitle.replace(/\s*[|\-–]\s*YouTube Music\s*$/i, '').trim();
      // Sık formatlar:
      //   "Şarkı Adı • Sanatçı • Albüm"
      //   "Şarkı Adı | Sanatçı, Kanal, 100 Mn kez dinlendi"
      //   "Sanatçı - Şarkı"
      let parts = cleaned.split(/\s*[|•]\s*/).map((s) => s.trim()).filter(Boolean);
      // Sondaki "X Mn/B kez dinlendi" veya "X views" gibi metadata'ları at
      parts = parts.filter((p) => !/kez dinlen|views|görüntüleme|izlenme|abone|subscribe/i.test(p));
      if (parts.length >= 2) {
        // Eğer ilk parça kısa (< 30) ve "single word" ise muhtemelen sanatçı
        // Genelde YT Music'te format: "Sanatçı - Şarkı"
        const dashIdx = cleaned.indexOf(' - ');
        if (dashIdx > 0) {
          artist = cleaned.substring(0, dashIdx).trim();
          title = cleaned.substring(dashIdx + 3).trim();
          // title'da kanal/izlenme varsa ayır
          const titleParts = title.split(/\s*[|,]\s*/);
          title = titleParts[0].trim();
        } else {
          title = parts[0];
          artist = parts[1];
        }
      } else if (parts.length === 1) {
        title = parts[0];
      }
    }
    // Thumbnail yedek: video element'in poster'ı veya i.ytimg.com
    if (!thumbnail && el.poster) thumbnail = el.poster;
    if (!thumbnail) {
      // YouTube watch sayfasının og:image meta tag'ı genelde thumbnail'ı içerir
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg && ogImg.content) thumbnail = ogImg.content;
    }

    return {
      ok: true,
      currentTime: el.currentTime || 0,
      duration: el.duration || 0,
      paused: el.paused,
      isAd,
      src: el.currentSrc || el.src || '',
      title,
      artist,
      thumbnail
    };
  } catch (e) { return { ok: false, err: String(e) }; }
})()`;

export class StreamResolver {
  private win: BrowserWindow | null = null;
  private queue: Promise<void> = Promise.resolve();
  private currentVideoId = '';
  private pollTimer: any = null;
  private listeners: Set<UpdateListener> = new Set();
  private volume = 0.8;
  private _loggedNoMedia = false;
  // YT Music bazen otomatik resume ediyor — kullanıcı isteğini hatırla
  private userWantsPaused = false;
  private _pauseEnforceInterval: any = null;
  // Reklam öncesi konum korunması
  private _adPosition = 0;
  private _wasAd = false;
  private _destroyed = false;

  // Pencereyi oluştur veya var olanı döndür
  private ensureWindow(): BrowserWindow {
    if (this._destroyed) throw new Error('StreamResolver has been destroyed');
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      width: 800,
      height: 500,
      show: false,
      autoHideMenuBar: true,
      title: 'Harmonic Player',
      webPreferences: {
        partition: MUSIC_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    this.win.webContents.setAudioMuted(false);
    this.win.webContents.setUserAgent(CHROME_UA);
    this.win.webContents.on('before-input-event', (e) => e.preventDefault());
    // Yükleme bitince metadata çekmeyi dene
    this.win.webContents.on('did-finish-load', () => {
      setTimeout(() => this.pollOnce(), 500);
    });
    // İlk yükleme: ana sayfa
    if (!this.win.webContents.getURL() || this.win.webContents.getURL() === 'about:blank') {
      this.win.loadURL('https://music.youtube.com/').catch(() => {});
    }
    return this.win;
  }

  onUpdate(cb: UpdateListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(u: PlaybackUpdate) {
    // Reklam algılama: reklam başladıysa konumu kaydet, bittiyse geri yükle
    if (u.isAd) {
      if (!this._wasAd) {
        this._wasAd = true;
        this._adPosition = u.currentTime || 0;
      }
    } else if (this._wasAd) {
      this._wasAd = false;
      // Reklam bitti — kaydedilen konuma geri dön
      if (this._adPosition > 0 && u.currentTime < this._adPosition) {
        this.seek(this._adPosition).catch(() => {});
      }
      this._adPosition = 0;
    }
    for (const cb of this.listeners) {
      try { cb(u); } catch {}
    }
  }

  // Periyodik metadata çekme
  private stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async pollOnce() {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    try {
      const st: any = await win.webContents.executeJavaScript(RESOLVE_MEDIA_JS, true);
      if (st && st.ok) {
        // Only emit if state actually changed to avoid redundant updates
        const lastEmitted = this.lastEmittedState;
        if (!lastEmitted || lastEmitted.paused !== st.paused || lastEmitted.currentTime !== st.currentTime) {
          this.lastEmittedState = { ...st };
          if (this.userWantsPaused && !st.paused) {
            try {
              await this.execCmd('pause');
              st.paused = true;
            } catch {}
          }
          this.emit({
            videoId: this.currentVideoId,
            title: st.title || '',
            artist: st.artist || '',
            thumbnail: st.thumbnail || '',
            currentTime: st.currentTime || 0,
            duration: st.duration || 0,
            paused: !!st.paused,
            isAd: !!st.isAd,
            src: st.src || ''
          });
        }
      }
    } catch {}
  }

  private lastEmittedState: PlaybackUpdate | null = null;

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollOnce(), POLL_MS * 2);
  }

  // Girişli session ile hesap profilini çek (ayarlar/kullanıcı kartı için).
  // account_menu API'si en güvenilir yol — DOM scraping yerine kullanılır.
  async fetchAccountProfile(): Promise<{ name: string; email: string; picture: string } | null> {
    const win = this.ensureWindow();
    try {
      // Session'dan cookie'leri al ve account_menu API'sine istek at
      const { session } = await import('electron');
      const ses = session.fromPartition('persist:harmonic');
      const cookies = await ses.cookies.get({ url: 'https://music.youtube.com' });
      if (!cookies.length) {
        console.error('[Auth] profil: cookie yok');
        return null;
      }
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const res = await fetch('https://music.youtube.com/youtubei/v1/account/account_menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          context: { client: { hl: 'tr', gl: 'TR', clientName: 'WEB_REMIX', clientVersion: '1.20241001.00.00' } }
        })
      });
      if (!res.ok) {
        console.error('[Auth] profil API HTTP:', res.status);
        return null;
      }
      const data: any = await res.json();
      // account_menu response'unda hesap bilgileri traverse et
      const findAccount = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) {
          for (const el of node) { const f = findAccount(el); if (f) return f; }
          return null;
        }
        if (node.accountName && (node.accountPhoto || node.accountBylineText || node.accountEmail)) return node;
        for (const k of Object.keys(node)) { const f = findAccount(node[k]); if (f) return f; }
        return null;
      };
      const runsText = (t: any): string => {
        if (!t) return '';
        if (typeof t === 'string') return t;
        if (typeof t.simpleText === 'string') return t.simpleText;
        if (Array.isArray(t.runs)) return t.runs.map((r: any) => r?.text || '').join('');
        return '';
      };
      const item = findAccount(data);
      if (item) {
        const name = runsText(item.accountName);
        const picture = item.accountPhoto?.thumbnails?.slice(-1)?.[0]?.url || '';
        const email = runsText(item.accountBylineText) || runsText(item.accountEmail) || '';
        // "Guide" gibi geçersiz isimleri filtrele
        if (name && name !== 'Guide' && name.length > 1 && !/^guide|hamburger|menu$/i.test(name)) {
          console.log('[Auth] profil bulundu:', name || email);
          return { name, email, picture };
        }
        if (email) {
          console.log('[Auth] profil bulundu (email):', email);
          return { name: '', email, picture };
        }
      }
      // Yedek: ham regex
      const raw = JSON.stringify(data);
      const nm = raw.match(/"accountName":\s*\{\s*"simpleText":\s*"((?:[^"\\]|\\.)*)"/)
        || raw.match(/"accountName":\s*\{\s*"runs":\s*\[\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
      const name = nm ? nm[1] : '';
      const emailMatch = raw.match(/"accountEmail":\s*\{\s*"simpleText":\s*"((?:[^"\\]|\\.)*)"/);
      const email = emailMatch ? emailMatch[1] : '';
      if ((name && name !== 'Guide' && name.length > 1) || email) {
        console.log('[Auth] profil bulundu (regex):', name || email);
        return { name: (name === 'Guide') ? '' : name, email, picture: '' };
      }
      console.error('[Auth] profil bulunamadı');
      return null;
    } catch (e: any) {
      console.error('[Auth] profil hatası:', e?.message || e);
      return null;
    }
  }

  // Şarkıyı oynat — sıralı kuyruk
  play(videoId: string): Promise<void> {
    this.queue = this.queue.then(() => this.doPlay(videoId)).catch((e) => {
      console.error('[Player] play kuyruk hatası:', e?.message || e);
    });
    return this.queue;
  }

  private async doPlay(videoId: string): Promise<void> {
    if (!videoId) return;
    this.currentVideoId = videoId;
    this.userWantsPaused = false;
    let win: BrowserWindow;
    try {
      win = this.ensureWindow();
    } catch {
      return;
    }
    let loaded = false;
    for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
      try {
        await win.loadURL(`${WATCH_URL}${encodeURIComponent(videoId)}`);
        loaded = true;
      } catch (err: any) {
        if (win.isDestroyed()) return;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!loaded) return;
    this.startPolling();
    // İlk birkaç saniye boyunca play tetikle (autoplay bazen bloklanır)
    // Ama video zaten oynuyorsa (state=1) hemen dur
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (win.isDestroyed()) return;
      if (this.userWantsPaused) break;
      try {
        const alreadyPlaying = await win.webContents.executeJavaScript(
          `(() => {
            const walkMp = (root) => {
              try { const m = root.getElementById('movie_player'); if (m && typeof m.getPlayerState === 'function') return m; } catch {}
              for (const el of root.querySelectorAll('*')) {
                if (el.shadowRoot) { const r = walkMp(el.shadowRoot); if (r) return r; }
              }
              return null;
            };
            const mp = walkMp(document);
            if (mp && typeof mp.getPlayerState === 'function') {
              return mp.getPlayerState() === 1;
            }
            return false;
          })()`,
          true
        );
        if (alreadyPlaying) break; // video zaten oynuyor, autoplay gereksiz
        await win.webContents.executeJavaScript(
          `(() => {
            const walkMp = (root) => {
              try { const m = root.getElementById('movie_player'); if (m && typeof m.getPlayerState === 'function') return m; } catch {}
              for (const el of root.querySelectorAll('*')) {
                if (el.shadowRoot) { const r = walkMp(el.shadowRoot); if (r) return r; }
              }
              return null;
            };
            const mp = walkMp(document);
            if (mp) {
              const s = mp.getPlayerState();
              if (s !== 1 && typeof mp.playVideo === 'function') mp.playVideo();
            } else {
              const walkV = (root) => {
                for (const el of root.querySelectorAll('video, audio')) {
                  if (el.paused) el.play().catch(() => {});
                  return el;
                }
                for (const e of root.querySelectorAll('*')) {
                  if (e.shadowRoot) { const r = walkV(e.shadowRoot); if (r) return r; }
                }
                return null;
              };
              walkV(document);
            }
          })()`,
          true
        );
      } catch {}
    }
    await this.pollOnce();
  }

  // Kontroller
  async pause(): Promise<void> {
    this.userWantsPaused = true;
    await this.execCmd('pause');
    // Eski interval varsa temizle (çift çağrı hatasını önle)
    if (this._pauseEnforceInterval) { clearInterval(this._pauseEnforceInterval); this._pauseEnforceInterval = null; }
    // Agresif pause: YT Music bazen otomatik resume eder — daha az sık kontrol et (1sn)
    this._pauseEnforceInterval = setInterval(async () => {
      if (!this.userWantsPaused) {
        if (this._pauseEnforceInterval) { clearInterval(this._pauseEnforceInterval); this._pauseEnforceInterval = null; }
        return;
      }
      try {
        const win = this.win;
        if (!win || win.isDestroyed()) return;
        const st: any = await win.webContents.executeJavaScript(
          `(() => { const mp = document.getElementById('movie_player'); if (mp && typeof mp.getPlayerState === 'function') return { paused: mp.getPlayerState() !== 1 }; const v = document.querySelector('video'); return v ? { paused: v.paused } : null; })()`,
          true
        );
        if (st && !st.paused) {
          await this.execCmd('pause');
        }
      } catch {}
    }, 1000);
  }
  async resume(): Promise<void> {
    this.userWantsPaused = false;
    if (this._pauseEnforceInterval) { clearInterval(this._pauseEnforceInterval); this._pauseEnforceInterval = null; }
    await this.execCmd('play');
  }
  async seek(seconds: number): Promise<void> {
    await this.execCmd('seek', String(seconds));
  }
  async setVolume(vol: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, vol));
    await this.execCmd('volume', String(this.volume));
  }

  private async execCmd(cmd: string, val: string = ''): Promise<boolean> {
    const win = this.win;
    if (!win || win.isDestroyed()) return false;
    const code = `(async () => {
      try {
        const findMp = () => {
          if (window.__hmp && window.__hmp.isConnected) return window.__hmp;
          let mp = null;
          try { mp = document.getElementById('movie_player'); } catch {}
          if (!mp) {
            const walk = (root) => {
              try { const m = root.getElementById('movie_player'); if (m) return m; } catch {}
              for (const el of root.querySelectorAll('*')) {
                if (el.shadowRoot) { const r = walk(el.shadowRoot); if (r) return r; }
              }
              return null;
            };
            mp = walk(document);
          }
          if (mp) window.__hmp = mp;
          return mp;
        };
        const mp = findMp();
        const c = ${JSON.stringify(cmd)};
        const v = ${JSON.stringify(val)};

        // Volume helper: movie_player + tüm video/audio elementlerine uygula
        const applyVolume = (n) => {
          if (mp && typeof mp.setVolume === 'function') {
            mp.setVolume(n);
            if (n > 0 && typeof mp.unMute === 'function') try { mp.unMute(); } catch {}
            else if (n === 0 && typeof mp.mute === 'function') try { mp.mute(); } catch {}
          }
          const applyToAll = (root) => {
            for (const tag of ['video', 'audio']) {
              for (const e of root.querySelectorAll(tag)) {
                try {
                  e.volume = n / 100;
                  e.muted = (n === 0);
                } catch {}
              }
            }
            for (const el of root.querySelectorAll('*')) {
              if (el.shadowRoot) applyToAll(el.shadowRoot);
            }
          };
          applyToAll(document);
        };

        if (mp && typeof mp.getPlayerState === 'function') {
          try {
            if (c === 'play') { mp.playVideo(); }
            else if (c === 'pause') { mp.pauseVideo(); }
            else if (c === 'seek') { mp.seekTo(Number(v) || 0, true); }
            else if (c === 'volume') {
              const n = Math.max(0, Math.min(100, Math.round(Number(v) * 100)));
              applyVolume(n);
            }
            let st = -1;
            try { st = mp.getPlayerState(); } catch {}
            return { ok: true, via: 'api', playerState: st };
          } catch (e) { return { ok: false, why: 'api:' + String(e) }; }
        }

        // Yedek: Shadow DOM <video> elementi
        const findMedia = () => {
          if (window.__hmedia && window.__hmedia.isConnected) return window.__hmedia;
          const walk = (root) => {
            for (const tag of ['video', 'audio']) {
              const list = root.querySelectorAll(tag);
              if (list.length) { const m = list[0]; window.__hmedia = m; return m; }
            }
            for (const el of root.querySelectorAll('*')) {
              if (el.shadowRoot) { const r = walk(el.shadowRoot); if (r) return r; }
            }
            return null;
          };
          return walk(document);
        };
        const el = findMedia();
        if (!el) return { ok: false, why: 'no-media' };
        if (c === 'play' && el.paused) { el.play().catch(() => {}); }
        else if (c === 'pause' && !el.paused) { el.pause(); }
        else if (c === 'seek') { try { el.currentTime = Number(v) || 0; } catch {} }
        else if (c === 'volume') {
          const n = Math.max(0, Math.min(1, Number(v)));
          el.volume = n;
          el.muted = (n === 0);
        }
        return { ok: true, via: 'el', paused: el.paused, volume: el.volume, muted: el.muted, currentTime: el.currentTime };
      } catch (e) { return { ok: false, why: String(e) }; }
    })()`;
    try {
      const r: any = await win.webContents.executeJavaScript(code, true);
      if (!r?.ok) console.error('[Player] execCmd', cmd, 'başarısız:', r?.why || 'unknown');
      return !!(r && r.ok);
    } catch {
      return false;
    }
  }

  // Kuyruktaki sonraki şarkıya geç (YT Music autoplay kullanır)
  async next(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    try {
      await win.webContents.executeJavaScript(
        `(() => { const b = document.querySelector('.next-button, ytmusic-player-bar [aria-label*="Next" i], ytmusic-player-bar [aria-label*="Sonraki" i]'); if (b) { b.click(); const e = new Event('click'); b.dispatchEvent(e); } })()`,
        true
      );
    } catch {}
  }

  // Reklamı atla — "Reklamı Geç" butonu 5sn sonra görünür
  async skipAd(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    try {
      await win.webContents.executeJavaScript(
        `(() => {
          // YouTube'un "Skip Ad" / "Reklamı Geç" butonunu bul ve tıkla
          const btns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, [class*="skip"], button.ytp-button');
          for (const b of btns) {
            const txt = (b.textContent || '').toLowerCase();
            if (txt.includes('skip') || txt.includes('geç') || txt.includes('atla') || b.classList.toString().includes('skip')) {
              b.click();
              return true;
            }
          }
          // movie_player API üzerinden dene
          const mp = document.getElementById('movie_player');
          if (mp && typeof mp.getOption === 'function') {
            try { mp.skipAd(); } catch {}
          }
          return false;
        })()`,
        true
      );
    } catch {}
  }

  async prev(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    try {
      await win.webContents.executeJavaScript(
        `(() => { const b = document.querySelector('.previous-button, ytmusic-player-bar [aria-label*="Previous" i], ytmusic-player-bar [aria-label*="Önceki" i]'); if (b) { b.click(); const e = new Event('click'); b.dispatchEvent(e); } })()`,
        true
      );
    } catch {}
  }

  destroy(): void {
    this._destroyed = true;
    this.stopPolling();
    if (this._pauseEnforceInterval) { clearInterval(this._pauseEnforceInterval); this._pauseEnforceInterval = null; }
    // force destroy — close() event'leri tetikleyebilir, destroy() doğrudan kapatır
    try { this.win?.destroy(); } catch {}
    try { this.win?.close(); } catch {}
    this.win = null;
  }
}
