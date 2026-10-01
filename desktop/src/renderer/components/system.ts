/* ============================================
   Harmonic - System Helpers (P0, streaming-only)
   Saf, DOM-wiring'siz sistem mantığı — birim test edilebilir.
   Davranış app.ts'teki mevcut mantıkla birebir aynıdır
   (auth-chrome / media-session / playlists / settings /
   discord-bot / boot-init).
   DOM/IPC (querySelector, api.*, playSong, setContext,
   attachSongEvents, songRow state) app.ts'te kalır.
   Offline/download kapsam dışıdır.
   ============================================ */

import { escapeHtml } from './views';
import type { Song } from './state';

/* ── Auth / Chrome import ─────────────────── */

/** doLoginMusic açılış toast'u (app.ts ile birebir). */
export const CHROME_LOGIN_TOAST =
  "Chrome açılıyor... YouTube Music'e giriş yapıp buraya dönün.";

/** loginMusic açma hatası guard'ı: opened?.opened yoksa hata. */
export function isLoginOpenFailure(opened: { opened?: unknown; error?: unknown } | null | undefined): boolean {
  return !opened?.opened;
}

/** loginMusic açma hata metni (app.ts toast ile birebir). */
export function resolveLoginErrorText(opened: { error?: unknown } | null | undefined): string {
  const err = (opened?.error as string) || 'bilinmeyen hata';
  return `Chrome açılamadı: ${err}`;
}

/** Chrome import penceresinde harici Chrome bulundu mu. */
export function hasExternalChrome(opened: { externalFound?: unknown } | null | undefined): boolean {
  return !!opened?.externalFound;
}

/** Chrome import modal başlığı (app.ts hasExt üçlüsü ile birebir). */
export function resolveChromePromptTitle(hasExt: boolean): string {
  return hasExt ? 'Açık YouTube Music Hesabını Seç' : 'Harmonic Giriş Penceresi Açıldı';
}

/** Chrome import ana düğme etiketi (app.ts ile birebir). */
export function resolveChromeImportButtonLabel(hasExt: boolean): string {
  return hasExt ? 'Seçili Hesapla Giriş Yap' : 'Girişi Aktar';
}

/** Chrome import ilk durum satırı (app.ts ile birebir). */
export function resolveChromeImportInitialStatus(hasExt: boolean): string {
  return hasExt ? 'Harici Chrome hesabı bekleniyor...' : 'Pencere açık, giriş bekleniyor...';
}

/** Import başarı durum satırı (app.ts template ile birebir). */
export function buildImportSuccessText(userName: string | undefined, cookies: unknown): string {
  return `${userName || 'Giriş'} olarak giriş yapıldı (${String(cookies)} cookie)`;
}

/** Import hata durum satırı (app.ts `r?.error || ...` ile birebir). */
export function buildImportFailureText(error: unknown): string {
  return `Hata: ${String((error as string) || 'Pencerede giriş yapılmamış')}`;
}

/** Import exception durum satırı (app.ts catch ile birebir). */
export function buildImportExceptionText(e: unknown): string {
  const msg = (e as { message?: unknown })?.message;
  return `Hata: ${String(msg || String(e))}`;
}

/** Kirli kullanıcı adını temizle: sanitize boşsa '' (app.ts updateAuthUI guard ile birebir). */
export function normalizeUserName(raw: string, sanitized: string): string {
  return sanitized ? raw : '';
}

/* ── Media session ────────────────────────── */

/** Medya tuşu kaydırma adımı (app.ts seekbackward/forward ile birebir). */
export const MEDIA_SEEK_STEP = 10;

/** Süre yoksa seek çalışmaz (app.ts `if (state.duration)` guard ile birebir). */
export function shouldHandleMediaSeek(duration: number): boolean {
  return !!duration;
}

/** MediaMetadata kapak listesi: kapak yoksa [] (app.ts ile birebir). */
export function buildMediaArtwork(
  thumbnail: string | undefined,
): Array<{ src: string; sizes: string; type: string }> {
  if (!thumbnail) return [];
  return [{ src: thumbnail, sizes: '480x480', type: 'image/jpeg' }];
}

/* ── Playlists (yerel) ────────────────────── */

