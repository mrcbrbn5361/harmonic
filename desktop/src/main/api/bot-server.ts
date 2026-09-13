import * as http from 'http';

export interface BotServerTrack {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
  durationFormatted?: string;
  currentTime?: number;
  currentTimeFormatted?: string;
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
  updatedAt: number;
}

export class BotServer {
  private server: http.Server | null = null;
  private port: number = 9863;
  private active: boolean = false;
  private state: BotServerState = {
    app: 'Harmonic Music',
    version: '1.0.1',
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
        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
        }

        const url = req.url || '/';

        if (url === '/' || url === '/api/v1/state' || url === '/query' || url === '/state') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(this.state, null, 2));
          return;
        }

        if (url === '/api/v1/health' || url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'ok', app: 'Harmonic Music', version: '1.0.1', port: this.port }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found', availableEndpoints: ['/api/v1/state', '/query', '/health'] }));
      });

      this.server.on('error', (err: any) => {
        console.warn(`[BotServer] Port ${this.port} dinlenirken hata:`, err.message);
        this.active = false;
        resolve(false);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.active = true;
        console.log(`[BotServer] Discord Bot REST API aktif: http://127.0.0.1:${this.port}/api/v1/state`);
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
          console.log('[BotServer] Discord Bot REST API durduruldu.');
          resolve();
        });
      } else {
        this.active = false;
        resolve();
      }
    });
  }
}
