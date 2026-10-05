import { BrowserWindow, session, Session, shell } from 'electron';
import * as fs from 'fs';
import Store from 'electron-store';
import CDP from 'chrome-remote-interface';
import { logger } from '../utils/logger';
import { buildDomWaitScript } from './dom-wait';

// ── YouTube Music cookie tabanlı giriş ──────────
// Kullanıcı music.youtube.com'a normal Google hesabıyla giriş yapar.
// Cookie'ler persist:harmonic partition'ında saklanır, uygulama
// yeniden açılınca giriş korunur. StreamResolver gizli pencerede
// aynı session'ı kullanır.

export const MUSIC_PARTITION = 'persist:harmonic';
const CHROME_DEBUG_PORTS = [9222, 9333]; // Önce varsayılan 9222 (hedef: doğrudan ID ile bul)

// Tarayıcı kimliği tek kaynaktan (bk. M-12) — music-auth üzerinden içe aktaranlar etkilenmez.
import { CHROME_UA, YT_CLIENT_VERSION } from '../api/client-versions';
export { CHROME_UA };

// "Kimliğinizi doğrulayın" / challenge döngüsü tespiti (TEK KAYNAK — main tarafı).
// Login penceresi bu URL'lere düşerse cookie akışı ilerlemez:
// kullanıcı normal Chrome'da tamamlayıp "Girişi Aktar"a basmalıdır.
const VERIFY_URL_PATTERNS = [
  '/signin/v2/challenge',
  '/signin/challenge',
  '/signin/rejected',
  'signin/v2/verify',
  'challenge/pwd',
  'challenge/az',
  'reauth',
  'verify-it-is-you',
  'verifyit',
];
export function isVerifyChallengeUrl(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const u = raw.toLowerCase();
  if (!u.includes('accounts.google.com') && !u.includes('accounts.youtube.com')) return false;
  return VERIFY_URL_PATTERNS.some((p) => u.includes(p));
}

// Verify ekranında gösterilecek yönlendirme (renderer copy ile birebir tutulmalı).
export const VERIFY_HELP_TR =
  "Google kimliğinizi doğrulamanızı istiyor. 1) Normal Chrome'da music.youtube.com adresine giriş yapın. 2) Buraya dönüp 'Girişi Aktar' düğmesini kullanın.";

// ── Auth hardening (İsmail Dede 1-4): TEK KAYNAK allowlist'ler ──
// Login penceresi + CDP hedefleri yalnızca bu host'lara dokunur; cookie
// yazımı da yalnızca bu domain'lerden kabul edilir. M-12 korunur:
// UA/client sürümleri client-versions.ts'ten gelir, burada tekrar yazılmaz.
const ALLOWED_AUTH_HOSTS = [
  'music.youtube.com',
  'www.youtube.com',
  'youtube.com',
  'accounts.google.com',
  'accounts.youtube.com',
];
const ALLOWED_COOKIE_DOMAIN_RE =
  /(^|\.)(youtube\.com|music\.youtube\.com|google\.com|accounts\.google\.com|accounts\.youtube\.com|googleusercontent\.com|ggpht\.com)$/i;

function getHost(raw: string | undefined | null): string {
  try {
    if (!raw) return '';
    return new URL(String(raw)).hostname.toLowerCase();
  } catch {
    return '';
  }
}
export function isAllowedAuthUrl(raw: string | undefined | null): boolean {
  const host = getHost(raw);
  if (!host) return false;
  return ALLOWED_AUTH_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}
