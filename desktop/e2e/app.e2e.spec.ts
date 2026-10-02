import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface StoreApi {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
declare global {
  interface Window {
    api: { store: StoreApi };
  }
}

// G9 E2E regression net — mevcut davranışı korur (G10 refactorundan önce).
// Tek Electron örneği (launch pahalı) + seri akış; gerçek main süreci
// (dist/main/main.js) ve Vite dev sunucusu üzerinden renderer yüklenir.
test.describe.configure({ mode: 'serial' });

// main.ts userData'yı %APPDATA%/Harmonic'e sabitler — örnek gerçek store'u kullanır.
// Yazılan her değer için: test öncesi snapshot, afterAll'da (uygulama kapandıktan
// sonra) geri yazma. Gerçek uygulama verisi bozulmaz.
const STORE_DIR = path.join(process.env.APPDATA ?? '', 'Harmonic');
const STORE_FILES = ['harmonic-data.json', 'harmonic-settings.json', 'harmonic-auth.json'] as const;
const snapshot = new Map<string, string | null>();

let electronApp: ElectronApplication | null = null;
let page: Page | null = null;

test.beforeAll(async () => {
  for (const f of STORE_FILES) {
    const p = path.join(STORE_DIR, f);
    snapshot.set(f, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
  }
  electronApp = await _electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '..'),
    timeout: 60_000,
  });
  page = await electronApp.firstWindow();
  await page.waitForSelector('#app', { state: 'visible' });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close().catch(() => {});
    electronApp = null;
  }
  for (const f of STORE_FILES) {
    const p = path.join(STORE_DIR, f);
    const snap = snapshot.get(f) ?? null;
    if (snap === null) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      fs.writeFileSync(p, snap, 'utf8');
    }
  }
});

test('app boots: shell, main-process version, auth state settles', async () => {
  const p = page!;
  await expect(p.locator('#app')).toBeVisible();
  await expect(p.locator('#titlebar')).toBeVisible();
  await expect(p.locator('#sidebar')).toBeVisible();
  await expect(p.locator('#player')).toBeVisible();

  const version = await electronApp!.evaluate(({ app }) => app.getVersion());
  expect(version).toBe('1.0.1');

  await expect.poll(async () => {
    const loginVisible = await p.locator('#btnAuthLogin').isVisible();
    const userInfoVisible = await p.locator('#userInfo').isVisible();
    return loginVisible !== userInfoVisible;
  }, { message: 'auth UI settled to exactly one visible state' }).toBe(true);
});

test('home renders on boot', async () => {
  const p = page!;
  const home = p.locator('section.page[data-page="home"]');
  await expect(home).toHaveClass(/active/);
  await expect(home.locator('.page-title')).toHaveText('Hoş Geldiniz');
  await expect(p.locator('#homeContent')).toBeVisible();
});

test('sidebar nav switches all pages', async () => {
  const p = page!;
  for (const target of ['search', 'library', 'liked', 'settings']) {
    await p.locator(`.nav-link[data-page="${target}"]`).click();
    await expect(p.locator(`section.page[data-page="${target}"]`)).toHaveClass(/active/);
  }
  await expect(p.locator('section.page[data-page="home"]')).not.toHaveClass(/active/);
  await p.locator('.nav-link[data-page="home"]').click();
  await expect(p.locator('section.page[data-page="home"]')).toHaveClass(/active/);
});

test('queue panel opens with empty state and closes', async () => {
  const p = page!;
  await p.locator('#btnQueue').click();
  const panel = p.locator('#queuePanel');
  await expect(panel).toHaveClass(/open/);
  await expect(panel).toHaveClass(/visible/);
  await expect(panel.locator('#queueBody')).toContainText('Sıra boş');
  await p.locator('#closeQueue').click();
  await expect(panel).not.toHaveClass(/open/);
});

test('lyrics panel opens and closes', async () => {
  const p = page!;
  await p.locator('#btnLyrics').click();
  const panel = p.locator('#lyricsPanel');
  await expect(panel).toHaveClass(/open/);
  await p.locator('#closeLyrics').click();
  await expect(panel).not.toHaveClass(/open/);
});

test('transport keeps player title stable with empty queue', async () => {
  const p = page!;
  // Not: girişli makinada gizli YTM oynatıcı son oturumu otomatik açar ve
  // başlık canlı yansıtılır (app.ts onUpdate). Bu yüzden statik değer yerine
  // göreli iddia: tıklamalar başlığı değiştirmemeli (boş kuyrukta noop/pause).
  const titleBefore = (await p.locator('#playerTitle').textContent()) ?? '';
  await p.locator('#btnPlay').click();
  await p.locator('#btnNext').click();
  await p.locator('#btnPrev').click();
  await expect(p.locator('#playerTitle')).toHaveText(titleBefore);
  await expect(p.locator('#app')).toBeVisible();
});

test('shuffle and repeat toggles flip UI state', async () => {
  const p = page!;
  const shuffle = p.locator('#btnShuffle');
  await shuffle.click();
  await expect(shuffle).toHaveClass(/active/);
  await shuffle.click();
  await expect(shuffle).not.toHaveClass(/active/);

  const repeat = p.locator('#btnRepeat');
  await repeat.click();
  await expect(repeat).toHaveClass(/active/);
  await repeat.click();
  await expect(repeat).toHaveClass(/active/);
  await expect(repeat.locator('text')).toHaveText('1');
  await repeat.click();
  await expect(repeat).not.toHaveClass(/active/);
  await expect(repeat.locator('text')).toHaveCount(0);
});

test('theme setting persists via store IPC', async () => {
  const p = page!;
  await p.locator('.nav-link[data-page="settings"]').click();
  const select = p.locator('#settingTheme');
  await select.waitFor();
  const original = (await p.evaluate(() => window.api.store.get('theme'))) as string | null;
  const target = original === 'light' ? 'dark' : 'light';
  await select.selectOption(target);
  await expect(p.locator('html')).toHaveAttribute('data-theme', target);
  const persisted = await p.evaluate(() => window.api.store.get('theme'));
  expect(persisted).toBe(target);
  if (typeof original === 'string') {
    await p.evaluate((t) => window.api.store.set('theme', t), original);
  }
  await p.locator('.nav-link[data-page="home"]').click();
});

test('like button is a no-op without a current song', async () => {
  const p = page!;
  const like = p.locator('#btnLike');
  await like.click();
  await expect(like).not.toHaveClass(/active/);
});
