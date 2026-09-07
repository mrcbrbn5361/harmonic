import { BrowserWindow, session } from 'electron';
import * as http from 'http';
import { URL } from 'url';
import Store from 'electron-store';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './google-credentials';

interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
  scope?: string;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  picture: string;
  provider: 'google' | 'discord';
}

interface TokenStore {
  googleTokens: OAuthTokens | null;
  googleUser: UserData | null;
  googleClientId?: string;
  googleClientSecret?: string;
}

// ── Google OAuth ──────────────────────────────
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'];

export class GoogleOAuth {
  private store: Store<TokenStore>;
  private authWindow: BrowserWindow | null = null;

  constructor() {
    this.store = new Store<TokenStore>({
      name: 'harmonic-auth',
      defaults: {
        googleTokens: null,
        googleUser: null,
        googleClientId: '',
        googleClientSecret: ''
      }
    });
  }

  getGoogleTokens(): OAuthTokens | null {
    const tokens = this.store.get('googleTokens');
    if (tokens && Date.now() >= tokens.expires_at - 60000) {
      this.refreshGoogleToken(tokens);
    }
    return this.store.get('googleTokens');
  }

  getGoogleUser(): UserData | null {
    return this.store.get('googleUser');
  }

  isGoogleAuthenticated(): boolean {
    const tokens = this.getGoogleTokens();
    return tokens !== null && tokens.access_token !== '';
  }

