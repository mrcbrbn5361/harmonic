import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(async () => '') },
}));

vi.mock('electron-store', () => ({
  default: class {
    get(): unknown { return null; }
    set(): void {}
  },
}));

vi.mock('chrome-remote-interface', () => ({
  default: vi.fn(async () => null),
}));

import { ExternalLoginManager } from './external-login';

function fakeAuth(over: Record<string, unknown> = {}): any {
  return {
    findYouTubeMusicTarget: async () => null,
    importFromTarget: async () => ({ success: false, cookies: 0, error: 'no target' }),
    importFromExternalChrome: async () => ({ success: false, cookies: 0, error: 'no target' }),
    getLoginState: () => ({ open: false, url: null, verifyChallenge: false }),
    getUser: () => ({ id: 'ytmusic', name: 'Test', provider: 'youtube-music' }),
    ...over,
  };
}

describe('ExternalLoginManager (harici-link auth)', () => {
  const started: Array<{ mgr: ExternalLoginManager; loginId: string }> = [];
  afterEach(() => {
    for (const s of started) {
      try { s.mgr.cancel(s.loginId); } catch {}
    }
    started.length = 0;
    vi.useRealTimers();
  });

  it('start() nonce + salt-okunur link döner (token/cookie linkte yok)', async () => {
    const mgr = new ExternalLoginManager(fakeAuth());
    const r = await mgr.start();
    expect(r.ok).toBe(true);
    expect(r.loginId).toBeTruthy();
    expect(r.nonce).toBeTruthy();
    expect(r.linkUrl).toContain(`/l/${r.loginId}`);
    expect(r.linkUrl).not.toMatch(/token|cookie/i);
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
  });

  it('nonce reddi: yanlış/eksik nonce → E_STRICT_FAIL (status + import)', async () => {
    const mgr = new ExternalLoginManager(fakeAuth({
      findYouTubeMusicTarget: async () => ({ id: 't1', url: 'https://music.youtube.com/' }),
    }));
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    const bad = await mgr.status(r.loginId!, 'yanlis-nonce');
    expect(bad.error).toBe('E_STRICT_FAIL');
    const missing = await mgr.status(r.loginId!, undefined);
    expect(missing.error).toBe('E_STRICT_FAIL');
    const impBad = await mgr.import(r.loginId!, 'yanlis-nonce');
    expect(impBad.success).toBe(false);
    expect(impBad.error).toBe('E_STRICT_FAIL');
    const impMissing = await mgr.import(r.loginId!, undefined);
    expect(impMissing.error).toBe('E_STRICT_FAIL');
  });

  it('TTL: süresi dolunca status + import E_STRICT_FAIL', async () => {
    const mgr = new ExternalLoginManager(fakeAuth());
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    // TTL dolmuş gibi davran: expiresAt geçmişe alınır.
    const inner = (mgr as any).pending.get(r.loginId);
    inner.expiresAt = Date.now() - 1000;
    const st = await mgr.status(r.loginId!, r.nonce);
    expect(st.state).toBe('suresi-doldu');
    expect(st.error).toBe('E_STRICT_FAIL');
    const imp = await mgr.import(r.loginId!, r.nonce);
    expect(imp.success).toBe(false);
    expect(imp.error).toBe('E_STRICT_FAIL');
  });

  it('E_NO_TARGET: hedef yoksa status bekliyor + import E_NO_TARGET', async () => {
    const mgr = new ExternalLoginManager(fakeAuth());
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    const st = await mgr.status(r.loginId!, r.nonce);
    expect(st.state).toBe('bekliyor');
    expect(st.error).toBe('E_NO_TARGET');
    const imp = await mgr.import(r.loginId!, r.nonce);
    expect(imp.success).toBe(false);
    expect(imp.error).toBe('E_NO_TARGET');
  });

  it('tespit: hedef varsa status tespit-edildi döner', async () => {
    const mgr = new ExternalLoginManager(fakeAuth({
      findYouTubeMusicTarget: async () => ({ id: 't1', url: 'https://music.youtube.com/' }),
    }));
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    const st = await mgr.status(r.loginId!, r.nonce);
    expect(st.state).toBe('tespit-edildi');
    expect(st.targetUrl).toContain('music.youtube.com');
  });

  it('E_NO_COOKIE: hedef var + cookie yok → import E_NO_COOKIE', async () => {
    const mgr = new ExternalLoginManager(fakeAuth({
      findYouTubeMusicTarget: async () => ({ id: 't1', url: 'https://music.youtube.com/' }),
      importFromTarget: async () => ({ success: false, cookies: 0, error: 'Chrome sekmesinde cookie bulunamadı.' }),
    }));
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    const imp = await mgr.import(r.loginId!, r.nonce);
    expect(imp.success).toBe(false);
    expect(imp.error).toBe('E_NO_COOKIE');
  });

  it('E_VERIFY: challenge ekranında status + import E_VERIFY', async () => {
    const mgr = new ExternalLoginManager(fakeAuth({
      getLoginState: () => ({ open: true, url: 'https://accounts.google.com/signin/v2/challenge/az', verifyChallenge: true }),
    }));
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    const st = await mgr.status(r.loginId!, r.nonce);
    expect(st.error).toBe('E_VERIFY');
    const imp = await mgr.import(r.loginId!, r.nonce);
    expect(imp.success).toBe(false);
    expect(imp.error).toBe('E_VERIFY');
  });

  it('başarıda pending temizlenir (loginId tek kullanımlık)', async () => {
    const mgr = new ExternalLoginManager(fakeAuth({
      findYouTubeMusicTarget: async () => ({ id: 't1', url: 'https://music.youtube.com/' }),
      importFromTarget: async () => ({ success: true, cookies: 12 }),
    }));
    const r = await mgr.start();
    if (r.loginId) started.push({ mgr, loginId: r.loginId });
    const imp = await mgr.import(r.loginId!, r.nonce);
    expect(imp.success).toBe(true);
    expect(imp.cookies).toBe(12);
    // İkinci kullanım artık geçersiz (pending silindi).
    const again = await mgr.import(r.loginId!, r.nonce);
    expect(again.success).toBe(false);
    expect(again.error).toBe('E_STRICT_FAIL');
  });
});
