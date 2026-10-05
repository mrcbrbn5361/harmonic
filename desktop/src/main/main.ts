import { app, BrowserWindow, ipcMain, nativeTheme, shell, Menu, dialog, clipboard } from 'electron';
import * as path from 'path';
import { YouTubeAPI } from './api/innertube';
import { StoreManager } from './utils/store';
import { DiscordRPC } from './utils/discord';
import { DiscordOAuth } from './auth/discord-oauth';
import { GoogleOAuth } from './auth/google-oauth';
import { MusicAuth } from './auth/music-auth';
import { ExternalLoginManager } from './auth/external-login';
import { StreamResolver } from './api/stream-resolver';
import { authProvider } from './providers/auth-provider';
import { volumeRatioProvider } from './providers/volume-ratio';
import { lyricsProvider } from './providers/lyrics-provider';
import { autoUpdater } from 'electron-updater';
import { BotServer, sanitizeBotStateUpdate } from './api/bot-server';
import { logger } from './utils/logger';

// Gizli çözücü penceresinde otomatik oynatmaya izin ver (kullanıcı hareketi gerekmesin)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Google girişi için Client Hints desteği
app.commandLine.appendSwitch('enable-features', 'ClientHints,UserAgentClientHint');
// Electron'un kendi gizli User Data klasörünü kullan (Chrome ile çakışmasın)
const userData = path.join(app.getPath('appData'), 'Harmonic');
app.setPath('userData', userData);

let mainWindow: BrowserWindow | null = null;
let youtubeAPI: YouTubeAPI;
let storeManager: StoreManager;
let discordRPC: DiscordRPC;
let discordOAuth: DiscordOAuth;
let googleAuth: GoogleOAuth;
let musicAuth: MusicAuth;
let externalLogin: ExternalLoginManager;
let streamResolver: StreamResolver;
let botServer: BotServer;
let resolverListenerSet = false;

const isDev = !app.isPackaged;

