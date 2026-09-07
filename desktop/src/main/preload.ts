import { contextBridge, ipcRenderer } from 'electron';

const api = {
  debugLog: (msg: string) => ipcRenderer.send('debug:log', msg),

  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximized: (cb: (maximized: boolean) => void) => {
      const handler = (_: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on('win:maximized', handler);
      return () => ipcRenderer.removeListener('win:maximized', handler);
    }
  },

  youtube: {
    search: (query: string) => ipcRenderer.invoke('yt:search', query),
    player: (videoId: string) => ipcRenderer.invoke('yt:player', videoId),
    home: () => ipcRenderer.invoke('yt:home'),
    browse: (browseId: string, params?: string) => ipcRenderer.invoke('yt:browse', browseId, params),
    next: (videoId: string, playlistId?: string) => ipcRenderer.invoke('yt:next', videoId, playlistId),
    suggestions: (input: string) => ipcRenderer.invoke('yt:suggestions', input),
    lyrics: (videoId: string) => ipcRenderer.invoke('yt:lyrics', videoId),
    libraryPlaylists: () => ipcRenderer.invoke('yt:libraryPlaylists'),
    likedSongs: () => ipcRenderer.invoke('yt:likedSongs'),
    libraryArtists: () => ipcRenderer.invoke('yt:libraryArtists'),
    libraryAlbums: () => ipcRenderer.invoke('yt:libraryAlbums')
  },

  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value)
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },

  auth: {
    loginGoogle: () => ipcRenderer.invoke('auth:loginGoogle'),
    logoutGoogle: () => ipcRenderer.invoke('auth:logoutGoogle'),
    isGoogleAuthenticated: () => ipcRenderer.invoke('auth:isGoogleAuthenticated'),
    getGoogleUser: () => ipcRenderer.invoke('auth:getGoogleUser'),
    getGoogleAccessToken: () => ipcRenderer.invoke('auth:getGoogleAccessToken'),
    setGoogleConfig: (config: { clientId: string; clientSecret: string }) => ipcRenderer.invoke('auth:setGoogleConfig', config),
    getGoogleConfig: () => ipcRenderer.invoke('auth:getGoogleConfig'),
    loginMusic: () => ipcRenderer.invoke('auth:openChromeLogin'),
    importFromChrome: () => ipcRenderer.invoke('auth:importFromChrome'),
    logoutMusic: () => ipcRenderer.invoke('auth:logoutMusic'),
    isMusicAuthenticated: () => ipcRenderer.invoke('auth:isMusicAuthenticated'),
    getMusicUser: () => ipcRenderer.invoke('auth:getMusicUser')
  },

  discord: {
    getAppId: () => ipcRenderer.invoke('discord:getAppId'),
    isReady: () => ipcRenderer.invoke('discord:isReady'),
    setActivity: (data: {
      details: string;
      state: string;
      largeImageKey?: string;
      largeImageText?: string;
      smallImageKey?: string;
      smallImageText?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      coverUrl?: string;
      buttons?: Array<{ label: string; url: string }>;
    }) => ipcRenderer.invoke('discord:setActivity', data),
    clearActivity: () => ipcRenderer.invoke('discord:clearActivity'),
    gwConnect: (token: string) => ipcRenderer.invoke('discord:gwConnect', token),
    gwDisconnect: () => ipcRenderer.invoke('discord:gwDisconnect'),
    gwIsReady: () => ipcRenderer.invoke('discord:gwIsReady'),
  },

  // Yeni: playback IPC'leri (gizli pencere üzerinden)
  player: {
    pause: () => ipcRenderer.invoke('player:pause'),
    resume: () => ipcRenderer.invoke('player:resume'),
    seek: (s: number) => ipcRenderer.invoke('player:seek', s),
    setVolume: (v: number) => ipcRenderer.invoke('player:setVolume', v),
    next: () => ipcRenderer.invoke('player:next'),
    prev: () => ipcRenderer.invoke('player:prev'),
    skipAd: () => ipcRenderer.invoke('player:skipAd'),
    onUpdate: (cb: (u: any) => void) => {
      const h = (_: unknown, u: any) => cb(u);
      ipcRenderer.on('player:update', h);
      return () => ipcRenderer.removeListener('player:update', h);
    }
  }
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
