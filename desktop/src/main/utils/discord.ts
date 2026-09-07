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

      this.client.on('ready', () => {
        this.isConnected = true;
        console.log('[Discord] Rich Presence bağlandı');
      });

      await this.client.login({ clientId: appId });
    } catch (err) {
      console.log('[Discord] Rich Presence bağlanamadı (Discord açık olabilir)');
      this.isConnected = false;
      this.client = null;
    }
  }

  setAppId(appId: string): void {
    // Artık kullanıcı tarafından değiştirilemez — sabit ID
    if (appId && appId !== DISCORD_APP_ID) {
      store.set('discordAppId', DISCORD_APP_ID);
      this.connectWithId(DISCORD_APP_ID);
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
  }): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      // Resim anahtarları SADECE portalde yüklü asset varsa gönderilir.
      // Geçersiz key Discord'da "?" kutusu olarak görünür.
      const payload: Record<string, unknown> = {
        details: data.details,
        state: data.state,
        instance: false
      };
      // coverUrl varsa largeImageKey olarak dene (Discord HTTP URL'leri desteklemez,
      // ama portalde asset varsa largeImageText olarak kapak resmini göster)
      if (typeof data.coverUrl === 'string' && data.coverUrl) {
        // coverUrl'i largeImageText olarak kullan (hover'da görünür)
        payload.largeImageText = data.largeImageText || 'Harmonic';
        // largeImageKey SADECE portal'da yüklü asset ise çalışır
        // HTTP URL geçerliyse largeImageKey'e koyma (Discord reddeder)
        if (!data.coverUrl.startsWith('http')) {
          payload.largeImageKey = data.coverUrl;
        }
      }
      if (typeof data.largeImageKey === 'string' && data.largeImageKey && !data.largeImageKey.startsWith('http') && data.largeImageKey !== '?') {
        payload.largeImageKey = data.largeImageKey;
        payload.largeImageText = data.largeImageText || 'Harmonic';
      }
      if (typeof data.smallImageKey === 'string' && data.smallImageKey && !data.smallImageKey.startsWith('http')) {
        payload.smallImageKey = data.smallImageKey;
        payload.smallImageText = data.smallImageText || '';
      }
      if (typeof data.startTimestamp === 'number') payload.startTimestamp = data.startTimestamp;
      if (typeof data.endTimestamp === 'number') payload.endTimestamp = data.endTimestamp;
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
