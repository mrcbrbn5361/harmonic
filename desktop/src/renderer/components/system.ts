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

/** Chrome import modal gövdesi (app.ts showChromeImportPrompt template ile birebir). */
export function buildChromeImportModalHtml(hasExt: boolean): string {
  return `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h3>${resolveChromePromptTitle(hasExt)}</h3>
          <button class="icon-btn" id="closeChromeImport"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
          ${hasExt? `<div style="padding:10px;border-radius:8px;background:var(--c-bg-3);border:1px solid var(--c-border);margin-bottom:10px"><p style="margin:0;color:var(--c-text-1)"><strong>Zaten YouTube Music açık</strong>. Lütfen o tarayıcıda <strong>YouTube Music → sağ üst profil → Hesap değiştir</strong> ile istediğin hesaba geç, sonra buraya dönüp <strong>Girişi Aktar</strong>'a bas. Ayrı şifre ekranı açılmayacak.</p></div><p style="margin:0 0 8px;color:var(--c-text-2);font-size:12px">Not: İlk seferinde Harmonic giriş penceresi yerine mevcut Chrome'un kullanılacak, bu yüzden yeni şifre sormaz.</p>` : `<p style="margin:0 0 12px;color:var(--c-text-1);line-height:1.5">Ayrı bir <strong>YouTube Music giriş penceresi</strong> açıldı. Orada hesabınla giriş yap, ana sayfa yüklenince <strong>Girişi Aktar</strong>'a bas.</p>`}
          <div id="importStatus" style="padding:10px;border-radius:6px;background:var(--c-bg-2);font-size:13px;color:var(--c-text-2);min-height:18px">${resolveChromeImportInitialStatus(hasExt)}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelChromeImport">İptal</button>
          <button class="btn btn-primary" id="doChromeImport">${resolveChromeImportButtonLabel(hasExt)}</button>
        </div>
      </div>
    `;
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

/* ── Discord activity payload (G5: app.ts updateDiscordForTrack ile birebir) ── */

/** Aynı parça progress tazele aralığı (app.ts yerel sabit ile birebir). */
export const DISCORD_REFRESH_MS = 30000;
/** Önizleme yedek metinleri (app.ts syncBotServerAndLivePreview ile birebir). */
export const DISCORD_PREVIEW_TITLE_FALLBACK = 'Ağlama Yar';
export const DISCORD_PREVIEW_ARTIST_FALLBACK = 'Nurettin Rençber';
export const DISCORD_PREVIEW_ALBUM_FALLBACK = 'Eski Yara';
export const DISCORD_PREVIEW_COVER_FALLBACK = 'assets/icon.png';
/** Süre bilinmiyorsa önizleme yedeği (app.ts `state.duration > 0 ? ... : 287` ile birebir). */
export const DISCORD_PREVIEW_DURATION_FALLBACK = 287;

/** updateDiscordForTrack gönderim guard'ı: key/title yoksa asla, aynı parçada 30sn dolmadan asla. */
export function shouldSendDiscordUpdate(
  lastKey: string,
  lastSentAt: number,
  now: number,
  key: string,
  title: string,
  force = false,
  refreshMs = DISCORD_REFRESH_MS,
): boolean {
  if (!key || !title) return false;
  if (key === lastKey && !force) {
    if (now - lastSentAt < refreshMs) return false;
  }
  return true;
}

export interface DiscordPayloadInput {
  key: string;
  title: string;
  artist: string;
  coverUrl?: string;
  album?: string;
  currentTime: number;
  duration: number;
  now?: number;
}

/** Discord activity payload'ı (app.ts updateDiscordForTrack gövdesi ile birebir). */
export function buildDiscordActivityPayload(input: DiscordPayloadInput): Record<string, unknown> {
  const now = input.now ?? Date.now();
  const posMs = Math.max(0, Math.round((input.currentTime || 0) * 1000));
  const start = now - posMs;
  const payload: Record<string, unknown> = {
    details: input.title,
    state: input.artist || '',
    startTimestamp: start,
    smallImageKey: 'logo',
    smallImageText: 'Harmonic Music',
  };
  if (input.duration > 0) payload.endTimestamp = start + Math.round(input.duration * 1000);
  if (input.coverUrl) payload.coverUrl = input.coverUrl;
  (payload as { largeImageText?: string }).largeImageText = input.album || input.title;
  if (input.key && input.key.length === 11) {
    (payload as { buttons?: Array<{ label: string; url: string }> }).buttons = [
      { label: "YouTube Music'te Aç", url: `https://music.youtube.com/watch?v=${input.key}` },
    ];
  }
  return payload;
}

/** setDiscordActivity parça anahtarı: currentSong.id yoksa title|artist (app.ts ile birebir). */
export function resolveDiscordTrackKey(
  currentSongId: string | undefined,
  title: string,
  artist: string,
): string {
  return currentSongId || `${title}|${artist}`;
}

export type PollDiscordAction = 'clear' | 'update' | 'refresh' | 'none';

/** Poll-loop Discord dalı (app.ts 950-960 bloğu ile birebir). */
export function resolvePollDiscordAction(
  playing: boolean,
  trackKey: string,
  lastKey: string,
  hasMeta: boolean,
): PollDiscordAction {
  if (!playing) {
    if (lastKey) return 'clear';
    return 'none';
  }
  if (hasMeta && trackKey) {
    if (trackKey !== lastKey) return 'update';
    return 'refresh';
  }
  return 'none';
}

export interface PreviewDisplay {
  displayTitle: string;
  displayArtist: string;
  displayAlbum: string;
  displayCover: string;
}

/** Önizleme görünen alanları (app.ts displayTitle/Artist/Album/Cover zinciri ile birebir). */
export function resolvePreviewDisplay(
  title: string | undefined,
  artist: string | undefined,
  coverUrl: string | undefined,
  album: string | undefined,
  currentSong?: { title?: string; artist?: string; album?: string; thumbnail?: string } | null,
): PreviewDisplay {
  return {
    displayTitle: title || currentSong?.title || DISCORD_PREVIEW_TITLE_FALLBACK,
    displayArtist: artist || currentSong?.artist || DISCORD_PREVIEW_ARTIST_FALLBACK,
    displayAlbum: album || currentSong?.album || DISCORD_PREVIEW_ALBUM_FALLBACK,
    displayCover: coverUrl || currentSong?.thumbnail || DISCORD_PREVIEW_COVER_FALLBACK,
  };
}

/** Önizleme etkin süresi (app.ts `state.duration > 0 ? ... : 287` ile birebir). */
export function resolvePreviewEffDuration(duration: number): number {
  return duration > 0 ? duration : DISCORD_PREVIEW_DURATION_FALLBACK;
}

/** Önizleme ilerleme yüzdesi (app.ts barFill dalı ile birebir). */
export function previewProgressPct(currentTime: number, duration: number): number {
  if (duration > 0) return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  return 25;
}

export interface BotRecInput {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
}

/** Bot server öneri listesi (app.ts upcoming.map ile birebir). */
export function buildBotRecs(
  upcoming: readonly BotRecInput[],
): Array<{ id: string; title: string; artist: string; thumbnail: string; url?: string }> {
  return upcoming.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    thumbnail: s.thumbnail,
    url: s.id ? `https://music.youtube.com/watch?v=${s.id}` : undefined,
  }));
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
