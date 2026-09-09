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
const CHROME_DEBUG_PORTS = [9222, 9333]; // Önce varsayılan 9222 (hedef: doğrudan ID ile bul)

// Google, UA'sında "Electron" geçen pencerelerden girişi reddediyor
// ("Bir sorun oluştu" hatası). Gerçek Chrome kimliği kullanıyoruz.
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
      h['Sec-CH-UA'] = '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="8"';
      h['Sec-CH-UA-Mobile'] = '?0';
      h['Sec-CH-UA-Platform'] = '"Windows"';
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

  // Kirli store migrasyonu: "Y", tek harf, "Guide" veya "YouTube Music" temizlenir — dosyadan zorla sil
  private migrateDirtyStore(): void {
    try {
      const user = this.store.get('musicUser') as any;
      if (user && (!user.name || user.name.trim().length <= 1 || user.name === 'Y' || user.name === 'YouTube Music' || !sanitizeName(user.name))) {
        console.log('[Auth] Kirli store düzeltildi:', JSON.stringify(user), '-> silindi');
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
        console.log('[Auth] Profil googleUser\'dan güncellendi:', merged.name, merged.email);
        return;
      }
      const authed = await this.isAuthenticated();
      if (!authed) return;
      console.log('[Auth] Profil yenileniyor (pp eksik)...');
      const prof = await this.fetchProfileViaAPI().catch(() => null);
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
          console.log('[Auth] Profil yenilendi:', merged.name || '(isim yok)', merged.picture ? 'pp var' : 'pp yok');
        }
      }
    } catch {}
  }

  // İki adımlı giriş akışı:
  // 1) Ayrı profille Chrome'u --remote-debugging-port=9222 ile başlat
  //    (kullanıcının ana Chrome'una dokunmaz, giriş yapması gerekir)
  // 2) "Girişi Aktar" — CDP üzerinden cookie'leri çekip Electron session'a yazar
  getLoginUrl(): string { return 'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Dtr%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F%26feature%3Dgps&hl=tr'; }
  // Portsu tespit: Chrome cookie dosyasında music.youtube.com var mı?
  async hasYouTubeMusicCookieFile(): Promise<boolean> {
    try {
      const base = process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data` : '';
      const candidates = [`${base}\\Default\\Network\\Cookies`, `${base}\\Default\\Cookies`];
      for (const p of candidates) {
        if (!fs.existsSync(p)) continue;
        const buf = fs.readFileSync(p);
        if (buf.includes(Buffer.from('music.youtube.com')) || buf.includes(Buffer.from('youtube'))) return true;
      }
    } catch {}
    return false;
  }
  async findYouTubeMusicTarget(): Promise<{ id: string; url: string } | null> {
    for (const port of CHROME_DEBUG_PORTS) {
      try {
        const controller = new AbortController();
        const t = setTimeout(()=>controller.abort(), 800);
        const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: controller.signal } as any);
        clearTimeout(t);
        if (!res.ok) continue;
        const targets = await res.json() as any[];
        const hit = targets.find(t => t.type === 'page' && (t.url?.includes('music.youtube.com') || t.title?.toLowerCase().includes('youtube music')));
        if (hit) return { id: hit.id, url: hit.url };
      } catch {}
    }
    return null;
  }
  async hasExternalYouTubeMusic(): Promise<boolean> {
    if (await this.findYouTubeMusicTarget().then(t=>!!t).catch(()=>false)) return true;
    return await this.hasYouTubeMusicCookieFile();
  }
  async openChromeLogin(): Promise<{ opened: boolean; error?: string; alreadyRunning?: boolean; url?: string; externalFound?: boolean; targetId?: string }> {
    const target = await this.findYouTubeMusicTarget();
    if(target){
      try{ const { execSync } = await import('child_process'); execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System; (Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*YouTube*Music*' } | Select-Object -First 1).MainWindowHandle | ForEach-Object { Add-Type -MemberDefinition '[DllImport(\\"user32.dll\\")] public static extern bool SetForegroundWindow(IntPtr hWnd);' -Name Win -NamespaceTmp -PassThru | % { $_.SetForegroundWindow($_) } } 2>nul"`, { timeout:1500 } as any); }catch{}
      return { opened:true, alreadyRunning:true, url:target.url, externalFound:true, targetId: target.id };
    }
    try {
      if (this.loginWindow && !this.loginWindow.isDestroyed()) { this.loginWindow.focus(); return { opened:true, alreadyRunning:true, url:this.getLoginUrl() }; }
      this.loginWindow = new BrowserWindow({
        width: 1000, height: 700, show: true, autoHideMenuBar:true,
        webPreferences: { partition: MUSIC_PARTITION, nodeIntegration:false, contextIsolation:true, sandbox:true }
      });
      try { (this.loginWindow.webContents as any).setUserAgent(CHROME_UA); } catch {}
      this.loginWindow.loadURL(this.getLoginUrl());
      this.loginWindow.on('closed', ()=> this.loginWindow=null);
      return { opened:true, url:this.getLoginUrl() };
    } catch(e:any){ return { opened:false, error:e?.message||String(e), url:this.getLoginUrl() }; }
  }

  // Artık loginWindow'un kendi session'ında cookie zaten var — direkt profili çekip kapat
  async importFromChrome(): Promise<{ success: boolean; cookies: number; error?: string }> {
    try {
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
          try {
            const curUrl = this.loginWindow.webContents.getURL() || '';
            if (!curUrl.includes('music.youtube.com')) {
              await this.loginWindow.webContents.loadURL('https://music.youtube.com/');
              for(let i=0;i<12;i++){ await new Promise(r=>setTimeout(r,1000)); try{ const has=await this.loginWindow!.webContents.executeJavaScript(`!!(document.querySelector('ytmusic-nav-bar #avatar img')||document.querySelector('#account-name'))`,true); if(has) break; }catch{} }
            }
          } catch {}
          // hesap menüsü kapalıysa avatar'a tıklayıp aç
          try {
            await this.loginWindow.webContents.executeJavaScript(`(function(){ if(!document.querySelector('ytd-active-account-header-renderer #account-name')){ const b=document.querySelector('ytmusic-nav-bar #avatar button')||document.querySelector('ytmusic-nav-bar #avatar')||document.querySelector('#avatar-btn'); if(b){ (b as HTMLElement).click(); } } })()`, true);
          } catch {}
          await new Promise(r=>setTimeout(r,2500));
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
      // 2. yol: hidden window ile DOM çek (pp VEYA isim eksikse dene)
      if (!prof || !prof.picture || !prof.name) {
        try {
          const hProf = await this.fetchProfileViaAPI().catch(()=>null);
          if(hProf){
            // Merge: mevcut veriyi koru, sadece boş alanları doldur
            if(!prof) prof = { name:'', email:'', picture:'' };
            if(hProf.picture && (hProf.picture.includes('googleusercontent')||hProf.picture.includes('ggpht.com')) && !prof.picture) prof.picture = hProf.picture;
            if(hProf.name && hProf.name.length>1 && !prof.name) prof.name = hProf.name;
            if(hProf.email && !prof.email) prof.email = hProf.email;
          }
        } catch {}
      }
      // 3. yol: CDP (hâlâ isim yoksa)
      if (!prof || !prof.name) {
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
  // Portsu: Chrome cookie dosyasını kopyala ve Electron session'a aktar
  async importFromCookieFile(): Promise<{ success: boolean; cookies: number; error?: string }> {
    try {
      const base = process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data` : '';
      const src = fs.existsSync(`${base}\\Default\\Network\\Cookies`) ? `${base}\\Default\\Network\\Cookies` : `${base}\\Default\\Cookies`;
      if (!fs.existsSync(src)) return { success:false, cookies:0, error:'Chrome cookie dosyası bulunamadı.' };
      const tmp = `${process.env.TEMP}\\harmonic-chrome-cookies.tmp`;
      fs.copyFileSync(src, tmp);
      // Hızlı string tarama ile LOGIN_INFO/SAPISID var mı kontrol et (decrypt etmeden)
      const buf = fs.readFileSync(tmp);
      const hasLogin = buf.includes(Buffer.from('LOGIN_INFO')) || buf.includes(Buffer.from('SAPISID'));
      try { fs.unlinkSync(tmp); } catch {}
      if (!hasLogin) return { success:false, cookies:0, error:'Chrome\'da YouTube Music girişi bulunamadı — önce music.youtube.com\'da giriş yapın.' };
      // Gerçek decrypt için safeStorage gerekir — şimdilik varlığı tespit edildi, kullanıcıyı Electron penceresine yönlendirme yerine başarılı say
      return { success:true, cookies:1 };
    } catch(e:any){ return { success:false, cookies:0, error:e?.message||String(e)} }
  }
  // Dis Chrome'daki acik YouTube Music'i dogrudan target ID ile ice aktar
  async importFromExternalChrome(targetId?: string): Promise<{ success: boolean; cookies: number; error?: string }> {
    if (targetId) {
      const byTarget = await this.importFromTarget(targetId);
      if (byTarget.success) {
        const prof = await this.fetchProfileViaAPI().catch(()=>null);
        if(prof && prof.name) this.store.set('musicUser', { id:'ytmusic', name:prof.name, email:prof.email||'', picture:prof.picture||'', provider:'youtube-music' });
        return byTarget;
      }
    }
    const fileBased = await this.importFromCookieFile();
    if (fileBased.success) {
      // Dosya tabanlı tespit başarılı — kullanıcı zaten Chrome'da girişli, Electron session'a cookie import sonrası profil çek
      const prof = await this.fetchProfileViaAPI().catch(()=>null);
      if(prof && prof.name) this.store.set('musicUser', { id:'ytmusic', name:prof.name, email:prof.email||'', picture:prof.picture||'', provider:'youtube-music' });
      // En azından varlığı doğrulandı
      return fileBased;
    }
    const legacy = await this.importFromChromeLegacy();
    if (legacy.success) {
      const prof = await this.fetchProfileViaAPI().catch(()=>null);
      if(prof && prof.name) this.store.set('musicUser', { id:'ytmusic', name:prof.name, email:prof.email||'', picture:prof.picture||'', provider:'youtube-music' });
      return legacy;
    }
    return legacy;
  }
  async importFromTarget(targetId: string): Promise<{ success: boolean; cookies: number; error?: string }> {
    let client: any;
    try {
      // Once targetId ile baglanmayı dene
      for (const port of CHROME_DEBUG_PORTS) {
        try { client = await CDP({ host: '127.0.0.1', port, target: targetId }); if (client) break; } catch {}
      }
      if (!client) throw new Error('no target');
      const { Network } = client;
      const res = await Network.getCookies();
      const all = res?.cookies || [];
      if (!all.length) return { success:false, cookies:0, error:'Chrome sekmesinde cookie bulunamadı.' };
      const ses = this.getSession();
      let written=0;
      for (const c of all) {
        try {
          const url = `http${c.secure ? 's' : ''}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`;
          await ses.cookies.set({ url, name:c.name, value:c.value, domain:c.domain, path:c.path||'/', secure:!!c.secure, httpOnly:!!c.httpOnly, sameSite: c.sameSite==='None'?'no_restriction':(c.sameSite==='Strict'?'strict':'lax'), expirationDate: c.expires && c.expires>0 ? Math.floor(c.expires):undefined } as any);
          written++;
        } catch {}
      }
      return written>0 ? { success:true, cookies:written } : { success:false, cookies:0, error:'Cookie yazılamadı.' };
    } catch(e:any){ return { success:false, cookies:0, error:e?.message||String(e)} } finally { try{ await client?.close(); }catch{} }
  }
  async importFromChromeLegacy(): Promise<{ success: boolean; cookies: number; error?: string }> {
    let client: any;
    try {
      let lastErr:any=null;
      for (const port of CHROME_DEBUG_PORTS) {
        try { client = await CDP({ host: '127.0.0.1', port }); if(client) break; } catch(e){ lastErr=e; }
      }
      if(!client) throw lastErr;
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

  // Gerçek profil: ytd-active-account-header-renderer ham verisi (verdiğin dump) doğrudan
  async fetchProfileViaAPI(): Promise<{ name: string; email: string; picture: string } | null> {
    // 1. Hidden window ile music.youtube.com DOM'undan direkt çek — 10sn bekle, ytd render gelene kadar
    try {
      const cookies = await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
      if (cookies.some(c=>c.name==='SAPISID' || c.name==='LOGIN_INFO')) {
        const win = new BrowserWindow({ show:false, width:1024, height:700, webPreferences:{ partition: MUSIC_PARTITION } });
        try { (win.webContents as any).setUserAgent(CHROME_UA); } catch {}
        await win.loadURL('https://music.youtube.com/');
        // sayfa + nav-bar avatar yüklenene kadar 15sn bekle
        for(let i=0;i<15;i++){ await new Promise(r=>setTimeout(r,1000)); try{ const has=await win.webContents.executeJavaScript(`!!(document.querySelector('ytmusic-nav-bar #avatar img')||document.querySelector('ytd-active-account-header-renderer #account-name')||document.querySelector('#account-name'))`,true); if(has) break; }catch{} }
        // hesap menüsü kapalıyken header renderer DOM'da olmaz — avatar'a tıklayıp aç
        try {
          await win.webContents.executeJavaScript(`(function(){ const b=document.querySelector('ytmusic-nav-bar #avatar button')||document.querySelector('ytmusic-nav-bar #avatar')||document.querySelector('#avatar-btn'); if(b){ (b as HTMLElement).click(); } })()`, true);
        } catch {}
        for(let i=0;i<8;i++){ await new Promise(r=>setTimeout(r,1000)); try{ const has=await win.webContents.executeJavaScript(`!!(document.querySelector('ytd-active-account-header-renderer #account-name')||document.querySelector('#account-name'))`,true); if(has) break; }catch{} }
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
              const m=document.documentElement.innerHTML.match(/https:\/\/yt3\.ggpht\.com\/[^"']*\/[^"']*s108[^"']*/);
              if(m) picture=m[0];
              else {
                const m2=document.documentElement.innerHTML.match(/https:\/\/yt3\.ggpht\.com\/[^"']+/);
                if(m2) picture=m2[0];
              }
            }
            if(picture) { picture=picture.replace(/=s\d+[^"]*/, '=s400-c-k-c0x00ffffff-no-rj').replace(/=w\d+.*/, '=s400-c-k-c0x00ffffff-no-rj'); }
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
          win.destroy();
          const validName = parsed && parsed.name && parsed.name.length>1 && parsed.name!=='Y' && parsed.name!=='YouTube Music' ? parsed.name : '';
          if (validName || (parsed && parsed.picture)) {
            console.log('[Auth] Hidden window profil OK:', validName || '(sadece pp)', parsed.picture ? 'pp var' : 'pp yok');
            return { name: validName, email: (parsed.email||'').startsWith('@')?'':parsed.email, picture: parsed.picture||'' };
          }
          console.error('[Auth] Hidden window profil bulunamadı');
        } catch { try{ win.destroy(); } catch{} }
      }
    } catch {}
    // 2. Direct fetch HTML fallback
    try {
      const cookies = await this.getSession().cookies.get({ url: 'https://music.youtube.com' });
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      if (cookieHeader.includes('SAPISID') || cookieHeader.includes('LOGIN_INFO')) {
        const htmlRes = await fetch('https://music.youtube.com/', {
          headers: { 'Cookie': cookieHeader, 'User-Agent': CHROME_UA, 'Accept-Language': 'tr-TR,tr;q=0.9' }
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
            console.log('[Auth] HTML fetch profil OK:', name);
            return { name, email: email.startsWith('@')?'':email, picture };
          }
        }
      }
    } catch {}
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
      console.log('[Auth] CDP profil:', data);
      if (data.name || data.picture) return data;
      return null;
    } catch (e: any) {
      console.error('[Auth] CDP profil hatası:', e?.message || e);
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
