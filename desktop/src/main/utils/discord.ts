import { Client } from 'discord-rpc';
import Store from 'electron-store';

interface StoreType {
  discordAppId: string;
}

// Discord Application ID — uygulamaya entegre
// Discord Developer Portal'da "Harmonic" uygulaması için alındı
export const DISCORD_APP_ID = '1545832861435830432';

const store = new Store<StoreType>({ name: 'harmonic-settings', defaults: { discordAppId: '' } });

export class DiscordRPC {
  private client: Client | null = null;
  private isConnected = false;
  private currentAppId = '';

  async connect(): Promise<void> {
    await this.connectWithId(DISCORD_APP_ID);
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
          console.log('[Discord] Rich Presence bağlandı');
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
      console.log('[Discord] Rich Presence bağlanamadı (Discord açık olabilir)');
      this.isConnected = false;
      this.client = null;
    }
  }

  getAppId(): string {
    return DISCORD_APP_ID;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async setActivity(data: {
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
  }): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const payload: Record<string, unknown> = {
        details: data.details,
        state: data.state,
        instance: false
      };

      // largeImageKey: sadece portal'da yüklü asset ise çalışır
      if (typeof data.largeImageKey === 'string' && data.largeImageKey && !data.largeImageKey.startsWith('http') && data.largeImageKey !== '?') {
        payload.largeImageKey = data.largeImageKey;
        payload.largeImageText = data.largeImageText || 'Harmonic';
      } else if (typeof data.coverUrl === 'string' && data.coverUrl) {
        // HTTP cover URL — RPC bunu desteklemez ama text olarak göster
        payload.largeImageText = data.largeImageText || data.details || 'Harmonic';
      }

      if (typeof data.smallImageKey === 'string' && data.smallImageKey && !data.smallImageKey.startsWith('http')) {
        payload.smallImageKey = data.smallImageKey;
        payload.smallImageText = data.smallImageText || '';
      }
      if (typeof data.startTimestamp === 'number') payload.startTimestamp = data.startTimestamp;
      if (typeof data.endTimestamp === 'number') payload.endTimestamp = data.endTimestamp;
      if (data.buttons && data.buttons.length > 0) {
        payload.buttons = data.buttons.map((b) => ({ label: b.label, url: b.url }));
      }
      this.client.setActivity(payload);
    } catch (err) {
      console.error('[Discord] Activity ayarlanamadı:', err);
    }
  }

  async clearActivity(): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      this.client.clearActivity();
    } catch (err) {
      console.error('[Discord] Activity temizlenemedi:', err);
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
