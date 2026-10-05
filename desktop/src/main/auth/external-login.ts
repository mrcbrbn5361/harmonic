import * as http from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { shell } from 'electron';
import { logger } from '../utils/logger';
import { MusicAuth, VERIFY_HELP_TR } from './music-auth';

// ── Harici-link auth (birincil yol) ──────────
// Gömülü BrowserWindow gerçek Chrome cihaz güveni taşımaz → Google
// verify/challenge döner. Birincil yol: harici tarayıcı + CDP/cookie polling.
// Token/cookie ASLA linke konulmaz; loopback sunucu yalnızca loginId tutar
// (salt-okunur bilgi linki), oturum aktarımı CDP üzerinden yapılır.

export const EXTERNAL_LOGIN_TTL_MS = 5 * 60 * 1000;
export const EXTERNAL_LOGIN_MUSIC_URL = 'https://music.youtube.com/';

export type ExternalLoginState = 'bekliyor' | 'tespit-edildi' | 'suresi-doldu' | 'iptal';
export type ExternalLoginError =
  | 'E_NO_TARGET'
  | 'E_NO_COOKIE'
  | 'E_VERIFY'
  | 'E_PORT_BUSY'
  | 'E_STRICT_FAIL';

export interface ExternalLoginStartResult {
  ok: boolean;
  loginId?: string;
  nonce?: string;
  linkUrl?: string;
  musicUrl?: string;
  expiresInSec?: number;
  error?: ExternalLoginError;
}

export interface ExternalLoginImportResult {
  success: boolean;
  cookies?: number;
  user?: unknown;
  error?: ExternalLoginError;
  help?: string;
  detail?: string;
}

export interface ExternalLoginStatusResult {
  state: ExternalLoginState;
  error?: ExternalLoginError;
  help?: string;
  targetUrl?: string;
  expiresInSec?: number;
}

interface PendingLogin {
  loginId: string;
  nonce: string;
  expiresAt: number;
  server: http.Server;
  port: number;
}

export class ExternalLoginManager {
  private pending = new Map<string, PendingLogin>();
  // MusicAuth yalnızca findYouTubeMusicTarget/importFromTarget için kullanılır;
  // testlerde fake nesne verilebilir (any olarak geçilir).
  constructor(private musicAuth: Pick<MusicAuth, 'findYouTubeMusicTarget' | 'importFromTarget' | 'importFromExternalChrome' | 'getLoginState' | 'getUser'>) {}