function createWindow(): void {
  // Kayıtlı pencere boyutu/konumu varsa geri yükle (bk. ANALIZ-RAPORU M-04).
  const savedBounds = storeManager.get('windowBounds');
  const initWidth = savedBounds && savedBounds.width >= 960 ? savedBounds.width : 1280;
  const initHeight = savedBounds && savedBounds.height >= 640 ? savedBounds.height : 820;
  const initPos: { x?: number; y?: number } = savedBounds && Number.isFinite(savedBounds.x) && Number.isFinite(savedBounds.y)
    ? { x: savedBounds.x, y: savedBounds.y }
    : {};
  mainWindow = new BrowserWindow({
    width: initWidth,
    height: initHeight,
    ...initPos,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#07070a',
    backgroundMaterial: 'mica' as any,
    show: false,
    roundedCorners: true,
    thickFrame: true,
    icon: path.join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        // NOT: ana pencere bilinçli olarak default partition'dadır — Google
        // cookie'leri yalnızca persist:harmonic tarafında yaşar (login +
        // StreamResolver gizli penceresi). Renderer cookie'yi DOM'dan değil,
        // header enjeksiyonu (cookie provider) üzerinden kullanır; ana pencereyi
        // persist:harmonic'e almak renderer'a cookie erişimi açardı.
        sandbox: true
      }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Gizli oynatıcı penceresi window-all-closed'ı engeller — burada kapat
    try { streamResolver?.destroy(); } catch {}
    try { discordRPC?.disconnect(); } catch {}
    if (process.platform !== 'darwin') app.quit();
  });

  mainWindow.on('close', () => {
    try { streamResolver?.destroy(); } catch {}
    try { discordRPC?.disconnect(); } catch {}
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('win:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('win:maximized', false);
  });

  // Pencere boyutunu/konumunu hatırla (debounce'lu + kapanışta kesin yaz).
  const persistBounds = () => {
    try {
      const b = mainWindow?.getBounds();
      if (b) storeManager.saveWindowBounds(b);
    } catch {}
  };
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePersistBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistBounds, 500);
  };
  mainWindow.on('resize', schedulePersistBounds);
  mainWindow.on('move', schedulePersistBounds);
  mainWindow.on('close', persistBounds);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allowlist denetimi IPC ile aynı tek kaynaktan (bk. ANALIZ-RAPORU M-07).
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  buildMenu();

  // Production'da F12, DevTools, F5 ve Ctrl+R sayfa yenilemelerini engelle (müzik kesilmesin)
  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'i')) ||
        input.key === 'F5' ||
        (input.control && (input.key === 'r' || input.key === 'R'))
      ) {
        event.preventDefault();
      }
    });
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Dosya',
      submenu: [
        { label: 'Çıkış', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Düzenle',
      submenu: [
        { label: 'Geri Al', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Yinele', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Kes', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Kopyala', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Yapıştır', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'Görünüm',
      submenu: [
        { label: 'Yeniden Yükle', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Geliştirici Araçları', accelerator: 'F12', role: 'toggleDevTools', visible: isDev },
        { type: 'separator' },
        { label: 'Tam Ekran', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Yardım',
      submenu: [
        {
          label: 'Harmonic Hakkında',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'Harmonic',
              message: `Harmonic v${app.getVersion()}`,
              detail: 'Windows 11 için modern, reklamsız ve Discord bot entegrasyonlu müzik istemcisi.\n\n© 2026 Harmonic Team. Tüm hakları saklıdır.',
              buttons: ['Tamam']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Dış bağlantı allowlist'i — TEK KAYNAK (IPC + windowOpenHandler ikisi de burayı kullanır).
function isAllowedExternalUrl(raw: string): boolean {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    const allowed = ['music.youtube.com', 'youtube.com', 'www.youtube.com', 'github.com', 'ytimg.com', 'accounts.google.com', 'accounts.youtube.com'];
    return allowed.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function setupIPC(): void {
  ipcMain.on('win:minimize', () => mainWindow?.minimize());
  ipcMain.on('win:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('win:close', () => mainWindow?.close());
  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false);

  // ── Renderer log köprüsü (arayüzden gelen debug mesajları) ──
  ipcMain.on('debug:log', (_, msg: string) => {
    logger.debug('[UI]', msg);
  });

  // YouTube API
  ipcMain.handle('yt:search', async (_, query: string) => {
    try {
      const result = await youtubeAPI.search(query);
      logger.debug('[Main] Search:', query, 'songs:', result.songs?.length || 0, 'videos:', result.videos?.length || 0);
      logger.debug('[Main] Search first song:', JSON.stringify(result.songs?.[0]));
      return result;
    } catch (err) {
      logger.error('[Main] Search error:', err);
      return { songs: [], videos: [], albums: [], artists: [], playlists: [] };
    }
  });
  ipcMain.handle('yt:player', async (_, videoId: string) => {
    // Girişli session ile gizli pencerede şarkıyı oynat
    if (!(await musicAuth.isAuthenticated())) {
      return { error: 'not_authenticated', id: videoId };
    }
    // Event listener'ları kur (ilk IPC çağrısı için)
    if (!resolverListenerSet) {
      resolverListenerSet = true;
      streamResolver.onUpdate((u) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player:update', u);
        }
      });
      streamResolver.onError((msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player:error', msg);
        }
      });
    }
    // Çözücü yok edildiyse sahte "playing:true" dönme (bk. ANALIZ-RAPORU M-02).
    if (!streamResolver.isUsable()) {
      return { id: videoId, playing: false, error: 'player_unavailable' };
    }
    try {
      // Oynatmayı başlat (fire & forget — ana pencere state'i update event'iyle alır;
      // gerçek yükleme hataları 'player:error' kanalından iletilir)
      streamResolver.play(videoId).catch((err) => logger.error('[Player] play error:', err));
      return { id: videoId, playing: true };
    } catch (err: any) {
      logger.error('[Player] play sync error:', err?.message || err);
      return { id: videoId, playing: false, error: 'play_failed' };
    }
  });

  ipcMain.handle('player:pause', async () => {
    await streamResolver.pause();
    return true;
  });
  ipcMain.handle('player:resume', async () => {
    await streamResolver.resume();
    return true;
  });
  ipcMain.handle('player:seek', async (_, seconds: number) => {
    await streamResolver.seek(seconds);
    return true;
  });
  ipcMain.handle('player:setVolume', async (_, vol: number) => {
    await streamResolver.setVolume(vol);
    return true;
  });
  ipcMain.handle('player:next', async () => {
    await streamResolver.next();
    return true;
  });
  ipcMain.handle('player:prev', async () => {
    await streamResolver.prev();
    return true;
  });
  ipcMain.handle('player:skipAd', async () => {
    await streamResolver.skipAd();
    return true;
  });
  ipcMain.handle('yt:home', async () => {
    try {
      const result = await youtubeAPI.getHome();
      logger.debug('[Main] Home items:', result.items?.length || 0);
      if (result.items?.length) {
        logger.debug('[Main] Home first item:', JSON.stringify(result.items[0]));
      }
      return result;
    } catch (err) {
      logger.error('[Main] Home error:', err);
      return { items: [] };
    }
  });
  ipcMain.handle('yt:browse', async (_, browseId: string, params?: string) => {
    try { 
      const result = await youtubeAPI.browse(browseId, params);
      return result; 
    } catch (err) { 
      logger.error('[Main] Browse error:', browseId, err);
      return { title: '', items: [] }; 
    }
  });
  ipcMain.handle('yt:next', async (_, videoId: string, playlistId?: string) => {
    try { return await youtubeAPI.getNext(videoId, playlistId); } catch { return { items: [], currentIndex: 0 }; }
  });
  ipcMain.handle('yt:suggestions', async (_, input: string) => {
    try { return await youtubeAPI.getSearchSuggestions(input); } catch { return []; }
  });
  ipcMain.handle('yt:lyrics', async (_, videoId: string, title?: string, artist?: string, duration?: number) => {
    try { return await lyricsProvider.fetch(videoId, youtubeAPI, title, artist, duration); } catch { return null; }
  });
  ipcMain.handle('yt:libraryPlaylists', async () => {
    try { return await youtubeAPI.getLibraryPlaylists(); } catch { return []; }
  });
  ipcMain.handle('yt:likedSongs', async () => {
    try { return await youtubeAPI.getLikedSongs(); } catch { return []; }
  });
  ipcMain.handle('yt:libraryArtists', async () => {
    try { return await youtubeAPI.getLibraryArtists(); } catch { return []; }
  });
  ipcMain.handle('yt:libraryAlbums', async () => {
    try { return await youtubeAPI.getLibraryAlbums(); } catch { return []; }
  });

  // Store — Renderer allowlist koruması (İsmail Dede Bulgu-2 / Analyst Şartnamesi)
  const ALLOWED_RENDERER_STORE_READ_KEYS = new Set([
    'theme',
    'volume',
    'quality',
    'autoPlay',
    'recentlyPlayed',
    'likedSongs',
    'likedSongsDetails',
    'queue',
    'queueIndex',
    'playlists',
    'shuffle',
    'repeat',
    'discordEnabled',
    'discordButtons',
    'discordThumbnails',
    'customDiscordAppId',
    'botServerEnabled'
  ]);

  const ALLOWED_RENDERER_STORE_WRITE_KEYS = new Set([
    'theme',
    'volume',
    'quality',
    'autoPlay',
    'recentlyPlayed',
    'likedSongs',
    'likedSongsDetails',
    'queue',
    'queueIndex',
    'playlists',
    'shuffle',
    'repeat',
    'discordEnabled',
    'discordButtons',
    'discordThumbnails',
    'customDiscordAppId'
  ]);

  ipcMain.handle('store:get', (_, key: string) => {
    if (!ALLOWED_RENDERER_STORE_READ_KEYS.has(key)) {
      logger.warn(`[Security] Unauthorized store:get attempted for key: ${key}`);
      return undefined;
    }
    return storeManager.get(key as any);
  });

  ipcMain.handle('store:set', (_, key: string, value: unknown) => {
    if (!ALLOWED_RENDERER_STORE_WRITE_KEYS.has(key)) {
      logger.warn(`[Security] Unauthorized store:set blocked for key: ${key}`);
      return;
    }
    if (key === 'customDiscordAppId' && value) {
      if (typeof value !== 'string' || (!/^\d{17,20}$/.test(value.trim()) && value.trim() !== '')) {
        logger.warn(`[Security] Invalid customDiscordAppId value rejected: ${value}`);
        return;
      }
    }
    storeManager.set(key as any, value);
  });
  ipcMain.handle('shell:openExternal', (_, url: string) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(new URL(String(url)).toString());
    }
  });

  // ── Auth IPC ─────────────────────────────────
  ipcMain.handle('auth:loginGoogle', async () => {
    if (!mainWindow) return { success: false, error: 'Pencere bulunamadı' };
    const config = googleAuth.getGoogleConfig();
    if (!config.clientId || !config.clientSecret) {
      return { success: false, error: 'Google bilgileri eksik (uygulama paketi hatalı).' };
    }
    const result = await googleAuth.loginGoogle(mainWindow, config.clientId, config.clientSecret);
    if (result.success) {
      youtubeAPI.setAccessToken(googleAuth.getGoogleAccessToken());
    }
    return result;
  });

  ipcMain.handle('auth:logoutGoogle', async () => {
    await googleAuth.logoutGoogle();
    youtubeAPI.setAccessToken(null);
    return { success: true };
  });

  ipcMain.handle('auth:isGoogleAuthenticated', () => googleAuth.isGoogleAuthenticated());
  ipcMain.handle('auth:getGoogleUser', () => googleAuth.getGoogleUser());
  ipcMain.handle('auth:getGoogleAccessToken', () => {
    return { hasToken: Boolean(googleAuth.getGoogleAccessToken()) };
  });

  ipcMain.handle('auth:setGoogleConfig', (_, { clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
    googleAuth.setGoogleConfig(clientId, clientSecret);
  });
  ipcMain.handle('auth:getGoogleConfig', () => {
    const cfg = googleAuth.getGoogleConfig();
    return {
      configured: Boolean(cfg.clientId && cfg.clientSecret),
      clientId: cfg.clientId || ''
    };
  });

  // ── YouTube Music cookie girişi IPC ──────────
  // Birincil yol: harici tarayıcı + loopback polling (external-login).
  // İkincil yol: gömülü login penceresi (challenge'a düşebilir).
  ipcMain.handle('auth:externalLoginStart', async () => {
    return await externalLogin.start();
  });
  ipcMain.handle('auth:externalLoginStatus', async (_, loginId: string, nonce?: string) => {
    return await externalLogin.status(String(loginId || ''), nonce);
  });
  ipcMain.handle('auth:externalLoginImport', async (_, loginId: string, nonce?: string) => {
    const r: any = await externalLogin.import(String(loginId || ''), nonce);
    if (r?.success) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth:externalLoginDone', { success: true, user: musicAuth.getUser(), cookies: r.cookies });
        }
      } catch {}
    }
    return r;
  });
  ipcMain.handle('auth:externalLoginCancel', (_, loginId: string) => {
    return externalLogin.cancel(String(loginId || ''));
  });
  ipcMain.handle('auth:openChromeLogin', async () => {
    return await musicAuth.openChromeLogin();
  });
  // Giriş penceresi verify/challenge durumu (renderer "Chrome'da tamamla" dalı).
  ipcMain.handle('auth:getLoginState', () => musicAuth.getLoginState());
  ipcMain.handle('auth:importFromChrome', async () => {
    // Verify early-return: challenge ekranındayken dış Chrome'a otomatik düşme.
    try {
      const st = musicAuth.getLoginState();
      if (st.verifyChallenge) return { success: false, cookies: 0, error: st.help };
    } catch {}
    let result = await musicAuth.importFromChrome();
    if (!result.success) {
      const target = await musicAuth.findYouTubeMusicTarget().catch(()=>null);
      const ext = await musicAuth.importFromExternalChrome(target?.id).catch(()=>null);
      if (ext && ext.success) result = ext as any;
    }
    if (result.success) {
      // importFromChrome zaten profili kaydetti. Ek olarak streamResolver'dan da dene
      // ama sadece mevcut verileri GÜNCELLE — boş alanları eski veriyle doldur
      try {
        const prof = await streamResolver.fetchAccountProfile();
        if (prof && prof.name && prof.name !== 'Guide' && prof.name.length > 1) {
          const existing = musicAuth.getUser();
          musicAuth.setUser({
            id: 'ytmusic',
            name: prof.name || existing?.name || '',
            email: prof.email || existing?.email || '',
            picture: prof.picture || existing?.picture || '',
            provider: 'youtube-music'
          });
        }
      } catch {}
      // En son kaydedilen kullanıcıyı dön (importFromChrome zaten kaydetti)
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth:externalLoginDone', { success: true, user: musicAuth.getUser() });
        }
      } catch {}
      return { success: true, cookies: result.cookies, user: musicAuth.getUser() };
    }
    return result;
  });
  ipcMain.handle('auth:logoutMusic', async () => {
    await musicAuth.logout();
    return { success: true };
  });
  ipcMain.handle('auth:isMusicAuthenticated', () => musicAuth.isAuthenticated());
  ipcMain.handle('auth:getMusicUser', () => musicAuth.getUser());

  // ── Discord Rich Presence IPC (yalnızca resmi RPC/IPC yolu — token yok) ──
  ipcMain.handle('discord:getAppId', () => discordRPC.getAppId());
  ipcMain.handle('discord:setAppId', async (_, appId: string) => {
    const trimmed = (appId || '').trim();
    if (trimmed && !/^\d{17,20}$/.test(trimmed)) {
      logger.warn(`[Security] Invalid Discord appId format: ${trimmed}`);
      return false;
    }
    storeManager.set('customDiscordAppId', trimmed);
    return await discordRPC.setAppId(trimmed);
  });
  ipcMain.handle('discord:isReady', () => discordRPC.isReady());
  ipcMain.handle('discord:setActivity', async (_, data) => {
    const enabled = storeManager.get('discordEnabled');
    if (enabled === false) return;
    const showButtons = storeManager.get('discordButtons');
    const showThumbs = storeManager.get('discordThumbnails');
    if (showButtons === false) delete (data as any).buttons;
    if (showThumbs === false) { delete (data as any).coverUrl; delete (data as any).largeImageText; }
    if (data && Array.isArray((data as any).buttons)) {
      (data as any).buttons = (data as any).buttons.filter((b: any) =>
        b && typeof b.label === 'string' && typeof b.url === 'string' && isAllowedExternalUrl(b.url)
      );
    }
    if (discordRPC.isReady()) {
      await discordRPC.setActivity(data);
    }
  });
  ipcMain.handle('discord:clearActivity', async () => {
    await discordRPC.clearActivity();
  });

  // ── Discord OAuth girişi (resmi Authorization Code + PKCE — kullanıcı tokeni yok) ──
  ipcMain.handle('discord:login', async () => {
    if (!mainWindow) return { success: false, error: 'Pencere bulunamadı' };
    return await discordOAuth.loginDiscord(mainWindow);
  });
  ipcMain.handle('discord:logout', async () => {
    await discordOAuth.logoutDiscord();
    return true;
  });
  ipcMain.handle('discord:getUser', () => discordOAuth.getDiscordUser());

  // ── Auth clients (ytmdesktop2 auth) ───────
  // NOT: renderer'a token'sız görünüm verilir (bk. ANALIZ-RAPORU S-01).
  ipcMain.handle('auth:clients', () => authProvider.listPublicClients());
  ipcMain.handle('auth:createClient', (_, d:{appId:string;appName:string}) => {
    if (!d || typeof d.appId !== 'string' || typeof d.appName !== 'string') return null;
    const appId = d.appId.trim();
    const appName = d.appName.trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(appId) || appName.length < 1 || appName.length > 80) {
      logger.warn(`[Security] Invalid auth client creation parameters`);
      return null;
    }
    return authProvider.createManual({ appId, appName });
  });
  ipcMain.handle('auth:revokeClient', (_, appId:string) => authProvider.revoke(appId));
  // ── VolumeRatio ───────────────────────────
  ipcMain.handle('volumeRatio:isEnabled', () => volumeRatioProvider.isEnabled());
  ipcMain.handle('volumeRatio:setEnabled', async (_, v: boolean) => {
    volumeRatioProvider.setEnabled(v);
    if (streamResolver) {
      await streamResolver.setVolume(streamResolver.getVolume());
    }
  });
  // ── Lyrics ────────────────────────────────
  ipcMain.handle('lyrics:isEnabled', () => lyricsProvider.isEnabled());
  ipcMain.handle('lyrics:setEnabled', (_, v:boolean) => lyricsProvider.setEnabled(v));

  // ── Discord Bot REST API (Port 9863) ───────
  ipcMain.handle('botServer:getState', () => botServer.getState());
  ipcMain.handle('botServer:updateState', (_, data) => {
    botServer.updateState(sanitizeBotStateUpdate(data));
    return true;
  });
  ipcMain.handle('botServer:toggle', async (_, enable: boolean) => {
    storeManager.set('botServerEnabled', enable);
    if (enable) {
      return await botServer.start();
    } else {
      await botServer.stop();
      return false;
    }
  });
  ipcMain.handle('botServer:getStatus', () => ({
    running: botServer.isRunning(),
    port: botServer.getPort()
  }));
  ipcMain.handle('botServer:getAuth', () => botServer.getAuth());
  ipcMain.handle('botServer:setAuthEnabled', async (_, enable: boolean) => {
    if (typeof enable !== 'boolean') return botServer.getAuth();
    if (!enable) {
      // Güvenlik (M-08): Token korumasını kapatmak ana süreçte kullanıcı onayı gerektirir (renderer atlatamaz)
      let userConfirmed = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const res = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: ['Vazgeç', 'Korumayı Kapat'],
          defaultId: 0,
          cancelId: 0,
          title: 'Güvenlik Onayı',
          message: 'Discord Bot API token korumasını kapatmak istiyor musunuz?',
          detail: 'Token koruması kapatıldığında yerel ağdaki veya bilgisayarınızdaki tüm uygulamalar kimlik doğrulaması olmadan bot verilerinize erişebilir.'
        });
        userConfirmed = res.response === 1;
      }
      if (!userConfirmed) {
        logger.warn('[BotServer] Token korumasını kapatma işlemi onaylanmadı.');
        return botServer.getAuth();
      }
    }
    return botServer.setAuthEnabled(enable);
  });
  ipcMain.handle('botServer:regenerateToken', () => {
    const auth = botServer.regenerateToken();
    const raw = botServer.getRawToken();
    if (raw) clipboard.writeText(raw);
    return auth;
  });
  ipcMain.handle('botServer:copyToken', () => {
    const raw = botServer.getRawToken();
    if (raw) clipboard.writeText(raw);
    return true;
  });

  // ── Auto-update ─────────────────────────────
  // NOT: stub yok — gerçek denetim yapılır, sonuç (hata dahil) renderer'a döner (bk. M-05).
  ipcMain.handle('auto:checkForUpdates', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      const v = r?.updateInfo?.version;
      return v && v !== app.getVersion()
        ? { status: 'available', version: v }
        : { status: 'up-to-date', version: app.getVersion() };
    } catch (err: any) {
      logger.warn('[Auto] check failed:', err?.message || err);
      return { status: 'error', message: err?.message || String(err) };
    }
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('auto:getUpdateStatus', () => {
    return {
      version: app.getVersion(),
      releaseNotes: null,
      releaseDate: null,
      forced: false
    };
  });
}