/** Liste yoksa gezinti yedeği (app.ts renderPlaylists ile birebir). */
export const PLAYLISTS_EMPTY_HTML = '<div class="empty-hint">Henüz liste yok</div>';

/** Yerel liste şarkısız gövde (app.ts openLocalPlaylist dalı ile birebir yapı). */
export const LOCAL_PLAYLIST_EMPTY_BODY =
  '<div class="empty-state">'
  + '<p class="empty-text">Bu listede henüz şarkı yok</p>'
  + '<p class="empty-hint-text">Şarkılara sağ tıklayıp "Çalma Listesine Ekle..." seçeneğiyle ekleyebilirsiniz.</p>'
  + '</div>';

export interface LocalPlaylist {
  id: string;
  name: string;
  songs: Song[];
  createdAt: number;
}

/** Yeni yerel liste kimliği (app.ts `pl_${Date.now()}` ile birebir). */
export function buildLocalPlaylistId(now: number): string {
  return `pl_${now}`;
}

/** Yeni yerel liste kaydı (app.ts createPlaylist push ile birebir). */
export function buildLocalPlaylistEntry(name: string, now: number): LocalPlaylist {
  return { id: buildLocalPlaylistId(now), name, songs: [], createdAt: now };
}

/** createPlaylist guard'ı: ad boşsa yazma (app.ts `if (!name) return` ile birebir). */
export function shouldCreatePlaylist(name: string): boolean {
  return !!name;
}

/** Kimliğe göre yerel liste bul (app.ts openLocalPlaylist find ile birebir). */
export function findLocalPlaylist(playlists: readonly LocalPlaylist[], plId: string): LocalPlaylist | undefined {
  return playlists.find((p) => p.id === plId);
}

/** Silme sonrası liste (app.ts delete filter ile birebir). */
export function removeLocalPlaylist(playlists: readonly LocalPlaylist[], plId: string): LocalPlaylist[] {
  return playlists.filter((p) => p.id !== plId);
}

/** Liste başlık sayaç satırı (app.ts `${len} şarkı • Özel Çalma Listesi` ile birebir). */
export function playlistCountText(count: number): string {
  return `${count} şarkı • Özel Çalma Listesi`;
}

/** Çal düğmesi yalnızca şarkı varsa (app.ts songs.length üçlüsü ile birebir). */
export function shouldShowPlaylistPlay(count: number): boolean {
  return count > 0;
}

/** Yerel listeler gezinti HTML'i (boşsa yedek — app.ts ile birebir yapı). */
export function buildPlaylistsNavHtml(playlists: readonly LocalPlaylist[]): string {
  if (!playlists.length) return PLAYLISTS_EMPTY_HTML;
  return playlists.map((pl) =>
    `<a class="nav-link" href="#" data-pl="${escapeHtml(pl.id)}">`
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    + `<span>${escapeHtml(pl.name)}</span></a>`,
  ).join('');
}

/** Yerel liste başlık bloğu (ad + sayaç + Çal/Sil — app.ts ile birebir yapı). */
export function buildLocalPlaylistHeaderHtml(name: string, count: number): string {
  const playBtn = shouldShowPlaylistPlay(count)
    ? '<button class="btn btn-primary" id="btnPlayPlaylist" style="display:flex;align-items:center;gap:6px">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
      + 'Çal</button>'
    : '';
  return '<div style="margin-bottom:24px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px">'
    + `<div><h2 style="font-size:22px;font-weight:700;color:var(--c-text-0);margin:0 0 4px">${escapeHtml(name)}</h2>`
    + `<p style="margin:0;color:var(--c-text-2);font-size:13px">${playlistCountText(count)}</p></div>`
    + `<div style="display:flex;gap:8px">${playBtn}`
    + '<button class="btn btn-ghost" id="btnDeletePlaylist" style="color:var(--c-error)">Listeyi Sil</button>'
    + '</div></div>';
}

/** Silme onay başlık/metni (app.ts confirmDialog ile birebir). */
export function buildPlaylistDeleteConfirm(name: string): { title: string; message: string } {
  return { title: 'Listeyi Sil', message: `"${name}" listesini silmek istediğinize emin misiniz?` };
}

/* ── Settings ─────────────────────────────── */

