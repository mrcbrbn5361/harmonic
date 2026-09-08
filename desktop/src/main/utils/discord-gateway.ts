import WebSocket from 'ws';
import * as https from 'https';

// ── Discord Gateway — Metrolist mantığının TS portu ──
// Kotlin'deki DiscordPresence.kt + gateway bağlantı mantığının birebir karşılığı.
// Kullanıcı token'ı gerektirir (Discord ToS gri alanı).

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';
const HEARTBEAT_INTERVAL = 41250; // default, hello'da güncellenir

export interface ActivityPayload {
  name: string;
  type: number;       // 2 = Listening
  details?: string;   // şarkı adı
  state?: string;     // sanatçı
  url?: string;
  largeImage?: string;
  largeText?: string;
  smallImage?: string;
  smallText?: string;
  startMs?: number;
  endMs?: number;
  buttons?: Array<{ label: string; url: string }>;
}

function activityToJson(a: ActivityPayload): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: a.name,
    type: a.type,
  };
  if (a.details) obj.details = a.details;
  if (a.state) obj.state = a.state;
  if (a.url) obj.url = a.url;

  if (a.startMs != null || a.endMs != null) {
    const timestamps: Record<string, number> = {};
    if (a.startMs != null) timestamps.start = a.startMs;
    if (a.endMs != null) timestamps.end = a.endMs;
    obj.timestamps = timestamps;
  }

  if (a.largeImage || a.smallImage) {
    const assets: Record<string, string> = {};
    if (a.largeImage) assets.large_image = a.largeImage;
    if (a.largeText) assets.large_text = a.largeText;
    if (a.smallImage) assets.small_image = a.smallImage;
    if (a.smallText) assets.small_text = a.smallText;
    obj.assets = assets;
  }

  if (a.buttons && a.buttons.length > 0) {
    obj.buttons = a.buttons.map((b) => b.label);
    const metadata: Record<string, unknown> = {};
    const urls = a.buttons.filter((b) => b.url).map((b) => b.url);
    if (urls.length > 0) metadata.button_urls = urls;
    if (Object.keys(metadata).length > 0) obj.metadata = metadata;
  }

  return obj;
}

function buildPresencePayload(
  activities: ActivityPayload[],
  status: string = 'online'
): string {
  return JSON.stringify({
    op: 3,
    d: {
      since: null,
      activities: activities.map(activityToJson),
      status,
      afk: false,
    },
  });
}

