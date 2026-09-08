import { BrowserWindow, session, Session, shell } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import Store from 'electron-store';
// @ts-ignore — paketin tip tanımı yok
import CDP from 'chrome-remote-interface';

// ── YouTube Music cookie tabanlı giriş ──────────
// Kullanıcı music.youtube.com'a normal Google hesabıyla giriş yapar.
// Cookie'ler persist:harmonic partition'ında saklanır, uygulama
// yeniden açılınca giriş korunur. StreamResolver gizli pencerede
// aynı session'ı kullanır.

export const MUSIC_PARTITION = 'persist:harmonic';
const CHROME_DEBUG_PORT = 9333; // Unique port to avoid conflicts with existing Chrome

// Google, UA'sında "Electron" geçen pencerelerden girişi reddediyor
// ("Bir sorun oluştu" hatası). Gerçek Chrome kimliği kullanıyoruz.
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Geçersiz hesap isimlerini filtrele
const INVALID_NAMES = /^(guide|hamburger|menu|account|hesap|profil|open guide|rehber|kläravuz|youtube music)$/i;
export function sanitizeName(name: string | undefined | null): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return '';
  if (INVALID_NAMES.test(trimmed)) return '';
  return trimmed;
}

interface MusicUser {
  id: string;
  name: string;
  email: string;
  picture: string;
  provider: 'youtube-music';
}

export type { MusicUser };

interface MusicStore {
  musicUser: MusicUser | null;
  googleUser?: { id: string; name: string; email: string; picture: string; provider: string } | null;
}

export class MusicAuth {
  private store: Store<MusicStore>;
  private loginWindow: BrowserWindow | null = null;