/** Varsayılan tema (app.ts `t || 'dark'` ile birebir). */
export const DEFAULT_THEME = 'dark';
/** Varsayılan kalite (app.ts `q || 'high'` ile birebir). */
export const DEFAULT_QUALITY = 'high';

/** Kayıtlı tema yoksa varsayılan (app.ts then ile birebir). */
export function normalizeTheme(raw: unknown): string {
  return (raw as string) || DEFAULT_THEME;
}

/** Kayıtlı kalite yoksa varsayılan (app.ts then ile birebir). */
export function normalizeQuality(raw: unknown): string {
  return (raw as string) || DEFAULT_QUALITY;
}

/** Otomatik-oynat varsayılanı açık (app.ts `v !== false` ile birebir). */
export function normalizeAutoPlay(raw: unknown): boolean {
  return raw !== false;
}

/** applyTheme etkin değer: system → OS tercihi (app.ts ile birebir). */
export function resolveEffectiveTheme(theme: string, prefersDark: boolean): string {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** Sürüm rozeti metni (app.ts `v${v}` ile birebir). */
export function formatAppVersion(v: string): string {
  return `v${v}`;
}

/** Rozet yalnızca sürüm varsa yazılır (app.ts `el && v` ile birebir). */
export function shouldShowAppVersion(v: unknown): boolean {
  return !!v;
}

export interface UpdateCheckResult {
  status?: string;
  version?: string;
  message?: string;
}

export interface UpdateCheckDisplay {
  statusText: string;
  toastText?: string;
  toastKind?: 'info' | 'error';
}

/** Güncelleme denetimi sonucu → durum satırı + toast (app.ts M-05 zinciri ile birebir). */
export function resolveUpdateCheckDisplay(r: UpdateCheckResult | null | undefined): UpdateCheckDisplay {
  if (!r) return { statusText: 'Denetim desteklenmiyor' };
  if (r.status === 'available') {
    const text = `Yeni sürüm mevcut: v${r.version}`;
    return { statusText: text, toastText: text, toastKind: 'info' };
  }
  if (r.status === 'up-to-date') return { statusText: 'Uygulama güncel' };
  return { statusText: `Denetim başarısız: ${r.message || 'bilinmeyen hata'}` };
}

/** Denetim exception'ı (app.ts catch ile birebir). */
export function resolveUpdateCheckError(): UpdateCheckDisplay {
  return { statusText: 'Denetim başarısız' };
}

/** OAuth durum satırı (app.ts clientId üçlüsü ile birebir). */
export function resolveGoogleOAuthStatus(clientId: unknown): string {
  return clientId ? '✓ Yapılandırıldı' : 'Yapılandırılamadı';
}

/** Bağlı uygulama yoksa liste yedeği (app.ts refresh ile birebir). */
export const AUTH_CLIENTS_EMPTY_HTML = '<em>Henüz bağlı uygulama yok</em>';

export interface AuthClient {
  appId: unknown;
  appName: unknown;
}

/** Bağlı uygulamalar listesi HTML'i (app.ts refresh map ile birebir yapı). */
export function buildAuthClientsHtml(clients: readonly AuthClient[]): string {
  if (!clients.length) return AUTH_CLIENTS_EMPTY_HTML;
  return clients.map((c) =>
    '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--c-border)">'
    + `<span>${escapeHtml(c.appName)} (${escapeHtml(c.appId)})</span>`
    + `<button data-revoke="${escapeHtml(c.appId)}" style="color:var(--c-error)">Sil</button></div>`,
  ).join('');
}

/** İstemci oluşturma guard'ı: iki alan da gerekli (app.ts ile birebir). */
export function isValidAuthClientInput(appId: string, appName: string): boolean {
  return !!appId && !!appName;
}

/* ── Discord / bot server ─────────────────── */

/** RPC durum yoklama aralığı (app.ts setInterval ile birebir). */
export const DISCORD_POLL_MS = 15000;
/** RPC hazır-değil metni (tokensuz — uygulama bekleniyor). */
export const DISCORD_WAITING_TEXT = 'Discord uygulaması bekleniyor...';
/** RPC hata yedeği. */
export const DISCORD_UNKNOWN_TEXT = '—';
/** Discord kapalı metni. */
export const DISCORD_OFF_TEXT = 'Kapalı';
/** Bot server durum metinleri (app.ts ile birebir). */
export const BOT_SERVER_ON_TEXT = '✓ Aktif (Port 9863)';
export const BOT_SERVER_OFF_TEXT = 'Kapalı';

/** RPC hazır → durum satırı (app.ts refreshDiscordStatus ile birebir). */
export function resolveDiscordRpcStatus(ready: boolean): string {
  return ready ? '✓ Bağlı (RPC)' : DISCORD_WAITING_TEXT;
}

/** Discord hesap etiketi (app.ts name/username/Bağlı zinciri ile birebir). */
export function resolveDiscordAccountLabel(u: { name?: unknown; username?: unknown } | null | undefined): string {
  if (!u) return 'Bağlı değil';
  return String((u.name as string) || (u.username as string) || 'Bağlı');
}

/** Hesap kapağı yalnızca picture varsa (app.ts dalı ile birebir). */
export function shouldShowDiscordAvatar(u: { picture?: unknown } | null | undefined): boolean {
  return !!u?.picture;
}

/** Bot server anahtar metni (app.ts toggle ile birebir). */
export function resolveBotServerStatus(active: boolean): string {
  return active ? BOT_SERVER_ON_TEXT : BOT_SERVER_OFF_TEXT;
}

/** Kayıtlı değer katı true ise açık (app.ts `v === true` ile birebir). */
export function normalizeBotServerEnabled(raw: unknown): boolean {
  return raw === true;
}

/** Token koruması toast'u (app.ts setAuthEnabled sonrası ile birebir). */
export function resolveBotAuthToast(enabled: boolean): { text: string; kind: 'info' | 'warning' } {
  if (enabled) return { text: 'Token koruması açıldı.', kind: 'info' };
  return { text: 'Token koruması kapatıldı (açık mod).', kind: 'warning' };
}

/** İstenen/kaydedilen uyuşmazsa işlem iptal sayılır (app.ts desired !== enabled ile birebir). */
export function shouldAbortBotAuthToggle(desired: boolean, actual: boolean): boolean {
  return desired !== actual;
}

/** regenerateToken yanıtından ham token (nesne ya da düz string). */
export function extractRegenToken(res: { token?: unknown } | string | null | undefined): string {
  if (!res) return '';
  if (typeof res === 'string') return res;
  return (res.token as string) || '';
}

/** Özel Application ID kaydı trim'lenir (app.ts btnSaveAppId ile birebir). */
export function normalizeCustomAppId(raw: string): string {
  return raw.trim();
}

/* ── Boot / init ──────────────────────────── */

/** Açılış sayfası (app.ts navigateTo('home') ile birebir). */
export const INIT_DEFAULT_PAGE = 'home';

/** Kayıtlı ses: eski 0-1 formatı 0-100'e çevrilir (app.ts init ile birebir). */
export function normalizeSavedVolume(savedVol: number): number {
  return savedVol <= 1 ? Math.round(savedVol * 100) : savedVol;
}

/** Ses kaydı varsa geri yükle (app.ts `savedVol != null` ile birebir). */
export function shouldRestoreVolume(savedVol: number | null | undefined): boolean {
  return savedVol != null;
}

/** Karışık-sıra yalnızca açıkken + kuyruk varken kurulur (app.ts init ile birebir). */
export function shouldBuildShuffleOrder(savedShuffle: unknown, queueLength: number): boolean {
  return !!savedShuffle && queueLength > 0;
}

/** Kayıtlı tekrar varsa geri yükle (app.ts `if (savedRepeat)` ile birebir). */
export function shouldRestoreRepeat(savedRepeat: unknown): boolean {
  return !!savedRepeat;
}

/** repeat=one düğme ikonu (app.ts init innerHTML ile birebir). */
export const REPEAT_ONE_BUTTON_HTML =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
  + '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>'
  + '<polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
  + '<text x="12" y="14" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-weight="bold">1</text></svg>';

/** Kayıtlı beğeni detaylarından registry'ye alınacak şarkılar (id'si olanlar). */
export function collectRegistrySongs(details: Record<string, Song>): Song[] {
  return Object.values(details).filter((s) => s?.id);
}