async function resolveExternalAsset(
  appId: string,
  url: string,
  token: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ url });
    const options: https.RequestOptions = {
      hostname: 'discord.com',
      path: `/api/v9/applications/${appId}/external-assets`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'User-Agent': 'Mozilla/5.0',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.external_asset_path) {
            resolve(`mp:external/${json.external_asset_path}`);
          } else {
            console.error('[Discord GW] Asset çözümleme başarısız');
            resolve(null);
          }
        } catch {
          console.error('[Discord GW] Asset JSON parse hatası');
          resolve(null);
        }
      });
    });
    req.on('error', (e) => {
      console.error('[Discord GW] Asset istek hatası:', e.message);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

export class DiscordGateway {
  private ws: WebSocket | null = null;
  private token = '';
  private appId = '';
  private heartbeatTimer: any = null;
  private heartbeatAck = true;
  private sequence: number | null = null;
  private sessionId = '';
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private isConnected = false;
  private coverCache = new Map<string, string>(); // url → mp:external/...
  private buttons: Array<{ label: string; url: string }> = [];
  private connectTimeout: NodeJS.Timeout | null = null;
  private lastActivity: ActivityPayload | null = null;
  private onAuthFail: (() => void) | null = null;



  setButtons(buttons: Array<{ label: string; url: string }>): void {
    this.buttons = this.sanitizeButtons(buttons);
  }

  onAuthFailure(cb: () => void): void {
    this.onAuthFail = cb;
  }

  private sanitizeButtons(buttons?: Array<{ label: string; url: string }>): Array<{ label: string; url: string }> {
    if (!buttons || !buttons.length) return [];
    return buttons
      .filter((b) => b && typeof b.label === 'string' && typeof b.url === 'string'
        && b.label.length > 0 && b.label.length <= 32
        && b.url.startsWith('https://'))
      .slice(0, 2);
  }

  async connect(token: string, appId: string): Promise<boolean> {
    if (this.ws) this.disconnect();
    this.token = token;
    this.appId = appId;
    this.reconnectAttempts = 0;
    this.heartbeatAck = true;
    this.sequence = null;
    this.sessionId = '';
    this.connectTimeout = null;

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const doResolve = (v: boolean) => {
        if (resolved) return;
        resolved = true;
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        resolve(v);
      };

      try {
        this.ws = new WebSocket(GATEWAY_URL);
      } catch (e: any) {
        console.error('[Discord GW] WebSocket oluşturulamadı:', e.message);
        doResolve(false);
        return;
      }

      this.connectTimeout = setTimeout(() => {
        if (!this.isConnected || !this.sessionId) {
          console.error('[Discord GW] Bağlantı zaman aşımı (15sn)');
          this.disconnect();
          doResolve(false);
        }
      }, 15000);

      this.ws.on('open', () => {
        console.log('[Discord GW] Bağlantı açıldı');
        this.isConnected = true;
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(String(data));
          this.handleMessage(msg);
          if (this.sessionId && !resolved) {
            console.log('[Discord GW] READY alındı, bağlantı tamam');
            doResolve(true);
          }
        } catch {}
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Discord GW] Bağlantı kapandı: ${code} ${String(reason)}`);
        this.isConnected = false;
        this.stopHeartbeat();
        if (code === 4004) {
          console.error('[Discord GW] Token geçersiz (4004)');
          this.reconnectAttempts = this.maxReconnect;
          this.token = '';
          this.stopHeartbeat();
          try { this.onAuthFail?.(); } catch {}
          doResolve(false);
          return;
        }
        if (code !== 1000 && this.reconnectAttempts < this.maxReconnect) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`[Discord GW] ${delay}ms sonra yeniden bağlanıyor (deneme ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(this.token, this.appId), delay);
        }
      });

      this.ws.on('error', (e) => {
        console.error('[Discord GW] WebSocket hatası:', e.message);
        // WebSocket hatasında auth fail kontrolü
        if (this.token && this.ws?.readyState === WebSocket.CLOSED) {
          console.error('[Discord GW] WebSocket kapatıldı, token kontrol ediliyor');
          this.onAuthFail?.();
        }
      });
    });
  }

  private handleMessage(msg: any): void {
    const { op, d, t } = msg;

    // Hello (op 10)
    if (op === 10) {
      const interval = d?.heartbeat_interval || HEARTBEAT_INTERVAL;
      this.startHeartbeat(interval);
      this.sendIdentify();
      return;
    }

    // Heartbeat ACK (op 11)
    if (op === 11) {
      this.heartbeatAck = true;
      return;
    }

    // Heartbeat request (op 1)
    if (op === 1) {
      this.sendHeartbeat();
      return;
    }

    // Dispatch (op 0)
    if (op === 0) {
      if (t === 'READY') {
        this.sessionId = d?.session_id || '';
        this.sequence = null;
        console.log('[Discord GW] READY, session:', this.sessionId);
        return;
      }
if (d?.seq != null) this.sequence = d.seq;
      return;
    }

    // Reconnect (op 7)
    if (op === 7) {
      console.log('[Discord GW] Reconnect isteği alındı');
      this.stopHeartbeat();
      if (this.sessionId && this.lastActivity) {
        // Reconnect sonrası last activity'yi yeniden gönder
        this.setActivity(this.lastActivity);
      } else if (this.sessionId) {
        this.sendResume();
      } else {
        this.sendIdentify();
      }
      return;
    }

    // Invalid session (op 9)
    if (op === 9) {
      console.error('[Discord GW] Geçersiz session, yeniden identify');
      this.sessionId = '';
      this.sequence = null;
      this.sendIdentify();
      return;
    }
  }

  private sendIdentify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: 0,
        properties: {
          os: 'windows',
          browser: 'chrome',
          device: '',
        },
      },
    }));
  }

  private sendResume(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      op: 6,
      d: {
        token: this.token,
        session_id: this.sessionId,
        seq: this.sequence,
      },
    }));
  }

  private startHeartbeat(interval: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
  }

  async setActivity(activity: ActivityPayload): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) {
      console.error('[Discord GW] Bağlı değil, activity ayarlanamadı');
      return;
    }

    this.lastActivity = activity
    console.log('[Discord GW] Activity set, stored for reconnect');

    // Cover resolution: mp:external/ cache + POST external-assets
    if (activity.largeImage && activity.largeImage.startsWith('http')) {
      const cached = this.coverCache.get(activity.largeImage);
      if (cached) {
        activity.largeImage = cached;
      } else {
        const resolved = await resolveExternalAsset(this.appId, activity.largeImage, this.token);
        if (resolved) {
          this.coverCache.set(activity.largeImage, resolved);
          activity.largeImage = resolved;
        } else {
          delete activity.largeImage;
        }
      }
    }

    // Renderer'dan gelen buttons kullanılır — Gateway'deki this.buttons ile overwrite ETME
    // this.buttons sadece fallback olarak kullanılır
    if (!activity.buttons || activity.buttons.length === 0) {
      if (this.buttons.length > 0) {
        activity.buttons = this.buttons;
      }
    }

    const payload = buildPresencePayload([activity]);
    this.ws.send(payload);
  }

  clearActivity(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) {
      return Promise.resolve();
    }
    this.ws.send(buildPresencePayload([]));
    return Promise.resolve();
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.isConnected = false;
    this.sessionId = '';
    this.sequence = null;
    this.reconnectAttempts = this.maxReconnect; // yeniden bağlanmayı durdur
    if (this.ws) {
      try { this.ws.close(1000); } catch {}
      this.ws = null;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}