function isAllowedCookieDomain(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const d = raw.toLowerCase().replace(/^\./, '');
  return ALLOWED_COOKIE_DOMAIN_RE.test(d) || ALLOWED_COOKIE_DOMAIN_RE.test('.' + d);
}
// Geçersiz hesap isimlerini filtrele
const INVALID_NAMES = /^(guide|hamburger|menu|account|hesap|profil|open guide|rehber|kläravuz|youtube music)$/i;
export function sanitizeName(name: string | undefined | null): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
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
      h['Sec-CH-UA'] = '"Chromium";v="131", "Google Chrome";v="131", "Not.A/Brand";v="24"';
      h['Sec-CH-UA-Mobile'] = '?0';
      h['Sec-CH-UA-Platform'] = '"Windows"';
      h['Sec-CH-UA-Arch'] = '"x86"';
      h['Sec-CH-UA-Bitness'] = '"64"';
      h['Sec-CH-UA-Model'] = '""';
      h['Sec-CH-UA-Full-Version-List'] = '"Chromium";v="131.0.6778.0", "Google Chrome";v="131.0.6778.0", "Not.A/Brand";v="24.0.0.0"';
      h['Accept-Language'] = h['Accept-Language'] || 'tr-TR,tr;q=0.9,en;q=0.8';
      h['Accept'] = h['Accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
      (h as any)['X-Client-Data'] = (h as any)['X-Client-Data'] || 'CJW2yQEIpLbJAQimtskBCKmdygEIv6HKAQ==';
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

  async getCookieString(): Promise<string> {
    try {
      const cookies = await this.getCookies();
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch {
      return '';
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const cookies = await this.getCookies();
    const now = Date.now() / 1000;
    // LOGIN_INFO: giriş bayrağı, SAPISID: oturum bütünlüğü — expired olanları sayma
    const loginOk = cookies.some((c) => c.name === 'LOGIN_INFO' && !c.value.includes('TAKEN_BY') && (!c.expirationDate || c.expirationDate > now));
    const sapiOk = cookies.some((c) => c.name === 'SAPISID' && (!c.expirationDate || c.expirationDate > now));
    // Restart-kanıtı: oturum sağlığı loglanır (SAPISID/LOGIN_INFO yaşıyor mu?)
    logger.debug(`[Auth] Oturum sağlığı: cookie=${cookies.length} LOGIN_INFO=${loginOk} SAPISID=${sapiOk}`);
    return loginOk || sapiOk;
  }

  // Giriş penceresi durumu: renderer "Chrome'da tamamla" dalını bununla seçer.
  getLoginWindowUrl(): string | null {
    try {
      if (this.loginWindow && !this.loginWindow.isDestroyed()) return this.loginWindow.webContents.getURL() || null;
    } catch {}
    return null;
  }

  getLoginState(): { open: boolean; url: string | null; verifyChallenge: boolean; help?: string } {
    const url = this.getLoginWindowUrl();
    const verifyChallenge = isVerifyChallengeUrl(url);
    if (verifyChallenge) logger.warn('[Auth] Verify/challenge ekranı tespit edildi:', url);
    return { open: url !== null, url, verifyChallenge, help: verifyChallenge ? VERIFY_HELP_TR : undefined };
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

  // Kirli store migrasyonu: "Y", tek harf, "Guide" veya "YouTube Music" temizlenir — dosyadan zorla sil
  private migrateDirtyStore(): void {
    try {
      const user = this.store.get('musicUser') as any;
      if (user && (!user.name || user.name.trim().length <= 1 || user.name === 'Y' || user.name === 'YouTube Music' || !sanitizeName(user.name))) {
        logger.debug('[Auth] Kirli store düzeltildi:', JSON.stringify(user), '-> silindi');
        this.store.set('musicUser', null as any);
      }
    } catch {}
  }

  // Cookie'ler varsa profili yenile — pp eksikse veya "YouTube Music" fallback ise mutlaka çek
  private async refreshProfileIfNeeded(): Promise<void> {
    try {
      const user = this.store.get('musicUser');
      const googleUser = this.store.get('googleUser' as any) as any;
      // pp boşsa veya "YouTube Music" fallback ise yenile
      const needRefresh = !user || !user.picture || !sanitizeName(user.name) || user.name === 'YouTube Music' || !user.email;
      if (!needRefresh) return;
      // googleUser'dan gerçek isim/pp zaten mevcut mu?
      if (googleUser?.name && googleUser?.email && (!user || !sanitizeName(user.name) || !user.picture)) {
        const merged: MusicUser = {
          id: 'ytmusic',
          name: sanitizeName(googleUser.name) || sanitizeName(user?.name) || '',
          email: user?.email || googleUser.email,
          picture: user?.picture || googleUser.picture || '',
          provider: 'youtube-music'
        };
        this.store.set('musicUser', merged);
        logger.debug('[Auth] Profil googleUser\'dan güncellendi:', merged.name, merged.email);
        return;
      }
      const authed = await this.isAuthenticated();
      if (!authed) return;
      logger.debug('[Auth] Profil yenileniyor (pp eksik)...');
      // M-13: Tavan süre <= 4000ms ile sınırlandırılır
      const prof = await this.fetchProfileViaAPI(4000).catch(() => null);
      if (prof && (prof.name || prof.email || prof.picture)) {
        const merged: MusicUser = {
          id: 'ytmusic',
          name: sanitizeName(prof.name) || sanitizeName(googleUser?.name) || sanitizeName(user?.name) || '',
          email: prof.email || user?.email || googleUser?.email || '',
          picture: prof.picture || user?.picture || googleUser?.picture || '',
          provider: 'youtube-music'
        };
        if (merged.name || merged.email || merged.picture) {
          this.store.set('musicUser', merged);
          logger.debug('[Auth] Profil yenilendi:', merged.name || '(isim yok)', merged.picture ? 'pp var' : 'pp yok');
        }
      }
    } catch {}
  }

  // İki adımlı giriş akışı:
  // 1) Ayrı profille Chrome'u --remote-debugging-port=9222 ile başlat
  //    (kullanıcının ana Chrome'una dokunmaz, giriş yapması gerekir)
  // 2) "Girişi Aktar" — CDP üzerinden cookie'leri çekip Electron session'a yazar
  // Giriş ürün yüzeyinden başlar (music.youtube.com → Google doğru continue
  // parametreleriyle yönlendirir). Doğrudan el-yapımı ServiceLogin URL'si
  // riskli hesapları "Kimliğinizi doğrulayın" ekranına düşürüyordu.
  getLoginUrl(): string { return 'https://music.youtube.com/'; }
  async findYouTubeMusicTarget(): Promise<{ id: string; url: string } | null> {
    for (const port of CHROME_DEBUG_PORTS) {
      try {
        const controller = new AbortController();
        const t = setTimeout(()=>controller.abort(), 800);
        const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: controller.signal } as any);
        clearTimeout(t);
        if (!res.ok) continue;
        const targets = await res.json() as any[];
        // Hardening: yalnızca page tipi + allowlist host + https hedefleri.
        const hits = (Array.isArray(targets) ? targets : []).filter((tg) =>
          tg && tg.type === 'page' && typeof tg.url === 'string' &&
          tg.url.startsWith('https://') && isAllowedAuthUrl(tg.url));
        const hit = hits.find(t => getHost(t.url) === 'music.youtube.com')
          || hits.find(t => (t.url?.includes('music.youtube.com') || t.title?.toLowerCase().includes('youtube music')));
        if (hit && hit.id) return { id: String(hit.id), url: hit.url };
      } catch {}
    }
    return null;
  }
  // CDP strict: targetId /json listesinde allowlist'li bir page'e ait olmalı.
  private async resolveStrictTarget(targetId: string): Promise<{ port: number; id: string; url: string } | null> {
    for (const port of CHROME_DEBUG_PORTS) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 800);
        const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: controller.signal } as any);
        clearTimeout(t);
        if (!res.ok) continue;
        const targets = await res.json() as any[];
        const hit = (Array.isArray(targets) ? targets : []).find((tg) =>
          tg && String(tg.id) === String(targetId) && tg.type === 'page' &&
          typeof tg.url === 'string' && tg.url.startsWith('https://') && isAllowedAuthUrl(tg.url));
        if (hit) return { port, id: String(hit.id), url: hit.url };
      } catch {}
    }
    return null;
  }
  async hasExternalYouTubeMusic(): Promise<boolean> {
    const target = await this.findYouTubeMusicTarget().catch(() => null);
    return !!target;
  }
  async openChromeLogin(): Promise<{ opened: boolean; error?: string; alreadyRunning?: boolean; url?: string; externalFound?: boolean; targetId?: string }> {
    // Verify early-return: challenge ekranında yeni akış başlatma, yönlendir.
    try {
      const st = this.getLoginState();
      if (st.verifyChallenge) return { opened: true, alreadyRunning: true, url: st.url || undefined, error: VERIFY_HELP_TR };
    } catch {}
    const target = await this.findYouTubeMusicTarget();
    if(target){
      // Hardening: shell interpolasyonu yok — pencere odağı Electron API ile.
      try {
        if (this.loginWindow && !this.loginWindow.isDestroyed()) this.loginWindow.focus();
      } catch {}
      return { opened:true, alreadyRunning:true, url:target.url, externalFound:true, targetId: target.id };
    }
    try {
      if (this.loginWindow && !this.loginWindow.isDestroyed()) { this.loginWindow.focus(); return { opened:true, alreadyRunning:true, url:this.getLoginUrl() }; }
      this.loginWindow = new BrowserWindow({
        width: 1000, height: 700, show: true, autoHideMenuBar:true,
        webPreferences: { partition: MUSIC_PARTITION, nodeIntegration:false, contextIsolation:true, sandbox:true }
      });
      try { (this.loginWindow.webContents as any).setUserAgent(CHROME_UA); } catch {}
      // Hardening: login penceresi allowlist dışı gezintiye kapatıldı.
      // Allowlist dışı URL'ler pencere içinde yüklenmez (deny) — https ise
      // sistem tarayıcısında açılır, gerisi sessizce engellenir.
      try {
        this.loginWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
          try {
            if (isAllowedAuthUrl(url)) return { action: 'allow' as never };
            if (typeof url === 'string' && url.startsWith('https://')) {
              try { shell.openExternal(new URL(url).toString()); } catch {}
            }
          } catch {}
          return { action: 'deny' as never };
        });
        this.loginWindow.webContents.on('will-navigate' as never, (e: { preventDefault(): void }, url: string) => {
          try {
            if (isAllowedAuthUrl(url)) return;
            e.preventDefault();
            if (typeof url === 'string' && url.startsWith('https://')) {
              try { shell.openExternal(new URL(url).toString()); } catch {}
            }
          } catch {}
        });
      } catch {}
      // Verify/challenge döngüsü: URL değişimlerini izle, düşünce logla
      // (renderer auth:getLoginState ile sorgular, "Chrome'da tamamla" dalına geçer).
      try {
        const watch = (_e: unknown, url: string) => {
          try { if (isVerifyChallengeUrl(url)) logger.warn('[Auth] Verify/challenge ekranına düşüldü:', url); } catch {}
        };
        this.loginWindow.webContents.on('did-navigate' as never, watch as never);
        this.loginWindow.webContents.on('did-navigate-in-page' as never, watch as never);
      } catch {}
      this.loginWindow.loadURL(this.getLoginUrl());
      this.loginWindow.on('closed', ()=> this.loginWindow=null);
      return { opened:true, url:this.getLoginUrl() };
    } catch(e:any){ return { opened:false, error:e?.message||String(e), url:this.getLoginUrl() }; }
  }

  // Artık loginWindow'un kendi session'ında cookie zaten var — direkt profili çekip kapat
  async importFromChrome(): Promise<{ success: boolean; cookies: number; error?: string }> {
    try {
      // Verify early-return: challenge ekranındayken DOM scraping'e girme.
      try {
        const st = this.getLoginState();
        if (st.verifyChallenge) return { success: false, cookies: 0, error: VERIFY_HELP_TR };
      } catch {}
      // M-13 Uçtan uca toplam profil çözümleme tavanı kesin olarak <= 5.0 saniye ile sınırlandırılır
      const totalDeadline = Date.now() + 4800;
      const remainingTime = () => Math.max(0, totalDeadline - Date.now());

      const ses=this.getSession();
      // tüm domainlerde ara — accounts.google.com'da cookie olabilir ama music.youtube.com'da henüz yok
      const urls=['https://music.youtube.com','https://accounts.google.com','https://youtube.com','https://www.youtube.com'];
      let all: Electron.Cookie[]=[]; for(const u of urls){ try{ const cs=await ses.cookies.get({url:u}); all.push(...cs);}catch{} }
      // dedupe by name+domain
      const uniq=new Map<string,Electron.Cookie>(); for(const c of all){ uniq.set(c.name+'|'+c.domain, c); }
      const cookies=[...uniq.values()];
      if (!cookies.length) return { success:false, cookies:0, error:'Henüz giriş yapılmadı. Pencerede YouTube Music\'e giriş yapın.' };
      const hasLogin=cookies.some(c=>c.name==='LOGIN_INFO' || c.name==='SAPISID' || c.name==='__Secure-1PSID');
      if(!hasLogin) return { success:false, cookies:cookies.length, error:'Giriş tamamlanmamış — YouTube Music ana sayfası yüklenene kadar bekleyin.' };
      // ÖNCELİK: loginWindow DOM'u (doğrudan render edilmiş sayfa)
      let prof: { name: string; email: string; picture: string } | null = null;
      try {
        if (this.loginWindow && !this.loginWindow.isDestroyed()) {
          // loginWindow music.youtube.com'da değilse oraya git ve header gelene kadar bekle
          // No auto-bypass: verify/challenge URL'sindeyken gezinmeyi zorlama.
          try {
            const curUrl = this.loginWindow.webContents.getURL() || '';
            if (isVerifyChallengeUrl(curUrl)) {
              return { success: false, cookies: cookies.length, error: VERIFY_HELP_TR };
            }
            if (!curUrl.includes('music.youtube.com')) {
              if (!isAllowedAuthUrl(curUrl) && curUrl && !curUrl.startsWith('about:') && !curUrl.startsWith('devtools://')) {
                return { success: false, cookies: cookies.length, error: VERIFY_HELP_TR };
              }
              await this.loginWindow.webContents.loadURL('https://music.youtube.com/');
              // M-13: sabit 250ms poll yerine olay-tabanlı MutationObserver bekleme (deadline üst sınırı korunur)
              try {
                await this.loginWindow!.webContents.executeJavaScript(buildDomWaitScript('ytmusic-nav-bar #avatar img, #account-name', Math.max(0, Math.min(2000, remainingTime() - 600))), true);
              } catch {}
            }
          } catch {}
          // hesap menüsü kapalıysa avatar'a tıklayıp aç (saf JS, TypeScript casting yok)
          try {
            await this.loginWindow.webContents.executeJavaScript(`(function(){ if(!document.querySelector('ytd-active-account-header-renderer #account-name')){ const b=document.querySelector('ytmusic-nav-bar #avatar button')||document.querySelector('ytmusic-nav-bar #avatar')||document.querySelector('#avatar-btn'); if(b && typeof b.click === 'function'){ b.click(); } } })()`, true);
          } catch {}
          // M-13: menü açılana kadar olay-tabanlı bekleme (max 1.5sn, deadline üst sınırı korunur)
          try {
            await this.loginWindow.webContents.executeJavaScript(buildDomWaitScript('ytd-active-account-header-renderer #account-name', Math.max(0, Math.min(1500, remainingTime() - 500))), true);
          } catch {}
          const domData: any = await this.loginWindow.webContents.executeJavaScript(`(function(){
            const acc=document.querySelector('ytd-active-account-header-renderer');
            let name='', email='', picture='', handle='';
            if(acc){
              const n=acc.querySelector('#account-name'); if(n) name=(n.getAttribute('title')||n.textContent||'').trim();
              const av=acc.querySelector('#avatar img#img'); let raw=''; if(av) raw=av.currentSrc||av.src||av.getAttribute('src')||'';
              if(!raw){ const av2=acc.querySelector('#avatar img'); if(av2) raw=av2.currentSrc||av2.src||''; }
              if(raw && (raw.includes('yt3.ggpht.com')||raw.includes('googleusercontent'))) picture=raw;
              const em=acc.querySelector('#email'); if(em) email=(em.getAttribute('title')||em.textContent||'').trim();
              const h=acc.querySelector('#channel-handle'); if(h) handle=(h.getAttribute('title')||h.textContent||'').trim();
              if(!email && handle) email=handle;
            }
            return JSON.stringify({name:(name||'').trim(), email:(email||'').trim(), picture:(picture||'').trim(), handle:(handle||'').trim()});
          })()`, true) as string;
          const parsed = typeof domData==='string' ? JSON.parse(domData) : domData;
          if(parsed && (parsed.name || parsed.picture)) prof = { name: parsed.name, email: parsed.email, picture: parsed.picture };
        }
      } catch {}
      // 2. yol: hidden window ile DOM çek (pp VEYA isim eksikse dene, kalan süre varsa)
      if (!prof || !prof.picture || !prof.name) {
        const rem = remainingTime();
        if (rem > 600) {
          try {
            const hProf = await this.fetchProfileViaAPI(rem).catch(()=>null);
            if(hProf){
              // Merge: mevcut veriyi koru, sadece boş alanları doldur
              if(!prof) prof = { name:'', email:'', picture:'' };
              if(hProf.picture && (hProf.picture.includes('googleusercontent')||hProf.picture.includes('ggpht.com')) && !prof.picture) prof.picture = hProf.picture;
              if(hProf.name && hProf.name.length>1 && !prof.name) prof.name = hProf.name;
              if(hProf.email && !prof.email) prof.email = hProf.email;
            }
          } catch {}
        }
      }
      // 3. yol: CDP (hâlâ isim yoksa, kalan süre varsa)
      if ((!prof || !prof.name) && remainingTime() > 400) {
        try {
          const cdpProf = await this.fetchProfileViaCDP(null as any).catch(()=>null);
          if(cdpProf){
            if(!prof) prof = { name:'', email:'', picture:'' };
            if(cdpProf.name && cdpProf.name.length>1 && !prof.name) prof.name = cdpProf.name;
            if(cdpProf.email && !prof.email) prof.email = cdpProf.email;
            if(cdpProf.picture && !prof.picture) prof.picture = cdpProf.picture;
          }
        } catch {}
      }
      if(prof && (prof.name||prof.email||prof.picture)){
        const existing = this.store.get('musicUser');
        const rawName = prof.name && prof.name.trim().length>1 ? prof.name.trim() : (prof.email||'').trim();
        const existingName = existing && sanitizeName(existing.name) ? existing.name : '';
        const finalName = sanitizeName(rawName) || existingName;
        if (!finalName) {
          try{ this.loginWindow?.close(); }catch{}
          return { success:false, cookies: cookies.length, error:'Profil ismi okunamadı. Pencerede avatar menüsünü bir kez açıp tekrar "Girişi Aktar"a basın.' };
        }
        this.store.set('musicUser', {
          id:'ytmusic',
          name: finalName,
          email: prof.email || existing?.email || '',
          picture: prof.picture || existing?.picture || '',
          provider:'youtube-music'
        });
      } else {
        try{ this.loginWindow?.close(); }catch{}
        return { success:false, cookies: cookies.length, error:'Profil okunamadı. Music ana sayfası tam yüklenince tekrar "Girişi Aktar"a basın.' };
      }
      try{ this.loginWindow?.close(); }catch{}
      return { success:true, cookies: cookies.length };
    } catch(e:any){ return { success:false, cookies:0, error:e?.message||String(e)}; }
  }
  // Dis Chrome'daki acik YouTube Music'i dogrudan target ID ile ice aktar
  async importFromExternalChrome(targetId?: string): Promise<{ success: boolean; cookies: number; error?: string }> {
    // Verify early-return: login penceresi challenge'daysa dışa aktarımı deneme.
    try {
      const st = this.getLoginState();
      if (st.verifyChallenge) return { success: false, cookies: 0, error: VERIFY_HELP_TR };
    } catch {}
    const totalDeadline = Date.now() + 4800; // M-13 Uçtan uca toplam tavan <= 5.0 saniye
    if (targetId) {
      const byTarget = await this.importFromTarget(targetId, totalDeadline);
      if (byTarget.success) {
        const remaining = totalDeadline - Date.now();
        if (remaining > 500) {
          const prof = await this.fetchProfileViaAPI(remaining).catch(()=>null);
          // Account confirm: doğrulanmış isim/e-posta yoksa sessizce "başarı" dönme.
          if(prof && (sanitizeName(prof.name) || prof.email)) this.store.set('musicUser', { id:'ytmusic', name:sanitizeName(prof.name) || prof.email, email:prof.email||'', picture:prof.picture||'', provider:'youtube-music' });
        }
        return byTarget;
      }
      // Strict hedef doğrulanamazsa legacy'ye düşme — hedefi açıkça reddet.
      return byTarget;
    }
    const legacy = await this.importFromChromeLegacy(totalDeadline);
    return legacy;
  }
  async importFromTarget(targetId: string, totalDeadline = Date.now() + 4800): Promise<{ success: boolean; cookies: number; error?: string }> {
    let client: any;
    try {
      if (totalDeadline - Date.now() < 500) throw new Error('timeout');
      // CDP strict: targetId önce /json allowlist doğrulamasından geçer.
      const strict = await this.resolveStrictTarget(String(targetId));
      if (!strict) return { success: false, cookies: 0, error: 'Chrome sekmesi doğrulanamadı. Music sekmesi açıkken tekrar deneyin.' };
      try { client = await CDP({ host: '127.0.0.1', port: strict.port, target: strict.id }); } catch {}
      if (!client) throw new Error('no target');
      const { Network } = client;
      const res = await Network.getCookies();
      const all = res?.cookies || [];
      if (!all.length) return { success:false, cookies:0, error:'Chrome sekmesinde cookie bulunamadı.' };
      // Cookie domain allowlist: yalnızca Google/YouTube cookie'leri yazılır.
      const filtered = all.filter((c: any) => isAllowedCookieDomain(c?.domain));
      if (!filtered.length) return { success: false, cookies: all.length, error: 'Chrome sekmesinde YouTube/Google cookie bulunamadı.' };
      const ses = this.getSession();
      let written=0;
      for (const c of filtered) {
        try {
          const url = `http${c.secure ? 's' : ''}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`;
          await ses.cookies.set({ url, name:c.name, value:c.value, domain:c.domain, path:c.path||'/', secure:!!c.secure, httpOnly:!!c.httpOnly, sameSite: c.sameSite==='None'?'no_restriction':(c.sameSite==='Strict'?'strict':'lax'), expirationDate: c.expires && c.expires>0 ? Math.floor(c.expires):undefined } as any);
          written++;
        } catch {}
      }
      return written>0 ? { success:true, cookies:written } : { success:false, cookies:0, error:'Cookie yazılamadı.' };
    } catch(e:any){ return { success:false, cookies:0, error:e?.message||String(e)} } finally { try{ await client?.close(); }catch{} }
  }
  async importFromChromeLegacy(totalDeadline = Date.now() + 4800): Promise<{ success: boolean; cookies: number; error?: string }> {
    let client: any;
    try {
      if (totalDeadline - Date.now() < 500) throw new Error('timeout');
      // CDP strict: kök hedefe kör bağlanma yok — allowlist'li music hedefi şart.
      const strictTarget = await this.findYouTubeMusicTarget().catch(() => null);
      if (!strictTarget) throw new Error('no verified target');
      const strict = await this.resolveStrictTarget(strictTarget.id);
      if (!strict) throw new Error('no verified target');
      try { client = await CDP({ host: '127.0.0.1', port: strict.port, target: strict.id }); } catch (e) { throw e; }
      if(!client) throw new Error('no verified target');
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
      // Cookie domain allowlist: yalnızca Google/YouTube cookie'leri yazılır.
      const allowed = all.filter((c: any) => isAllowedCookieDomain(c?.domain));
      if (!allowed.length) {
        return { success: false, cookies: all.length, error: 'Chrome sekmesinde YouTube/Google cookie bulunamadı.' };
      }
      const ses = this.getSession();
      let written = 0;
      for (const c of allowed) {
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
        let prof: { name: string; email: string; picture: string } | null = null;
        // M-13 Uçtan uca toplam profil çözümleme tavanı kesin olarak <= 5.0 saniye ile sınırlandırılır
        // 1. Önce doğrudan CDP ile dene (Chrome'da açık sayfayı kullanır, max 1.6sn, DOM gelince anında erken çıkışlı)
        try {
          if (totalDeadline - Date.now() > 500) {
            prof = await this.fetchProfileViaCDP(client);
          }
        } catch {}

        // 2. CDP ile profil bulunamadıysa ve kalan süre varsa tek seferlik hidden-window API sorgusu yap
        if (!prof || (!prof.name && !prof.email)) {
          const remaining = totalDeadline - Date.now();
          if (remaining > 500) {
            prof = await this.fetchProfileViaAPI(remaining).catch(() => null);
          }
        }
        // Google hesabından gerçek ismi al (YouTube Music API çoğu zaman isim dönmüyor)
        // Account confirm: isimsiz + e-postasız "başarı" yazma — kullanıcı hangi
        // hesaba bağlandığını görmeli, yoksa aktarım başarısız sayılır.
        const googleUser = this.store.get('googleUser' as any) as any;
        const realName = sanitizeName(prof?.name) || sanitizeName(googleUser?.name) || '';
        const realEmail = prof?.email || googleUser?.email || '';
        if (!realName && !realEmail) {
          return { success: false, cookies: written, error: 'Hesap doğrulanamadı. Chrome\'da music.youtube.com\'da giriş yapıp tekrar deneyin.' };
        }
        const realPicture = prof?.picture || googleUser?.picture || '';
        const user: MusicUser = {
          id: 'ytmusic',
          name: realName || 'YouTube Music',
          email: realEmail,
          picture: realPicture,
          provider: 'youtube-music'
        };
        this.store.set('musicUser', user);
        logger.debug('[Auth] profil:', user.name, user.email ? `(${user.email})` : '(e-posta yok)');
        return { success: true, cookies: written };
      }
      return { success: false, cookies: 0, error: 'Cookie aktarımı başarısız oldu.' };
    } catch (e: any) {
      return { success: false, cookies: 0, error: e?.message || String(e) };
    } finally {
      try { await client?.close(); } catch {}
    }
  }

  // Gerçek profil: ytd-active-account-header-renderer ham verisi (verdiğin dump) doğrudan
  async fetchProfileViaAPI(timeoutMs = 3200): Promise<{ name: string; email: string; picture: string } | null> {
    const deadline = Date.now() + timeoutMs;
    const remainingTime = () => Math.max(0, deadline - Date.now());

    // 1. Hidden window ile music.youtube.com DOM'undan direkt çek
    let win: BrowserWindow | null = null;
    let destroyTimeout: NodeJS.Timeout | null = null;
    try {
      const cookies = await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
      if (cookies.some(c=>c.name==='SAPISID' || c.name==='LOGIN_INFO')) {
        if (remainingTime() < 600) return null;
        win = new BrowserWindow({ show:false, width:1024, height:700, webPreferences:{ partition: MUSIC_PARTITION } });
        try { (win.webContents as any).setUserAgent(CHROME_UA); } catch {}

        // Timeout koruması: Süre aşımında pencereyi kapat ve bellek sızıntısını önle
        destroyTimeout = setTimeout(() => {
          try {
            if (win && !win.isDestroyed()) {
              win.destroy();
            }
          } catch {}
        }, remainingTime());

        // loadURL'i kalan süreyle sınırla
        await Promise.race([
          win.loadURL('https://music.youtube.com/'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), remainingTime()))
        ]);

        if (win.isDestroyed()) return null;

        // M-13: sayfa + nav-bar avatar için olay-tabanlı bekleme (deadline korumalı)
        const pollNavBarEnd = Math.min(deadline - 800, Date.now() + 1800);
        try {
          await win.webContents.executeJavaScript(buildDomWaitScript('ytmusic-nav-bar #avatar img, ytd-active-account-header-renderer #account-name, #account-name', Math.max(0, pollNavBarEnd - Date.now())), true);
        } catch {}

        if (win.isDestroyed()) return null;

        // hesap menüsü kapalıyken header renderer DOM'da olmaz — avatar'a tıklayıp aç (saf JS, TypeScript casting yok)
        try {
          await win.webContents.executeJavaScript(`(function(){ const b=document.querySelector('ytmusic-nav-bar #avatar button')||document.querySelector('ytmusic-nav-bar #avatar')||document.querySelector('#avatar-btn'); if(b && typeof b.click === 'function'){ b.click(); } })()`, true);
        } catch {}

        // M-13: menü için olay-tabanlı bekleme (deadline korumalı)
        const pollMenuEnd = Math.min(deadline - 300, Date.now() + 1000);
        try {
          await win.webContents.executeJavaScript(buildDomWaitScript('ytd-active-account-header-renderer #account-name, #account-name', Math.max(0, pollMenuEnd - Date.now())), true);
        } catch {}

        if (win.isDestroyed()) return null;

        try {
          const data: any = await win.webContents.executeJavaScript(`(function(){
            const acc=document.querySelector('ytd-active-account-header-renderer');
            let name='', email='', picture='', handle='';
            if(acc){
              const n=acc.querySelector('#account-name'); if(n) name=(n.getAttribute('title')||n.textContent||'').trim();
              const av=acc.querySelector('#avatar img#img'); let raw=''; if(av) raw=av.currentSrc||av.src||av.getAttribute('src')||'';
              if(!raw){ const av2=acc.querySelector('#avatar img'); if(av2) raw=av2.currentSrc||av2.src||''; }
              // jWzVq... s108 doğrudan ham veriden — verdiğin dump ile birebir
              if(raw && (raw.includes('yt3.ggpht.com') || raw.includes('googleusercontent'))) picture=raw;
              const em=acc.querySelector('#email'); if(em) email=(em.getAttribute('title')||em.textContent||'').trim();
              const h=acc.querySelector('#channel-handle'); if(h) handle=(h.getAttribute('title')||h.textContent||'').trim();
              if(!email && handle) email=handle;
            }
            if(!picture){
              const m=document.documentElement.innerHTML.match(/https:\\/\\/yt3\\.ggpht\\.com\\/[^"']*\\/[^"']*s108[^"']*/);
              if(m) picture=m[0];
              else {
                const m2=document.documentElement.innerHTML.match(/https:\\/\\/yt3\\.ggpht\\.com\\/[^"']+/);
                if(m2) picture=m2[0];
              }
            }
            if(picture) { picture=picture.replace(/=s\\d+[^"]*/, '=s400-c-k-c0x00ffffff-no-rj').replace(/=w\\d+.*/, '=s400-c-k-c0x00ffffff-no-rj'); }
            if(!name) {
              const n2=document.querySelector('#account-name'); if(n2) name=n2.getAttribute('title')||n2.textContent||'';
              if(!name){
                const mN=document.documentElement.innerHTML.match(/id="account-name"[^>]*title="([^"]+)"/);
                if(mN) name=mN[1];
              }
            }
            if(!email){
              const mE=document.documentElement.innerHTML.match(/id="channel-handle"[^>]*title="([^"]+)"/);
              if(mE) email=mE[1];
            }
            return JSON.stringify({name: (name||'').trim(), email: (email||'').trim(), picture: (picture||'').trim(), handle: (handle||'').trim()});
          })()`, true);
          const parsed = typeof data==='string' ? JSON.parse(data) : data;
          const validName = parsed && parsed.name && parsed.name.length>1 && parsed.name!=='Y' && parsed.name!=='YouTube Music' ? parsed.name : '';
          if (validName || (parsed && parsed.picture)) {
            logger.debug('[Auth] Hidden window profil OK:', validName || '(sadece pp)', parsed.picture ? 'pp var' : 'pp yok');
            return { name: validName, email: (parsed.email||'').startsWith('@')?'':parsed.email, picture: parsed.picture||'' };
          }
          logger.error('[Auth] Hidden window profil bulunamadı');
        } catch {}
      }
    } catch {} finally {
      if (destroyTimeout) clearTimeout(destroyTimeout);
      try {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
      } catch {}
      win = null;
    }
    // 2. Direct fetch HTML fallback (sadece kalan süre varsa)
    if (remainingTime() > 400) {
      try {
        const cookies = await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        if (cookieHeader.includes('SAPISID') || cookieHeader.includes('LOGIN_INFO')) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), remainingTime());
          try {
            const htmlRes = await fetch('https://music.youtube.com/', {
              headers: { 'Cookie': cookieHeader, 'User-Agent': CHROME_UA, 'Accept-Language': 'tr-TR,tr;q=0.9' },
              signal: controller.signal
            });
            if (htmlRes.ok) {
              const html = await htmlRes.text();
              const mName = html.match(/id="account-name"[^>]*title="([^"]+)"/) || html.match(/id="account-name"[^>]*>([^<]+)</);
              const mPic = html.match(/id="avatar"[^]*?src="([^"]+(?:googleusercontent|ggpht\.com)[^"]+)"/);
              const mHandle = html.match(/id="channel-handle"[^>]*title="([^"]+)"/);
              const mEmail = html.match(/id="email"[^>]*title="([^"]+)"/);
              const name = (mName?.[1]||'').trim();
              const picture = (mPic?.[1]||'').trim();
              const email = (mEmail?.[1]||mHandle?.[1]||'').trim();
              if (name && name.length>1 && name!=='Y') {
                logger.debug('[Auth] HTML fetch profil OK:', name);
                return { name, email: email.startsWith('@')?'':email, picture };
              }
            }
          } finally {
            clearTimeout(timer);
          }
        }
      } catch {}
    }
    // 3. YouTube Music API /account_menu fallback (sadece kalan süre varsa)
    if (remainingTime() > 400) {
      try {
        const cookies = await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
        if (!cookies.length) {
          logger.error('[Auth] API profil: cookie yok');
          return null;
        }
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remainingTime());
        try {
          const res = await fetch('https://music.youtube.com/youtubei/v1/account/account_menu', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': cookieHeader,
              'Origin': 'https://music.youtube.com',
              'Referer': 'https://music.youtube.com/',
              'User-Agent': CHROME_UA
            },
            body: JSON.stringify({
              context: { client: { hl: 'tr', gl: 'TR', clientName: 'WEB_REMIX', clientVersion: YT_CLIENT_VERSION } }
            }),
            signal: controller.signal
          });
          if (!res.ok) {
            const errText = await res.text();
            logger.error('[Auth] API profil HTTP:', res.status, '-', errText.substring(0, 200));
            return null;
          }
          const data: any = await res.json();
          logger.debug('[Auth] API profil ham veri anahtarları:', Object.keys(data).slice(0, 15));
          const item = this.findAccountItem(data);
          if (item) {
            const name = this.runsText(item.accountName);
            const picture = item.accountPhoto?.thumbnails?.slice(-1)?.[0]?.url || '';
            const email = this.runsText(item.accountBylineText)
              || this.runsText(item.accountEmail)
              || this.extractEmail(JSON.stringify(data));
            if (name || email) {
              logger.debug('[Auth] API profil OK:', name || email);
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
            logger.debug('[Auth] API profil OK (regex):', name || email);
            return { name: (name === 'Guide') ? '' : name, email, picture: '' };
          }
          logger.error('[Auth] API profil: accountItem bulunamadı');
          return null;
        } finally {
          clearTimeout(timer);
        }
      } catch (e: any) {
        logger.error('[Auth] API profil hatası:', e?.message || e);
        return null;
      }
    }
    return null;
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
      // M-13: sabit 7sn kör bekleme yerine olay-tabanlı adaptif bekleme
      // (MutationObserver erken çıkışlı, max 1.6sn; awaitPromise promise değerini bekler)
      try {
        await Runtime.evaluate({
          expression: buildDomWaitScript('ytd-active-account-header-renderer, ytmusic-app-navigation-bar, #avatar', 1600),
          returnByValue: true,
          awaitPromise: true
        });
      } catch {}
      const res = await Runtime.evaluate({
        expression: `(function(){
          try {
            let name='', email='', picture='';
            const acc = document.querySelector('ytd-active-account-header-renderer');
            if(acc){
              const n = acc.querySelector('#account-name');
              if(n) name = (n.getAttribute('title')||n.textContent||'').trim();
              const av = acc.querySelector('#avatar img');
              if(av) picture = av.src||av.getAttribute('src')||'';
              const em = acc.querySelector('#email');
              if(em) email = (em.getAttribute('title')||em.textContent||'').trim();
              if(!email){
                const h = acc.querySelector('#channel-handle');
                if(h) email = (h.textContent||'').trim();
              }
            }
            if(!name || name.length<=1){
              const html=document.documentElement.innerHTML;
              const nm=html.match(/"accountName":\\s*\\{\\s*"simpleText":\\s*"((?:[^"\\\\\\\\]|\\\\\\\\.)*)"/);
              if(nm){ try{name=JSON.parse('"'+nm[1]+'"');}catch{name=nm[1];} }
            }
            if(!picture){
              const imgs=document.querySelectorAll('ytd-active-account-header-renderer #avatar img, ytmusic-nav-bar img, header img');
              for(const img of imgs){ const s=img.currentSrc||img.src||''; if(s.includes('googleusercontent')||s.includes('ggpht.com')){picture=s;break;} }
            }
            if(!email) email=document.querySelector('#channel-handle')?.textContent?.trim()||'';
            return JSON.stringify({ name, email, picture });
          } catch(e) { return JSON.stringify({ name: '', email: '', picture: '' }); }
        })()`,
        returnByValue: true
      });
      const data = JSON.parse(res.result?.value || '{}');
      logger.debug('[Auth] CDP profil:', data);
      if (data.name || data.picture) return data;
      return null;
    } catch (e: any) {
      logger.error('[Auth] CDP profil hatası:', e?.message || e);
      return null;
    }
  }

  // Normal cikis: sadece UI store'u temizle, tarayici cookie'si kalsin (mac id gibi kalici)
  async logout(): Promise<void> {
    this.store.set('musicUser', null);
    try { this.loginWindow?.hide(); } catch {}
  }
  async logoutCompletely(): Promise<void> {
    try {
      await this.getSession().clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb', 'serviceworkers'] });
    } catch {}
    this.store.set('musicUser', null);
    try {
      const tmpProfile = (process.env.TEMP || 'C:\\Temp') + '\\harmonic-chrome-profile';
      if (fs.existsSync(tmpProfile)) fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {}
  }
}
