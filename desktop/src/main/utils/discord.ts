import { Client } from 'discord-rpc';
import Store from 'electron-store';
import { logger } from './logger';

interface StoreType {
  discordAppId: string;
  customDiscordAppId?: string;
}

// Discord Application ID — uygulamaya entegre
// Discord Developer Portal'da "Harmonic Music" uygulaması için alındı
// (Portal'daki uygulama adı RPC başlığı olarak görünür — "Hermonic Auth" yazıyorsa portalda rename gerekir)
export const DISCORD_APP_ID = '1545832861435830432';

const store = new Store<StoreType>({ name: 'harmonic-settings', defaults: { discordAppId: '' } });

export class DiscordRPC {
  private client: Client | null = null;
  private isConnected = false;
  private currentAppId = '';

  async connect(): Promise<void> {
    const savedId = (store.get('customDiscordAppId') || store.get('discordAppId') || '').trim();
    await this.connectWithId(savedId || DISCORD_APP_ID);
  }

  async setAppId(appId: string): Promise<boolean> {
    const targetId = (appId || '').trim() || DISCORD_APP_ID;
    store.set('discordAppId', targetId);
    store.set('customDiscordAppId', (appId || '').trim());
    await this.connectWithId(targetId);
    return this.isConnected;
  }

  async connectWithId(appId: string): Promise<void> {
    if (this.client) {
      this.disconnect();
    }

    this.currentAppId = appId;
    store.set('discordAppId', appId);

    try {
      this.client = new Client({ transport: 'ipc' });

      const connectPromise = new Promise<void>((resolve) => {
        this.client!.on('ready', () => {
          this.isConnected = true;
          logger.debug(`[Discord] Rich Presence bağlandı (${appId})`);
          resolve();
        });
      });

      const loginPromise = this.client.login({ clientId: appId });

      // 8 sn timeout — Discord çalışmıyorsa takılmasın
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8000)
      );

      await Promise.race([Promise.all([connectPromise, loginPromise]), timeoutPromise]);
    } catch (err) {
      logger.debug('[Discord] Rich Presence bağlanamadı (Discord açık olabilir)');
      this.isConnected = false;
      this.client = null;
    }
  }

  getAppId(): string {
    return this.currentAppId || DISCORD_APP_ID;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async setActivity(data: {
    details: string;
    state: string;
    type?: number;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    coverUrl?: string;
    buttons?: Array<{ label: string; url: string }>;
  }): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      // Kapak çözümleme (ytmdesktop2 referans: RPC'de external http URL direkt denenir)
      const cover = (data.coverUrl || data.largeImageKey || '') as string;
      let largeImage: string | undefined;
      let largeText: string | undefined;
      if (cover && cover.startsWith('http')) {
        largeImage = cover;
        largeText = (data.largeImageText || data.details || 'Harmonic Music').slice(0, 128);
      } else if (typeof data.largeImageKey === 'string' && data.largeImageKey && data.largeImageKey !== '?') {
        largeImage = data.largeImageKey;
        largeText = (data.largeImageText || 'Harmonic Music').slice(0, 128);
      } else if (typeof data.coverUrl === 'string' && data.coverUrl) {
        largeText = (data.largeImageText || data.details || 'Harmonic Music').slice(0, 128);
      }

      const assets: Record<string, string> = {};
      if (largeImage) assets.large_image = largeImage;
      if (largeText) assets.large_text = largeText;
      if (typeof data.smallImageKey === 'string' && data.smallImageKey && !data.smallImageKey.startsWith('http')) {
        assets.small_image = data.smallImageKey;
        assets.small_text = (data.smallImageText || '').slice(0, 128);
      }

      const safeDetails = (data.details || '').slice(0, 128);
      const safeState = data.state ? data.state.slice(0, 128) : undefined;

      const activity: Record<string, unknown> = {
        // 2 = Listening → "Oynuyor" yerine "Dinliyor".
        // NOT: npm discord-rpc'nin setActivity'si type'ı çöpe attığı için ham gönderilir.
        type: data.type ?? 2,
        details: safeDetails,
        state: safeState,
        instance: false
      };
      if (typeof data.startTimestamp === 'number' || typeof data.endTimestamp === 'number') {
        const timestamps: Record<string, number> = {};
        if (typeof data.startTimestamp === 'number') timestamps.start = data.startTimestamp;
        if (typeof data.endTimestamp === 'number') timestamps.end = data.endTimestamp;
        activity.timestamps = timestamps;
      }
      if (Object.keys(assets).length > 0) activity.assets = assets;
      if (data.buttons && data.buttons.length > 0) {
        activity.buttons = data.buttons
          .filter(b => b && b.label && b.url && (b.url.startsWith('http://') || b.url.startsWith('https://')))
          .slice(0, 2)
          .map((b) => ({ label: b.label.slice(0, 32), url: b.url }));
      }

      try {
        await (this.client as any).request('SET_ACTIVITY', { pid: process.pid, activity });
      } catch (rawErr: any) {
        // Discord type'ı reddederse klasik yola düş (Oynuyor görünür ama çalışmaya devam eder)
        logger.error('[Discord] Ham activity reddedildi, klasik yola dönülüyor:', rawErr?.message || rawErr);
        await this.client.setActivity({
          details: safeDetails,
          state: safeState,
          largeImageKey: largeImage,
          largeImageText: largeText,
          smallImageKey: data.smallImageKey,
          smallImageText: data.smallImageText,
          startTimestamp: data.startTimestamp,
          endTimestamp: data.endTimestamp,
          instance: false,
          buttons: activity.buttons as any
        } as any);
      }
    } catch (err) {
      logger.error('[Discord] Activity ayarlanamadı:', err);
    }
  }

  async clearActivity(): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      this.client.clearActivity();
    } catch (err) {
      logger.error('[Discord] Activity temizlenemedi:', err);
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.destroy();
      this.isConnected = false;
      this.client = null;
    }
  }
}