  constructor() {
    this.store = new Store<MusicStore>({
      name: 'harmonic-auth',
      defaults: { musicUser: null }
    });
    // Kirli store migrasyonu: "Guide" veya "YouTube Music" gibi geçersiz isimleri temizle
    this.migrateDirtyStore();
    // Profil yenileme: cookie'ler var ama isim boşsa veya "YouTube Music" fallback ise API'den çek
    this.refreshProfileIfNeeded();
    // Google, "Client Hints" header'ları olmadan Electron tarayıcısını
    // "güvenli değil" diye reddediyor ("Oturumunuz açılamadı" hatası).
    // Bu header'lar gerçek Chrome'dan geliyormuş gibi gösteriyor.
    const ses = this.getSession();
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      const h = details.requestHeaders;
      h['Sec-CH-UA'] = '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="8"';
      h['Sec-CH-UA-Mobile'] = '?0';
      h['Sec-CH-UA-Platform'] = '"Windows"';
      h['Accept-Language'] = h['Accept-Language'] || 'tr-TR,tr;q=0.9,en;q=0.8';
      cb({ requestHeaders: h });
    });
  }

  getSession(): Session {
    return session.fromPartition(MUSIC_PARTITION);
  }

  async getCookies(): Promise<Electron.Cookie[]> {
    try {
      return await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
    } catch {
      return [];
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const cookies = await this.getCookies();
    const now = Date.now() / 1000;
    // LOGIN_INFO: giriş bayrağı, SAPISID: oturum bütünlüğü — expired olanları sayma
    return cookies.some((c) => c.name === 'LOGIN_INFO' && !c.value.includes('TAKEN_BY') && (!c.expirationDate || c.expirationDate > now)) ||
           cookies.some((c) => c.name === 'SAPISID' && (!c.expirationDate || c.expirationDate > now));
  }

  getUser(): MusicUser | null {
    const user = this.store.get('musicUser');
    // googleUser'dan gerçek isim/alın
    const googleUser = this.store.get('googleUser' as any) as any;
    
    // musicUser'da gerçek isim varsa direkt dön (sanitizeName "YouTube Music" filtreler)
    if (user && sanitizeName(user.name) && user.email) return user;
    
    // Aksi halde googleUser'dan doldur
    if (googleUser && (googleUser.name || googleUser.email)) {
      const merged: MusicUser = {
        id: 'ytmusic',
        name: sanitizeName(user?.name) || sanitizeName(googleUser.name) || 'YouTube Music',
        email: user?.email || googleUser.email || '',
        picture: user?.picture || googleUser.picture || '',
        provider: 'youtube-music'
      };
      this.store.set('musicUser', merged);
      return merged;
    }
    return user;
  }

  setUser(user: MusicUser | null): void {
    if (user) this.store.set('musicUser', user);
    else this.store.set('musicUser', null);
  }

  // Kirli store migrasyonu: "Guide" veya "YouTube Music" gibi geçersiz isimleri temizle
  private migrateDirtyStore(): void {
    const user = this.store.get('musicUser');
    if (user && !sanitizeName(user.name)) {
      console.log('[Auth] Kirli store düzeltildi:', user.name, '-> temizlendi');
      user.name = '';
      this.store.set('musicUser', user);
    }
  }

  // Cookie'ler var ama profil ismi/e-postası boşsa API'den çekmeyi dene
  private async refreshProfileIfNeeded(): Promise<void> {
    try {
      const user = this.store.get('musicUser');
      // Geçerli profil varsa (sanitizeName "YouTube Music" filtreler) atla
      if (user && sanitizeName(user.name) && user.email) return;
      // googleUser'dan gerçek isim zaten mevcut mu?
      const googleUser = this.store.get('googleUser' as any) as any;
      if (googleUser?.name && googleUser?.email && (!user || !sanitizeName(user.name))) {
        const merged: MusicUser = {
          id: 'ytmusic',
          name: sanitizeName(googleUser.name),
          email: user?.email || googleUser.email,
          picture: user?.picture || googleUser.picture || '',
          provider: 'youtube-music'
        };
        this.store.set('musicUser', merged);
        console.log('[Auth] Profil googleUser\'dan güncellendi:', merged.name, merged.email);
        return;
      }
      const authed = await this.isAuthenticated();
      if (!authed) return; // cookie yok
      console.log('[Auth] Profil yenileniyor (mevcut veri eksik)...');
      const prof = await this.fetchProfileViaAPI().catch(() => null);
      if (prof && (prof.name || prof.email)) {
        const merged: MusicUser = {
          id: 'ytmusic',
          name: sanitizeName(prof.name) || sanitizeName(googleUser?.name) || '',
          email: prof.email || user?.email || googleUser?.email || '',
          picture: prof.picture || user?.picture || googleUser?.picture || '',
          provider: 'youtube-music'
        };
        if (merged.name || merged.email) {
          this.store.set('musicUser', merged);
          console.log('[Auth] Profil yenilendi:', merged.name, merged.email || '(e-posta yok)');
        }
      }
    } catch {}
  }

  // İki adımlı giriş akışı:
  // 1) Ayrı profille Chrome'u --remote-debugging-port=9222 ile başlat
  //    (kullanıcının ana Chrome'una dokunmaz, giriş yapması gerekir)
  // 2) "Girişi Aktar" — CDP üzerinden cookie'leri çekip Electron session'a yazar
  getLoginUrl(): string { return 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmusic.youtube.com%2F'; }
  async openChromeLogin(): Promise<{ opened: boolean; error?: string; alreadyRunning?: boolean; url?: string }> {
    // Artık harici Chrome yerine Electron'un kendi persist:harmonic penceresini açıyoruz — güncelleme sonrası da kalıcı
    try {
      if (this.loginWindow && !this.loginWindow.isDestroyed()) { this.loginWindow.focus(); return { opened:true, alreadyRunning:true, url:this.getLoginUrl() }; }
      this.loginWindow = new BrowserWindow({
        width: 1000, height: 700, show: true, autoHideMenuBar:true,
        webPreferences: { partition: MUSIC_PARTITION, nodeIntegration:false, contextIsolation:true, sandbox:true }
      });
      this.loginWindow.loadURL(this.getLoginUrl());
      this.loginWindow.on('closed', ()=> this.loginWindow=null);
      return { opened:true, url:this.getLoginUrl() };
    } catch(e:any){ return { opened:false, error:e?.message||String(e), url:this.getLoginUrl() }; }
  }

  // Artık loginWindow'un kendi session'ında cookie zaten var — direkt profili çekip kapat
  async importFromChrome(): Promise<{ success: boolean; cookies: number; error?: string }> {
    try {
      const cookies = await this.getSession().cookies.get({ url:'https://music.youtube.com' });
      if (!cookies.length) return { success:false, cookies:0, error:'Henüz giriş yapılmadı. Pencerede YouTube Music\'e giriş yapın.' };
      // profil çek, pencereyi kapat
      try{ this.loginWindow?.close(); }catch{}
      const prof = await this.fetchProfileViaAPI().catch(()=>null);
      if(prof) this.store.set('musicUser', { id:'ytmusic', name:prof.name||'YouTube Music', email:prof.email||'', picture:prof.picture||'', provider:'youtube-music' });
      return { success:true, cookies: cookies.length };
    } catch(e:any){ return { success:false, cookies:0, error:e?.message||String(e)}; }
  }
  async importFromChromeLegacy(): Promise<{ success: boolean; cookies: number; error?: string }> {
    let client: any;
    try {
      client = await CDP({ host: '127.0.0.1', port: CHROME_DEBUG_PORT });
    } catch (e: any) {
      return { success: false, cookies: 0, error: 'Chrome\'a bağlanılamadı. Chrome\'u kapatıp tekrar "Giriş Yap" düğmesine basın.' };
    }
    try {
      const { Network } = client;
      const URLS = [
        'https://music.youtube.com/',
        'https://accounts.youtube.com/',
        'https://www.youtube.com/',
        'https://youtube.com/',
        'https://accounts.google.com/'
      ];
      const all: any[] = [];
      for (const url of URLS) {
        try {
          const res = await Network.getCookies({ urls: [url] });
          if (res?.cookies) all.push(...res.cookies);
        } catch {}
      }
      if (!all.length) {
        return { success: false, cookies: 0, error: 'Chrome\'da YouTube/Google için cookie bulunamadı. Giriş yaptığınızdan emin olun.' };
      }
      const ses = this.getSession();
      let written = 0;
      for (const c of all) {
        try {
          // CDP'den gelen cookie -> Electron formatı
          const url = `http${c.secure ? 's' : ''}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`;
          await ses.cookies.set({
            url,
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            sameSite: c.sameSite === 'None' ? 'no_restriction' : (c.sameSite === 'Strict' ? 'strict' : 'lax'),
            expirationDate: c.expires && c.expires > 0 ? Math.floor(c.expires) : undefined
          } as any);
          written++;
        } catch {}
      }
      if (written > 0) {
        // Cookie'ler tam yazıldıktan hemen sonra profil API'si hata verebilir
        // — 2sn bekle, sonra dene. Başarısız olursa CDP ile dene.
        await new Promise((r) => setTimeout(r, 2000));
        let prof = await this.fetchProfileViaAPI().catch(() => null);
        if (!prof || (!prof.name && !prof.email)) {
          // CDP ile dene (Chrome'da açık sayfayı kullan)
          prof = await this.fetchProfileViaCDP(client).catch(() => null);
        }
        // Hâlâ bulamadıysa, 3sn daha bekle ve bir kez daha dene
        if (!prof || (!prof.name && !prof.email)) {
          await new Promise((r) => setTimeout(r, 3000));
          prof = await this.fetchProfileViaAPI().catch(() => null);
        }
        // Google hesabından gerçek ismi al (YouTube Music API çoğu zaman isim dönmüyor)
        const googleUser = this.store.get('googleUser' as any) as any;
        const realName = sanitizeName(prof?.name) || sanitizeName(googleUser?.name) || '';
        const realEmail = prof?.email || googleUser?.email || '';
        const realPicture = prof?.picture || googleUser?.picture || '';
        const user: MusicUser = {
          id: 'ytmusic',
          name: realName || 'YouTube Music',
          email: realEmail,
          picture: realPicture,
          provider: 'youtube-music'
        };
        this.store.set('musicUser', user);
        console.log('[Auth] profil:', user.name, user.email ? `(${user.email})` : '(e-posta yok)');
        return { success: true, cookies: written };
      }
      return { success: false, cookies: 0, error: 'Cookie aktarımı başarısız oldu.' };
    } catch (e: any) {
      return { success: false, cookies: 0, error: e?.message || String(e) };
    } finally {
      try { await client?.close(); } catch {}
    }
  }

  // Cookie ile account_menu endpoint'inden gerçek profil (en güvenilir yol).
  async fetchProfileViaAPI(): Promise<{ name: string; email: string; picture: string } | null> {
    try {
      const cookies = await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
      if (!cookies.length) {
        console.error('[Auth] API profil: cookie yok');
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
        const errText = await res.text();
        console.error('[Auth] API profil HTTP:', res.status, '-', errText.substring(0, 200));
        return null;
      }
      const data: any = await res.json();
      console.log('[Auth] API profil ham veri anahtarları:', Object.keys(data).slice(0, 15));
      const item = this.findAccountItem(data);
      if (item) {
        const name = this.runsText(item.accountName);
        const picture = item.accountPhoto?.thumbnails?.slice(-1)?.[0]?.url || '';
        const email = this.runsText(item.accountBylineText)
          || this.runsText(item.accountEmail)
          || this.extractEmail(JSON.stringify(data));
        if (name || email) {
          console.log('[Auth] API profil OK:', name || email);
          return { name, email, picture };
        }
      }
      // Yedek: ham metinde hesap adı/e-posta regex'i
      const raw = JSON.stringify(data);
      const nm = raw.match(/"accountName":\s*\{\s*"simpleText":\s*"((?:[^"\\]|\\.)*)"/)
        || raw.match(/"accountName":\s*\{\s*"runs":\s*\[\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
      const name = nm ? nm[1] : '';
      const emailMatch = raw.match(/"accountEmail":\s*\{\s*"simpleText":\s*"((?:[^"\\]|\\.)*)"/);
      const email = emailMatch ? emailMatch[1] : '';
      if ((name && name !== 'Guide' && name.length > 1) || email) {
        console.log('[Auth] API profil OK (regex):', name || email);
        return { name: (name === 'Guide') ? '' : name, email, picture: '' };
      }
      console.error('[Auth] API profil: accountItem bulunamadı');
      return null;
    } catch (e: any) {
      console.error('[Auth] API profil hatası:', e?.message || e);
      return null;
    }
  }

  private findAccountItem(node: any): any {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const el of node) {
        const f = this.findAccountItem(el);
        if (f) return f;
      }
      return null;
    }
    if (node.accountName && (node.accountPhoto || node.accountBylineText || node.accountEmail)) return node;
    // Also check for any key that matches account fields
    const keyNames = Object.keys(node).join('');
    const hasAccountFields = /accountName|accountPhoto|accountBylineText|accountEmail/.test(keyNames);
    if (hasAccountFields && node.accountName) return node;
    for (const k of Object.keys(node)) {
      const f = this.findAccountItem(node[k]);
      if (f) return f;
    }
    return null;
  }

  private runsText(t: any): string {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (typeof t.simpleText === 'string') return t.simpleText;
    if (Array.isArray(t.runs)) return t.runs.map((r: any) => r.text || '').join('');
    return '';
  }

  private extractEmail(raw: string): string {
    const m = raw.match(/"email":\s*\{\s*"simpleText":\s*"([^"]+)"/) ||
              raw.match(/"emailAddress":\s*\{\s*"simpleText":\s*"([^"]+)"/) ||
              raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return m ? m[1] || m[0] : '';
  }

  // CDP üzerinden mevcut sekmede hesap adını çek
  private async fetchProfileViaCDP(client: any): Promise<{ name: string; email: string; picture: string } | null> {
    try {
      const { Page, Runtime } = client;
      await Page.enable();
      await Runtime.enable();
      try { await Page.navigate({ url: 'https://music.youtube.com/' }); } catch {}
      await new Promise((r) => setTimeout(r, 7000));
      const res = await Runtime.evaluate({
        expression: `(function(){
          try {
            const html = document.documentElement.innerHTML;
            let name = '', email = '';
            const nm = html.match(/"accountName":\\s*\\{\\s*"simpleText":\\s*"((?:[^"\\\\\\\\]|\\\\\\\\.)*)"/);
            if (nm) { try { name = JSON.parse('"' + nm[1] + '"'); } catch { name = nm[1]; } }
            const em = html.match(/"accountEmail":\\s*\\{\\s*"simpleText":\\s*"((?:[^"\\\\\\\\]|\\\\\\\\.)*)"/);
            if (em) { try { email = JSON.parse('"' + em[1] + '"'); } catch { email = em[1]; } }
            let picture = '';
            const imgs = document.querySelectorAll('ytmusic-nav-bar img, header img');
            for (const img of imgs) {
              const s = img.currentSrc || img.src || '';
              if (s && s.includes('googleusercontent')) { picture = s; break; }
            }
            if (!name) {
              try {
                const cfg = (window.ytcfg && window.ytcfg.data_) || {};
                if (cfg.LOGGED_IN && cfg.USER_NAME) name = cfg.USER_NAME;
              } catch {}
            }
            if (!name) {
              const av = document.querySelector('ytmusic-nav-bar [aria-label]');
              if (av) {
                const lbl = av.getAttribute('aria-label') || '';
                const m = lbl.match(/(?:avatar of\\s+)?([A-Za-z0-9_\\s\\u00C0-\\u017F]+)/i);
                if (m) name = m[1].trim();
              }
            }
            return JSON.stringify({ name, email, picture });
          } catch(e) { return JSON.stringify({ name: '', email: '', picture: '' }); }
        })()`,
        returnByValue: true
      });
      const data = JSON.parse(res.result?.value || '{}');
      console.log('[Auth] CDP profil:', data);
      if (data.name || data.email) return data;
      return null;
    } catch (e: any) {
      console.error('[Auth] CDP profil hatası:', e?.message || e);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.getSession().clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb', 'serviceworkers'] });
    } catch {}
    this.store.set('musicUser', null);
    // temp chrome profile temizliği
    try {
      const tmpProfile = (process.env.TEMP || 'C:\\Temp') + '\\harmonic-chrome-profile';
      if (fs.existsSync(tmpProfile)) fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {}
  }
}
