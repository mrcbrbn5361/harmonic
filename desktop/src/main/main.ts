import { app, BrowserWindow, ipcMain, nativeTheme, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import { YouTubeAPI } from './api/innertube';
import { StoreManager } from './utils/store';
import { DiscordRPC } from './utils/discord';
import { DiscordGateway } from './utils/discord-gateway';
import { GoogleOAuth } from './auth/google-oauth';
import { MusicAuth } from './auth/music-auth';
import { StreamResolver } from './api/stream-resolver';
import { autoUpdater } from 'electron-updater';

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
let discordGateway: DiscordGateway;
let googleAuth: GoogleOAuth;
let musicAuth: MusicAuth;
let streamResolver: StreamResolver;
let resolverListenerSet = false;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    show: false,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev,
      sandbox: false
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
    try { discordGateway?.disconnect(); } catch {}
    try { discordRPC?.disconnect(); } catch {}
    if (process.platform !== 'darwin') app.quit();
  });

  mainWindow.on('close', () => {
    try { streamResolver?.destroy(); } catch {}
    try { discordGateway?.disconnect(); } catch {}
    try { discordRPC?.disconnect(); } catch {}
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('win:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('win:maximized', false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  buildMenu();

  // Production'da F12 ve Ctrl+Shift+I dev tools'u engelle
  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
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
              message: 'Harmonic v1.0.0',
              detail: 'Premium müzik deneyimi.\n\n© 2026 Harmonic Team. Tüm hakları saklıdır.',
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
    console.log('[UI]', msg);
  });

  // YouTube API
  ipcMain.handle('yt:search', async (_, query: string) => {
    try {
      const result = await youtubeAPI.search(query);
      console.log('[Main] Search:', query, 'songs:', result.songs?.length || 0, 'videos:', result.videos?.length || 0);
      console.log('[Main] Search first song:', JSON.stringify(result.songs?.[0]));
      return result;
    } catch (err) {
      console.error('[Main] Search error:', err);
      return { songs: [], videos: [], albums: [], artists: [], playlists: [] };
    }
  });
  ipcMain.handle('yt:player', async (_, videoId: string) => {
    // Girişli session ile gizli pencerede şarkıyı oynat
    if (!(await musicAuth.isAuthenticated())) {
      return { error: 'not_authenticated', id: videoId };
    }
    // Event listener'ı kur (ilk IPC çağrısı için)
    if (!resolverListenerSet) {
      resolverListenerSet = true;
      streamResolver.onUpdate((u) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player:update', u);
        }
      });
    }
    // Oynatmayı başlat (fire & forget — ana pencere state'i update event'iyle alır)
    streamResolver.play(videoId).catch((err) => console.error('[Player] play error:', err));
    return { id: videoId, playing: true };
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
      console.log('[Main] Home items:', result.items?.length || 0);
      if (result.items?.length) {
        console.log('[Main] Home first item:', JSON.stringify(result.items[0]));
      }
      return result;
    } catch (err) {
      console.error('[Main] Home error:', err);
      return { items: [] };
    }
  });
  ipcMain.handle('yt:browse', async (_, browseId: string, params?: string) => {
    try { 
      const result = await youtubeAPI.browse(browseId, params);
      return result; 
    } catch (err) { 
      console.error('[Main] Browse error:', browseId, err);
      return { title: '', items: [] }; 
    }
  });
  ipcMain.handle('yt:next', async (_, videoId: string, playlistId?: string) => {
    try { return await youtubeAPI.getNext(videoId, playlistId); } catch { return { items: [], currentIndex: 0 }; }
  });
  ipcMain.handle('yt:suggestions', async (_, input: string) => {
    try { return await youtubeAPI.getSearchSuggestions(input); } catch { return []; }
  });
  ipcMain.handle('yt:lyrics', async (_, videoId: string) => {
    try { return await youtubeAPI.getLyrics(videoId); } catch { return null; }
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

  // Store
  ipcMain.handle('store:get', (_, key: string) => storeManager.get(key as any));
  ipcMain.handle('store:set', (_, key: string, value: unknown) => { storeManager.set(key as any, value); });
  ipcMain.handle('shell:openExternal', (_, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://') && !url.includes('javascript:') && !url.includes('file:')) {
      shell.openExternal(url);
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
  ipcMain.handle('auth:getGoogleAccessToken', () => googleAuth.getGoogleAccessToken());

  ipcMain.handle('auth:setGoogleConfig', (_, { clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
    googleAuth.setGoogleConfig(clientId, clientSecret);
  });
  ipcMain.handle('auth:getGoogleConfig', () => googleAuth.getGoogleConfig());

  // ── YouTube Music cookie girişi IPC ──────────
  ipcMain.handle('auth:openChromeLogin', async () => {
    return await musicAuth.openChromeLogin();
  });
  ipcMain.handle('auth:importFromChrome', async () => {
    const result = await musicAuth.importFromChrome();
    if (result.success) {
      // importFromChrome zaten profili kaydetti. Ek olarak streamResolver'dan da dene
      // ama sadece gerçek isim içeren veriyi kabul et.
      try {
        const prof = await streamResolver.fetchAccountProfile();
        if (prof && prof.name && prof.name !== 'Guide' && prof.name.length > 1) {
          musicAuth.setUser({
            id: 'ytmusic',
            name: prof.name,
            email: prof.email || '',
            picture: prof.picture || '',
            provider: 'youtube-music'
          });
        }
      } catch {}
      // En son kaydedilen kullanıcıyı dön (importFromChrome zaten kaydetti)
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

  // ── Discord Rich Presence IPC ────────────────
  ipcMain.handle('discord:getAppId', () => discordRPC.getAppId());
  ipcMain.handle('discord:isReady', () => discordGateway.isReady() || discordRPC.isReady());
  ipcMain.handle('discord:setActivity', async (_, data) => {
    // Renderer startTimestamp/endTimestamp → Gateway startMs/endMs
    const gwData: any = { ...data };
    if (data.startTimestamp != null && gwData.startMs == null) {
      gwData.startMs = data.startTimestamp;
    }
    if (data.endTimestamp != null && gwData.endMs == null) {
      gwData.endMs = data.endTimestamp;
    }
    if ((data as any).largeImageText && !gwData.largeText) {
      gwData.largeText = (data as any).largeImageText;
    }
    if ((data as any).coverUrl && !gwData.largeImage) {
      gwData.largeImage = (data as any).coverUrl;
    }
    if (discordGateway.isReady()) {
      await discordGateway.setActivity(gwData);
    } else if (discordRPC.isReady()) {
      await discordRPC.setActivity(data);
    }
  });
  ipcMain.handle('discord:clearActivity', async () => {
    if (discordGateway.isReady()) {
      await discordGateway.clearActivity();
    } else {
      await discordRPC.clearActivity();
    }
  });

  // ── Discord Gateway IPC ──────────────────────
  ipcMain.handle('discord:gwConnect', async (_, token: string) => {
    const appId = discordRPC.getAppId();
    const ok = await discordGateway.connect(token, appId);
    if (ok) {
      // Fallback buton — şarkı değiştirilince renderer'dan gelen buttons override eder
      discordGateway.setButtons([
        { label: "YouTube Music'te Aç", url: 'https://music.youtube.com' },
      ]);
    }
    return ok;
  });
  ipcMain.handle('discord:gwDisconnect', () => {
    discordGateway.disconnect();
    return true;
  });

  // ── Auto-update ─────────────────────────────
  ipcMain.handle('auto:checkForUpdates', () => {
    return { status: 'already_checking' };
  });

  ipcMain.handle('auto:getUpdateStatus', () => {
    return {
      version: (autoUpdater as any).currentVersion || '1.0.0',
      releaseNotes: null,
      releaseDate: null,
      forced: false
    };
  });
  ipcMain.handle('discord:gwIsReady', () => discordGateway.isReady());
}

app.whenReady().then(async () => {
  storeManager = new StoreManager();
  googleAuth = new GoogleOAuth();
  musicAuth = new MusicAuth();
  streamResolver = new StreamResolver();
  youtubeAPI = new YouTubeAPI();
  discordRPC = new DiscordRPC();
  discordGateway = new DiscordGateway();

  // Tek örnek kilidi — ikinci açılışta mevcut pencereyi ön plana al
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  // Load Google auth token if available
  if (googleAuth.isGoogleAuthenticated()) {
    const token = googleAuth.getGoogleAccessToken();
    if (token) youtubeAPI.setAccessToken(token);
  }

  await discordRPC.connect();

  // Auto-update checking
  autoUpdater.checkForUpdatesAndNotify();

  // Auto-update event listeners
  autoUpdater.on('checking-for-update', () => {
    console.log('[Auto] Checking for update...');
  });
  autoUpdater.on('update-available', (info: any) => {
    console.log('[Auto] Update available:', info);
  });
  autoUpdater.on('update-not-available', (info: any) => {
    console.log('[Auto] Update not available:', info);
  });
  autoUpdater.on('error', (err: any) => {
    console.error('[Auto] Update error:', err);
  });
  autoUpdater.on('download-progress', (progress: any) => {
    console.log('[Auto] Download progress:', progress);
  });
  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[Auto] Update downloaded:', info);
  });

  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  try { streamResolver?.destroy(); } catch {}
  try { discordGateway?.disconnect(); } catch {}
  try { discordRPC?.disconnect(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { streamResolver?.destroy(); } catch {}
  try { discordGateway?.disconnect(); } catch {}
  try { discordRPC?.disconnect(); } catch {}
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.destroy(); } catch {}
  }
  setTimeout(() => process.exit(0), 500);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
