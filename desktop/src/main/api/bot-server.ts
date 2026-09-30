import * as http from 'http';
import { randomBytes, timingSafeEqual } from 'crypto';
import Store from 'electron-store';
import { appVersion } from './client-versions';
import { logger } from '../utils/logger';

export function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function isAllowedHost(host?: string | null): boolean {
  if (!host) return false;
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host.trim());
}

export function maskToken(token?: string | null): string {
  if (!token) return '—';
  if (token.length <= 8) return '••••••••';
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

export function verifyBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!authHeader || !expectedToken) return false;
  const trimmed = authHeader.trim();
  if (!trimmed.startsWith('Bearer ')) return false;
  const token = trimmed.slice(7).trim();
  const tokenBuf = Buffer.from(token, 'utf8');
  const expectedBuf = Buffer.from(expectedToken, 'utf8');
  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(tokenBuf, expectedBuf);
}

// Token kalıcılığı (harmonic-settings altında; varsayılan: token koruması aktif — M-08).
const authStore = new Store<{ botToken: string; botTokenEnabled: boolean }>({
  name: 'harmonic-settings',
  defaults: { botToken: '', botTokenEnabled: true }
});

function ensureToken(): string {
  let t = '';
  try { t = authStore.get('botToken') || ''; } catch {}
  if (!t) {
    t = randomBytes(24).toString('hex');
    try { authStore.set('botToken', t); } catch {}
  }
  return t;
}

export interface BotServerTrack {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  artwork?: string;
  duration?: number;
  durationFormatted?: string;
  currentTime?: number;
  currentTimeFormatted?: string;
  timeString?: string;
  progress?: number;
  url?: string;
}

export interface BotServerRecommendation {
  id?: string;
  title: string;
  artist: string;
  thumbnail?: string;
  url?: string;
}

export interface BotServerState {
  app: string;
  version: string;
  status: 'playing' | 'paused' | 'stopped';
  isPlaying: boolean;
  track: BotServerTrack | null;
  recommendations: BotServerRecommendation[];
  lyrics?: string;
  syncedLyrics?: string;
  currentLyricLine?: string;
  updatedAt: number;
}

export class BotServer {
  private server: http.Server | null = null;
  private port: number = 9863;
  private active: boolean = false;
  private state: BotServerState = {
    app: 'Harmonic Music',
    version: appVersion(),
    status: 'stopped',
    isPlaying: false,
    track: null,
    recommendations: [],
    updatedAt: Date.now()
  };

  constructor(port: number = 9863) {
    this.port = port;
  }

  public getPort(): number {
    return this.port;
  }

  public isRunning(): boolean {
    return this.active;
  }

  public getState(): BotServerState {
    return this.state;
  }

  // ── İsteğe bağlı token koruması (bk. ANALIZ-RAPORU M-08) ──
  public getAuth(): { enabled: boolean; token: string; masked: boolean } {
    let enabled = true;
    try {
      const val = authStore.get('botTokenEnabled');
      if (val !== undefined) enabled = !!val;
    } catch {}
    const raw = ensureToken();
    return { enabled, token: maskToken(raw), masked: true };
  }

  public getRawToken(): string {
    return ensureToken();
  }

  public setAuthEnabled(enable: boolean): { enabled: boolean; token: string; masked: boolean } {
    try { authStore.set('botTokenEnabled', !!enable); } catch {}
    return this.getAuth();
  }

  public regenerateToken(): { enabled: boolean; token: string; masked: boolean } {
    const t = randomBytes(24).toString('hex');
    try { authStore.set('botToken', t); } catch {}
    return this.getAuth();
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    let enabled = true;
    try {
      const val = authStore.get('botTokenEnabled');
      if (val !== undefined) enabled = !!val;
    } catch {}
    if (!enabled) return true; // açık mod (kullanıcı bilinçli olarak kapattıysa)
    return verifyBearerToken(req.headers.authorization, ensureToken());
  }

  public updateState(partial: Partial<BotServerState>): void {
    this.state = {
      ...this.state,
      ...partial,
      updatedAt: Date.now()
    };
  }

  public start(): Promise<boolean> {
    if (this.server && this.active) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // DNS Rebinding / Host header denetimi (M-08): Yalnızca loopback Host izinlidir
        const host = req.headers.host;
        if (!isAllowedHost(host)) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'forbidden_host', message: 'Geçersiz Host başlığı. Yalnızca loopback erişimine izin verilir.' }));
          return;
        }

        // CORS Headers: Sadece localhost / loopback origin'lerine izin ver
        const origin = req.headers.origin;
        if (origin) {
          if (!isAllowedOrigin(origin)) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'forbidden_origin', message: 'Yabancı origin erişimi engellendi.' }));
            return;
          }
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = req.url || '/';

        if (url === '/' || url === '/api/v1/state' || url === '/query' || url === '/state') {
          if (!this.isAuthorized(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'unauthorized', hint: 'Authorization: Bearer <token> gerekli (Ayarlar > Discord Bot Entegrasyonu)' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(this.state, null, 2));
          return;
        }

        if (url === '/api/v1/health' || url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found', availableEndpoints: ['/api/v1/state', '/query', '/health'] }));
      });

      this.server.on('error', (err: any) => {
        logger.warn(`[BotServer] Port ${this.port} dinlenirken hata:`, err.message);
        this.active = false;
        resolve(false);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.active = true;
        logger.debug(`[BotServer] Discord Bot REST API aktif: http://127.0.0.1:${this.port}/api/v1/state`);
        resolve(true);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.active = false;
          this.server = null;
          logger.debug('[BotServer] Discord Bot REST API durduruldu.');
          resolve();
        });
      } else {
        this.active = false;
        resolve();
      }
    });
  }
}