  async start(): Promise<ExternalLoginStartResult> {
    const loginId = randomUUID().replace(/-/g, '').slice(0, 16);
    const nonce = randomUUID().replace(/-/g, '');
    const expiresAt = Date.now() + EXTERNAL_LOGIN_TTL_MS;

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (url.pathname === `/l/${loginId}`) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Harmonic Giriş</title></head>' +
              '<body style="font-family:system-ui;padding:32px">' +
              '<h2>Harmonic giriş bağlantısı</h2>' +
              '<p>Bu sayfa yalnızca bilgi amaçlıdır. music.youtube.com adresinde giriş yapıp Harmonic uygulamasına dönün ve "Girişi Aktar" düğmesine basın.</p>' +
              '<p>Token veya cookie bu bağlantıda taşınmaz.</p>' +
              '</body></html>',
          );
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('bulunamadı');
      } catch {
        try {
          res.writeHead(500);
          res.end('hata');
        } catch {}
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });
    } catch (e: any) {
      try {
        server.close();
      } catch {}
      logger.warn('[ExternalLogin] Port açılamadı:', e?.message || e);
      return { ok: false, error: 'E_PORT_BUSY' };
    }

    const port = (server.address() as AddressInfo)?.port || 0;
    if (!port) {
      try {
        server.close();
      } catch {}
      return { ok: false, error: 'E_STRICT_FAIL' };
    }

    this.pending.set(loginId, { loginId, nonce, expiresAt, server, port });
    // TTL sonunda otomatik kapat (bellek sızıntısı yok).
    setTimeout(() => this.expire(loginId), EXTERNAL_LOGIN_TTL_MS + 1000).unref?.();

    // Birincil yol: harici tarayıcıyı music.youtube.com ile aç.
    try {
      await shell.openExternal(EXTERNAL_LOGIN_MUSIC_URL);
    } catch (e: any) {
      logger.warn('[ExternalLogin] Harici tarayıcı açılamadı:', e?.message || e);
    }

    const linkUrl = `http://127.0.0.1:${port}/l/${loginId}`;
    logger.debug('[ExternalLogin] Başlatıldı:', loginId, 'port:', port);
    return { ok: true, loginId, nonce, linkUrl, musicUrl: EXTERNAL_LOGIN_MUSIC_URL, expiresInSec: Math.round(EXTERNAL_LOGIN_TTL_MS / 1000) };
  }

  private checkNonce(p: PendingLogin, nonce: unknown): boolean {
    return !!nonce && String(nonce) === p.nonce;
  }

  async status(loginId: string, nonce?: string): Promise<ExternalLoginStatusResult> {
    const p = this.pending.get(String(loginId || ''));
    if (!p) return { state: 'suresi-doldu', error: 'E_STRICT_FAIL', expiresInSec: 0 };
    // Nonce zorunlu: eksik/yanlış → E_STRICT_FAIL (CSRF/karışan polling'e karşı).
    if (!this.checkNonce(p, nonce)) {
      return { state: 'suresi-doldu', error: 'E_STRICT_FAIL', expiresInSec: 0 };
    }
    const remainingSec = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000));
    if (Date.now() > p.expiresAt) {
      this.expire(p.loginId);
      return { state: 'suresi-doldu', error: 'E_STRICT_FAIL', expiresInSec: 0 };
    }
    // Verify/challenge: gömülü pencere challenge'daysa harici akışa yönlendir.
    try {
      const st = this.musicAuth.getLoginState();
      if (st.verifyChallenge) {
        return { state: 'bekliyor', error: 'E_VERIFY', help: VERIFY_HELP_TR, expiresInSec: remainingSec };
      }
    } catch {}
    // CDP hedef polling: allowlist'li music hedefi var mı?
    let target: { id: string; url: string } | null = null;
    try {
      target = await this.musicAuth.findYouTubeMusicTarget();
    } catch {
      target = null;
    }
    if (target) {
      return { state: 'tespit-edildi', targetUrl: target.url, expiresInSec: remainingSec };
    }
    return { state: 'bekliyor', error: 'E_NO_TARGET', expiresInSec: remainingSec };
  }

  async import(loginId: string, nonce?: string): Promise<ExternalLoginImportResult> {
    const p = this.pending.get(String(loginId || ''));
    if (!p) return { success: false, error: 'E_STRICT_FAIL', detail: 'oturum yok' };
    // Nonce zorunlu: eksik/yanlış → E_STRICT_FAIL.
    if (!this.checkNonce(p, nonce)) {
      return { success: false, error: 'E_STRICT_FAIL', detail: 'nonce doğrulanamadı' };
    }
    if (Date.now() > p.expiresAt) {
      this.expire(p.loginId);
      return { success: false, error: 'E_STRICT_FAIL', detail: 'süresi doldu' };
    }
    // Verify/challenge: cookie akışı ilerlemez.
    try {
      const st = this.musicAuth.getLoginState();
      if ((st as { verifyChallenge?: boolean })?.verifyChallenge) {
        return { success: false, error: 'E_VERIFY', help: VERIFY_HELP_TR };
      }
    } catch {}
    // CDP hedef yoksa beklemede kalınmalı (renderer polling'e devam eder).
    let target: { id: string; url: string } | null = null;
    try {
      target = await this.musicAuth.findYouTubeMusicTarget();
    } catch {
      target = null;
    }
    if (!target) {
      return { success: false, error: 'E_NO_TARGET', detail: 'hedef yok' };
    }
    // Hedef var → CDP üzerinden aktar. Cookie yoksa E_NO_COOKIE ayrımı.
    try {
      const res: any = await (this.musicAuth as any).importFromTarget
        ? await (this.musicAuth as any).importFromTarget(target.id)
        : await (this.musicAuth as any).importFromExternalChrome(target.id);
      if (res?.success) {
        let user: unknown = null;
        try { user = (this.musicAuth as any).getUser?.() ?? null; } catch {}
        // Başarıda pending temizlenir (tek kullanımlık loginId).
        this.expire(p.loginId);
        return { success: true, cookies: res.cookies ?? res?.cookies, user };
      }
      const msg = String(res?.error || '');
      if (/cookie bulunamadı|cookie|Cookie/i.test(msg)) {
        return { success: false, error: 'E_NO_COOKIE', detail: msg };
      }
      if (/doğrulanamadı|no verified target|no target/i.test(msg)) {
        return { success: false, error: 'E_NO_TARGET', detail: msg };
      }
      return { success: false, error: 'E_STRICT_FAIL', detail: msg };
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/cookie/i.test(msg)) return { success: false, error: 'E_NO_COOKIE', detail: msg };
      return { success: false, error: 'E_STRICT_FAIL', detail: msg };
    }
  }

  cancel(loginId: string): boolean {
    const p = this.pending.get(String(loginId || ''));
    if (!p) return false;
    try {
      p.server.close();
    } catch {}
    this.pending.delete(p.loginId);
    return true;
  }

  private expire(loginId: string): void {
    const p = this.pending.get(loginId);
    if (!p) return;
    try {
      p.server.close();
    } catch {}
    this.pending.delete(loginId);
  }
}