  // ── Google Login ─────────────────────────────
  async loginGoogle(parentWindow: BrowserWindow, clientId: string, clientSecret: string): Promise<{ success: boolean; user?: UserData; error?: string }> {
    if (!clientId || !clientSecret) {
      return { success: false, error: 'Google Client ID ve Secret girilmemiş. Ayarlar\'dan girin.' };
    }

    return new Promise((resolve) => {
      let server: http.Server;
      let authWindow: BrowserWindow | null = null;
      let callbackHandled = false;

      const cleanup = () => {
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
          authWindow = null;
        }
        if (server) {
          try { server.close(); } catch {}
        }
      };

      server = http.createServer(async (req, res) => {
        if (callbackHandled) return;

        const url = new URL(req.url || '/', 'http://localhost');

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        callbackHandled = true;

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        console.log('[Google OAuth] Callback received, code:', code ? 'var' : 'yok', 'error:', error);

        if (error || !code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h1 style="color:#e8364e">Giriş başarısız</h1>
                <p>${error === 'access_denied' ? 'Giriş iptal edildi.' : error || 'Kod alınamadı'}</p>
                <p style="color:#666;font-size:12px;margin-top:16px">Bu pencereyi kapatabilirsiniz.</p>
              </div>
            </body></html>
          `);
          cleanup();
          resolve({ success: false, error: error || 'Authorization code alınamadı' });
          return;
        }

        // Token exchange
        try {
          console.log('[Google OAuth] Token exchange başlatılıyor...');
          const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: `http://127.0.0.1:${(server.address() as any).port}/callback`,
              grant_type: 'authorization_code'
            }).toString()
          });

          const tokenData = await tokenRes.json() as any;
          console.log('[Google OAuth] Token response:', tokenRes.status, tokenData.error || 'ok');

          if (!tokenRes.ok || tokenData.error) {
            throw new Error(tokenData.error_description || tokenData.error || 'Token exchange başarısız');
          }

          const tokens: OAuthTokens = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000),
            token_type: tokenData.token_type
          };

          this.store.set('googleTokens', tokens);

          // Kullanıcı bilgisi al
          const userRes = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
          });
          const userData = await userRes.json() as any;
          console.log('[Google OAuth] User:', userData.name, userData.email);

          const user: UserData = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            picture: userData.picture || '',
            provider: 'google'
          };

          this.store.set('googleUser', user);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h1 style="color:#2ecc71">Giriş başarılı!</h1>
                <p>${user.name} olarak giriş yapıldı.</p>
                <p style="color:#666;font-size:12px;margin-top:16px">Bu pencere otomatik kapanacak...</p>
              </div>
            </body></html>
          `);

          cleanup();
          resolve({ success: true, user });
        } catch (err: any) {
          console.error('[Google OAuth] Hata:', err.message);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h1 style="color:#e8364e">Hata</h1>
                <p>${err.message}</p>
                <p style="color:#666;font-size:12px;margin-top:16px">Bu pencere otomatik kapanacak...</p>
              </div>
            </body></html>
          `);
          cleanup();
          resolve({ success: false, error: err.message });
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        const port = addr.port;
        const redirectUri = `http://127.0.0.1:${port}/callback`;

        console.log('[Google OAuth] Server port:', port);
        console.log('[Google OAuth] Redirect URI:', redirectUri);

        const authUrl = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: GOOGLE_SCOPES.join(' '),
          access_type: 'offline',
          prompt: 'consent'
        }).toString()}`;

        authWindow = new BrowserWindow({
          width: 500,
          height: 700,
          parent: parentWindow,
          modal: true,
          title: 'Google ile Giriş Yap',
          backgroundColor: '#0a0a0a',
          webPreferences: { nodeIntegration: false, contextIsolation: true },
          autoHideMenuBar: true
        });

        authWindow.loadURL(authUrl);

        // Navigate event ile yakala
        authWindow.webContents.on('did-navigate', (_, navUrl) => {
          console.log('[Google OAuth] Navigate:', navUrl.substring(0, 80));
          if (navUrl.startsWith('http://127.0.0.1:')) {
            const navUrlObj = new URL(navUrl);
            const navCode = navUrlObj.searchParams.get('code');
            const navError = navUrlObj.searchParams.get('error');

            if (callbackHandled) return;
            callbackHandled = true;

            if (navError || !navCode) {
              cleanup();
              resolve({ success: false, error: navError || 'Kod alınamadı' });
              return;
            }

            // Token exchange manually
            fetch(GOOGLE_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code: navCode,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
              }).toString()
            })
            .then(r => r.json())
            .then(async (tokenData: any) => {
              console.log('[Google OAuth] Token:', tokenData.error || 'ok');
              if (tokenData.error) throw new Error(tokenData.error);

              const tokens: OAuthTokens = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: Date.now() + (tokenData.expires_in * 1000),
                token_type: tokenData.token_type
              };
              this.store.set('googleTokens', tokens);

              const userRes = await fetch(GOOGLE_USERINFO_URL, {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
              });
              const ud = await userRes.json() as any;
              const user: UserData = { id: ud.id, name: ud.name, email: ud.email, picture: ud.picture || '', provider: 'google' };
              this.store.set('googleUser', user);
              console.log('[Google OAuth] Başarılı:', user.name);
              cleanup();
              resolve({ success: true, user });
            })
            .catch((err) => {
              console.error('[Google OAuth] Token hatası:', err.message);
              cleanup();
              resolve({ success: false, error: err.message });
            });
          }
        });

        authWindow.webContents.on('will-redirect', (_, navUrl) => {
          console.log('[Google OAuth] will-redirect:', navUrl.substring(0, 80));
        });

        authWindow.on('closed', () => {
          authWindow = null;
          if (!callbackHandled) {
            callbackHandled = true;
            cleanup();
            resolve({ success: false, error: 'Pencere kapatıldı' });
          }
        });
      });

      server.on('error', (err) => {
        cleanup();
        resolve({ success: false, error: `Sunucu hatası: ${err.message}` });
      });
    });
  }

  // ── Token Refresh ────────────────────────────
  private async refreshGoogleToken(tokens: OAuthTokens): Promise<void> {
    if (!tokens.refresh_token) return;
    try {
      const config = this.store.get('googleTokens');
      const clientId = this.store.get('googleClientId') || '';
      const clientSecret = this.store.get('googleClientSecret') || '';
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        }).toString()
      });
      if (res.ok) {
        const data = await res.json() as any;
        tokens.access_token = data.access_token;
        tokens.expires_at = Date.now() + (data.expires_in * 1000);
        this.store.set('googleTokens', tokens);
      }
    } catch {}
  }

  // ── Logout ───────────────────────────────────
  async logoutGoogle(): Promise<void> {
    this.store.set('googleTokens', null);
    this.store.set('googleUser', null);
    const sessions = session.defaultSession;
    await sessions.clearStorageData({ storages: ['cookies'] });
  }

  // ── Config ───────────────────────────────────
  setGoogleConfig(clientId: string, clientSecret: string): void {
    this.store.set('googleClientId', clientId);
    this.store.set('googleClientSecret', clientSecret);
  }

  getGoogleConfig(): { clientId: string; clientSecret: string } {
    const clientId = this.store.get('googleClientId') || GOOGLE_CLIENT_ID;
    const clientSecret = this.store.get('googleClientSecret') || GOOGLE_CLIENT_SECRET;
    return {
      clientId,
      clientSecret
    };
  }

  getGoogleAccessToken(): string | null {
    const tokens = this.getGoogleTokens();
    return tokens?.access_token || null;
  }
}