if (!app.isDefaultProtocolClient('harmonic')) app.setAsDefaultProtocolClient('harmonic');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.whenReady().then(async () => {
  if (!gotLock) return;
  storeManager = new StoreManager();
  googleAuth = new GoogleOAuth();
  musicAuth = new MusicAuth();
  externalLogin = new ExternalLoginManager(musicAuth);
  streamResolver = new StreamResolver();
  youtubeAPI = new YouTubeAPI();
  youtubeAPI.setCookieProvider(async () => await musicAuth.getCookieString());
  discordRPC = new DiscordRPC();
  discordOAuth = new DiscordOAuth();
  botServer = new BotServer(9863);
  const botServerEnabled = storeManager.get('botServerEnabled');
  if (botServerEnabled === true) {
    await botServer.start();
  }

  // Load Google auth token if available
  if (googleAuth.isGoogleAuthenticated()) {
    const token = googleAuth.getGoogleAccessToken();
    if (token) youtubeAPI.setAccessToken(token);
  }

  await discordRPC.connect();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', (err: any) => { logger.warn('[Auto] Update check skipped:', err?.message||err); });
  // GitHub'da release yokken hata popup'ı gösterme
  if (process.env.GH_TOKEN || require('fs').existsSync(require('path').join(__dirname,'../release'))) {
    autoUpdater.checkForUpdatesAndNotify().catch(()=>{});
  } else {
    logger.debug('[Auto] Update check disabled - no releases');
  }

  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  try { streamResolver?.destroy(); } catch {}
  try { discordRPC?.disconnect(); } catch {}
  try { botServer?.stop(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { streamResolver?.destroy(); } catch {}
  try { discordRPC?.disconnect(); } catch {}
  try { botServer?.stop(); } catch {}
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.destroy(); } catch {}
  }
  setTimeout(() => process.exit(0), 500);
});

app.on('second-instance', (_e, argv) => {
  const deeplink = argv.find(a => a.startsWith('harmonic://'));
  if (deeplink && mainWindow) mainWindow.webContents.send('auth:deeplink', deeplink);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on('open-url', (_e, url) => {
  if (mainWindow) mainWindow.webContents.send('auth:deeplink', url);
});
