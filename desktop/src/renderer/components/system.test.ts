import { describe, expect, it } from 'vitest';
import {
  CHROME_LOGIN_TOAST,
  isLoginOpenFailure,
  resolveLoginErrorText,
  hasExternalChrome,
  resolveChromePromptTitle,
  resolveChromeImportButtonLabel,
  resolveChromeImportInitialStatus,
  buildImportSuccessText,
  buildImportFailureText,
  buildImportExceptionText,
  normalizeUserName,
  buildChromeImportModalHtml,
  MEDIA_SEEK_STEP,
  shouldHandleMediaSeek,
  buildMediaArtwork,
  PLAYLISTS_EMPTY_HTML,
  LOCAL_PLAYLIST_EMPTY_BODY,
  buildLocalPlaylistId,
  buildLocalPlaylistEntry,
  shouldCreatePlaylist,
  findLocalPlaylist,
  removeLocalPlaylist,
  playlistCountText,
  shouldShowPlaylistPlay,
  buildPlaylistsNavHtml,
  buildLocalPlaylistHeaderHtml,
  buildPlaylistDeleteConfirm,
  DEFAULT_THEME,
  DEFAULT_QUALITY,
  normalizeTheme,
  normalizeQuality,
  normalizeAutoPlay,
  resolveEffectiveTheme,
  formatAppVersion,
  shouldShowAppVersion,
  resolveUpdateCheckDisplay,
  resolveUpdateCheckError,
  resolveGoogleOAuthStatus,
  AUTH_CLIENTS_EMPTY_HTML,
  buildAuthClientsHtml,
  isValidAuthClientInput,
  DISCORD_POLL_MS,
  DISCORD_WAITING_TEXT,
  DISCORD_UNKNOWN_TEXT,
  DISCORD_OFF_TEXT,
  BOT_SERVER_ON_TEXT,
  BOT_SERVER_OFF_TEXT,
  resolveDiscordRpcStatus,
  resolveDiscordAccountLabel,
  shouldShowDiscordAvatar,
  resolveBotServerStatus,
  normalizeBotServerEnabled,
  resolveBotAuthToast,
  shouldAbortBotAuthToggle,
  extractRegenToken,
  normalizeCustomAppId,
  INIT_DEFAULT_PAGE,
  normalizeSavedVolume,
  shouldRestoreVolume,
  shouldBuildShuffleOrder,
  shouldRestoreRepeat,
  REPEAT_ONE_BUTTON_HTML,
  collectRegistrySongs,
  DISCORD_REFRESH_MS,
  shouldSendDiscordUpdate,
  buildDiscordActivityPayload,
  resolveDiscordTrackKey,
  resolvePollDiscordAction,
  resolvePreviewDisplay,
  resolvePreviewEffDuration,
  previewProgressPct,
  buildBotRecs,
} from './system';

describe('auth / chrome import', () => {
  it('exposes login toast', () => {
    expect(CHROME_LOGIN_TOAST).toContain('Chrome');
  });
  it('detects open failure', () => {
    expect(isLoginOpenFailure(null)).toBe(true);
    expect(isLoginOpenFailure({ opened: false })).toBe(true);
    expect(isLoginOpenFailure({ opened: true })).toBe(false);
  });
  it('builds login error text', () => {
    expect(resolveLoginErrorText({ error: 'x' })).toBe('Chrome açılamadı: x');
    expect(resolveLoginErrorText({})).toBe('Chrome açılamadı: bilinmeyen hata');
    expect(resolveLoginErrorText(null)).toBe('Chrome açılamadı: bilinmeyen hata');
  });
  it('resolves external chrome + prompt copy', () => {
    expect(hasExternalChrome({ externalFound: 1 })).toBe(true);
    expect(hasExternalChrome({})).toBe(false);
    expect(hasExternalChrome(null)).toBe(false);
    expect(resolveChromePromptTitle(true)).toBe('Açık YouTube Music Hesabını Seç');
    expect(resolveChromePromptTitle(false)).toBe('Harmonic Giriş Penceresi Açıldı');
    expect(resolveChromeImportButtonLabel(true)).toBe('Seçili Hesapla Giriş Yap');
    expect(resolveChromeImportButtonLabel(false)).toBe('Girişi Aktar');
    expect(resolveChromeImportInitialStatus(true)).toBe('Harici Chrome hesabı bekleniyor...');
    expect(resolveChromeImportInitialStatus(false)).toBe('Pencere açık, giriş bekleniyor...');
  });
  it('builds import status texts', () => {
    expect(buildImportSuccessText('Ada', 12)).toContain('Ada');
    expect(buildImportSuccessText('', 3)).toContain('Giriş');
    expect(buildImportFailureText('bad')).toContain('bad');
    expect(buildImportFailureText(undefined)).toContain('Pencerede giriş yapılmamış');
    expect(buildImportExceptionText(new Error('boom'))).toContain('boom');
    expect(buildImportExceptionText('oops')).toContain('oops');
  });
  it('normalizes user name', () => {
    expect(normalizeUserName('Ada', 'Ada')).toBe('Ada');
    expect(normalizeUserName('  ', '')).toBe('');
  });
  it('builds chrome import modal (external found)', () => {
    const html = buildChromeImportModalHtml(true);
    expect(html).toContain('max-width:520px');
    expect(html).toContain('Açık YouTube Music Hesabını Seç');
    expect(html).toContain('Zaten YouTube Music açık');
    expect(html).toContain('Harici Chrome hesabı bekleniyor...');
    expect(html).toContain('Seçili Hesapla Giriş Yap');
    expect(html).toContain('id="closeChromeImport"');
    expect(html).toContain('id="cancelChromeImport"');
    expect(html).toContain('id="doChromeImport"');
    expect(html).toContain('id="importStatus"');
  });
  it('builds chrome import modal (fresh window)', () => {
    const html = buildChromeImportModalHtml(false);
    expect(html).toContain('Harmonic Giriş Penceresi Açıldı');
    expect(html).toContain('YouTube Music giriş penceresi');
    expect(html).toContain('Girişi Aktar');
    expect(html).toContain('Pencere açık, giriş bekleniyor...');
    expect(html).not.toContain('Zaten YouTube Music açık');
  });
});

describe('media session', () => {
  it('exposes seek step + guard', () => {
    expect(MEDIA_SEEK_STEP).toBe(10);
    expect(shouldHandleMediaSeek(0)).toBe(false);
    expect(shouldHandleMediaSeek(5)).toBe(true);
  });
  it('builds artwork', () => {
    expect(buildMediaArtwork(undefined)).toEqual([]);
    expect(buildMediaArtwork('')).toEqual([]);
    expect(buildMediaArtwork('t')[0]).toMatchObject({ sizes: '480x480', type: 'image/jpeg' });
  });
});

describe('local playlists', () => {
  it('builds ids + entries + guards', () => {
    expect(buildLocalPlaylistId(7)).toBe('pl_7');
    expect(buildLocalPlaylistEntry('Mix', 7)).toMatchObject({ id: 'pl_7', name: 'Mix' });
    expect(shouldCreatePlaylist('a')).toBe(true);
    expect(shouldCreatePlaylist('')).toBe(false);
  });
  it('finds and removes', () => {
    const pls = [buildLocalPlaylistEntry('A', 1), buildLocalPlaylistEntry('B', 2)];
    expect(findLocalPlaylist(pls, 'pl_2')?.name).toBe('B');
    expect(findLocalPlaylist(pls, 'no')).toBeUndefined();
    expect(removeLocalPlaylist(pls, 'pl_1').length).toBe(1);
    expect(removeLocalPlaylist(pls, 'no').length).toBe(2);
  });
  it('renders nav + header', () => {
    expect(buildPlaylistsNavHtml([])).toBe(PLAYLISTS_EMPTY_HTML);
    const html = buildPlaylistsNavHtml([{ id: 'pl_1', name: '<x>', songs: [], createdAt: 1 }]);
    expect(html).toContain('data-pl="pl_1"');
    expect(html).not.toContain('<x>');
    expect(playlistCountText(3)).toContain('3 şarkı');
    expect(shouldShowPlaylistPlay(1)).toBe(true);
    expect(shouldShowPlaylistPlay(0)).toBe(false);
    const withPlay = buildLocalPlaylistHeaderHtml('Mix', 2);
    expect(withPlay).toContain('btnPlayPlaylist');
    expect(withPlay).toContain('Mix');
    expect(buildLocalPlaylistHeaderHtml('Mix', 0)).not.toContain('btnPlayPlaylist');
    expect(LOCAL_PLAYLIST_EMPTY_BODY).toContain('henüz şarkı yok');
    expect(buildPlaylistDeleteConfirm('Mix')).toMatchObject({ title: 'Listeyi Sil' });
  });
});

describe('settings', () => {
  it('normalizes theme/quality/autoplay', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(DEFAULT_QUALITY).toBe('high');
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('')).toBe('dark');
    expect(normalizeTheme(undefined)).toBe('dark');
    expect(normalizeQuality('low')).toBe('low');
    expect(normalizeQuality(undefined)).toBe('high');
    expect(normalizeAutoPlay(false)).toBe(false);
    expect(normalizeAutoPlay(true)).toBe(true);
    expect(normalizeAutoPlay(undefined)).toBe(true);
  });
  it('resolves theme + version', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');
    expect(resolveEffectiveTheme('dark', false)).toBe('dark');
    expect(formatAppVersion('1.0.1')).toBe('v1.0.1');
    expect(shouldShowAppVersion('1')).toBe(true);
    expect(shouldShowAppVersion('')).toBe(false);
  });
  it('maps update check results', () => {
    expect(resolveUpdateCheckDisplay(null).statusText).toBe('Denetim desteklenmiyor');
    const avail = resolveUpdateCheckDisplay({ status: 'available', version: '2' });
    expect(avail.statusText).toContain('v2');
    expect(avail.toastKind).toBe('info');
    expect(resolveUpdateCheckDisplay({ status: 'up-to-date' }).statusText).toBe('Uygulama güncel');
    expect(resolveUpdateCheckDisplay({ status: 'error', message: 'x' }).statusText).toContain('x');
    expect(resolveUpdateCheckDisplay({ status: 'error' }).statusText).toContain('bilinmeyen hata');
    expect(resolveUpdateCheckDisplay({}).statusText).toContain('bilinmeyen hata');
    expect(resolveUpdateCheckError().statusText).toBe('Denetim başarısız');
  });
  it('renders auth clients', () => {
    expect(resolveGoogleOAuthStatus('id')).toBe('✓ Yapılandırıldı');
    expect(resolveGoogleOAuthStatus('')).toBe('Yapılandırılamadı');
    expect(buildAuthClientsHtml([])).toBe(AUTH_CLIENTS_EMPTY_HTML);
    const html = buildAuthClientsHtml([{ appId: 'a', appName: 'N' }]);
    expect(html).toContain('data-revoke="a"');
    expect(isValidAuthClientInput('a', 'b')).toBe(true);
    expect(isValidAuthClientInput('', 'b')).toBe(false);
    expect(isValidAuthClientInput('a', '')).toBe(false);
  });
});

describe('discord / bot', () => {
  it('exposes constants', () => {
    expect(DISCORD_POLL_MS).toBe(15000);
    expect(DISCORD_WAITING_TEXT.length).toBeGreaterThan(0);
    expect(DISCORD_UNKNOWN_TEXT).toBe('—');
    expect(DISCORD_OFF_TEXT).toBe('Kapalı');
    expect(BOT_SERVER_ON_TEXT).toContain('9863');
    expect(BOT_SERVER_OFF_TEXT).toBe('Kapalı');
  });
  it('resolves status + account', () => {
    expect(resolveDiscordRpcStatus(true)).toContain('Bağlı');
    expect(resolveDiscordRpcStatus(false)).toBe(DISCORD_WAITING_TEXT);
    expect(resolveDiscordAccountLabel(null)).toBe('Bağlı değil');
    expect(resolveDiscordAccountLabel({ name: 'N' })).toBe('N');
    expect(resolveDiscordAccountLabel({ username: 'u' })).toBe('u');
    expect(resolveDiscordAccountLabel({})).toBe('Bağlı');
    expect(shouldShowDiscordAvatar({ picture: 'p' })).toBe(true);
    expect(shouldShowDiscordAvatar({})).toBe(false);
    expect(shouldShowDiscordAvatar(null)).toBe(false);
  });
  it('resolves bot server + token', () => {
    expect(resolveBotServerStatus(true)).toBe(BOT_SERVER_ON_TEXT);
    expect(resolveBotServerStatus(false)).toBe(BOT_SERVER_OFF_TEXT);
    expect(normalizeBotServerEnabled(true)).toBe(true);
    expect(normalizeBotServerEnabled(false)).toBe(false);
    expect(normalizeBotServerEnabled('true')).toBe(false);
    expect(resolveBotAuthToast(true).kind).toBe('info');
    expect(resolveBotAuthToast(false).kind).toBe('warning');
    expect(shouldAbortBotAuthToggle(true, false)).toBe(true);
    expect(shouldAbortBotAuthToggle(true, true)).toBe(false);
    expect(extractRegenToken(null)).toBe('');
    expect(extractRegenToken('t')).toBe('t');
    expect(extractRegenToken({ token: 'k' })).toBe('k');
    expect(extractRegenToken({})).toBe('');
    expect(normalizeCustomAppId('  a  ')).toBe('a');
  });
  it('throttles discord updates like updateDiscordForTrack', () => {
    expect(DISCORD_REFRESH_MS).toBe(30000);
    expect(shouldSendDiscordUpdate('', 0, 1000, '', 'T')).toBe(false);
    expect(shouldSendDiscordUpdate('', 0, 1000, 'k', '')).toBe(false);
    expect(shouldSendDiscordUpdate('', 0, 1000, 'k', 'T')).toBe(true);
    expect(shouldSendDiscordUpdate('k', 1000, 1000 + DISCORD_REFRESH_MS - 1, 'k', 'T')).toBe(false);
    expect(shouldSendDiscordUpdate('k', 1000, 1000 + DISCORD_REFRESH_MS, 'k', 'T')).toBe(true);
    expect(shouldSendDiscordUpdate('k', 1000, 1001, 'k', 'T', true)).toBe(true);
    expect(shouldSendDiscordUpdate('a', 0, 1, 'b', 'T')).toBe(true);
  });
  it('builds discord payload verbatim (timestamps, cover, buttons)', () => {
    const p = buildDiscordActivityPayload({ key: 'k', title: 'T', artist: 'A', currentTime: 10, duration: 200, now: 60000 });
    expect(p.details).toBe('T');
    expect(p.state).toBe('A');
    expect(p.startTimestamp).toBe(60000 - 10000);
    expect(p.endTimestamp).toBe(60000 - 10000 + 200000);
    expect(p.smallImageKey).toBe('logo');
    expect((p as { largeImageText?: string }).largeImageText).toBe('T');
    expect((p as { buttons?: unknown }).buttons).toBeUndefined();
    const p11 = buildDiscordActivityPayload({ key: '12345678901', title: 'T', artist: '', coverUrl: 'c', album: 'Al', currentTime: 0, duration: 0, now: 5000 });
    expect((p11 as { largeImageText?: string }).largeImageText).toBe('Al');
    expect(p11.coverUrl).toBe('c');
    expect((p11 as { buttons?: Array<{ url: string }> }).buttons?.[0].url).toContain('12345678901');
    expect(p11.endTimestamp).toBeUndefined();
    const pNeg = buildDiscordActivityPayload({ key: 'k', title: 'T', artist: 'A', currentTime: -5, duration: 10, now: 1000 });
    expect(pNeg.startTimestamp).toBe(1000);
    const pNow = buildDiscordActivityPayload({ key: 'k', title: 'T', artist: 'A', currentTime: 1, duration: 10 });
    expect(typeof pNow.startTimestamp).toBe('number');
  });
  it('resolves discord keys, poll actions and preview display', () => {
    expect(resolveDiscordTrackKey('id1', 'T', 'A')).toBe('id1');
    expect(resolveDiscordTrackKey(undefined, 'T', 'A')).toBe('T|A');
    expect(resolvePollDiscordAction(false, 'k', 'k', false)).toBe('clear');
    expect(resolvePollDiscordAction(false, 'k', '', false)).toBe('none');
    expect(resolvePollDiscordAction(true, 'new', 'old', true)).toBe('update');
    expect(resolvePollDiscordAction(true, 'same', 'same', true)).toBe('refresh');
    expect(resolvePollDiscordAction(true, '', '', true)).toBe('none');
    expect(resolvePollDiscordAction(true, 'k', 'old', false)).toBe('none');
    const d = resolvePreviewDisplay(undefined, undefined, undefined, undefined, null);
    expect(d.displayTitle.length).toBeGreaterThan(0);
    expect(d.displayCover).toContain('assets');
    const d2 = resolvePreviewDisplay('T', 'A', 'C', 'Al', { title: 'S', artist: 'B', album: 'X', thumbnail: 'Y' });
    expect(d2).toEqual({ displayTitle: 'T', displayArtist: 'A', displayAlbum: 'Al', displayCover: 'C' });
    const d3 = resolvePreviewDisplay(undefined, undefined, undefined, undefined, { title: 'S', artist: 'B', album: 'X', thumbnail: 'Y' });
    expect(d3).toEqual({ displayTitle: 'S', displayArtist: 'B', displayAlbum: 'X', displayCover: 'Y' });
    const d4 = resolvePreviewDisplay('', '', '', '', undefined);
    expect(d4.displayTitle.length).toBeGreaterThan(0);
    expect(resolvePreviewEffDuration(100)).toBe(100);
    expect(resolvePreviewEffDuration(0)).toBe(287);
    expect(previewProgressPct(50, 200)).toBe(25);
    expect(previewProgressPct(0, 0)).toBe(25);
    expect(previewProgressPct(-5, 100)).toBe(0);
    expect(previewProgressPct(500, 100)).toBe(100);
    const recs = buildBotRecs([{ id: 'a', title: 'T', artist: 'A', thumbnail: 'th' }]);
    expect(recs[0].url).toContain('a');
    expect(buildBotRecs([])).toEqual([]);
    expect(buildBotRecs([{ id: '', title: 'T', artist: 'A', thumbnail: 'th' }])[0].url).toBeUndefined();
  });
});

describe('boot / init', () => {
  it('normalizes persisted state', () => {
    expect(INIT_DEFAULT_PAGE).toBe('home');
    expect(normalizeSavedVolume(0.8)).toBe(80);
    expect(normalizeSavedVolume(80)).toBe(80);
    expect(shouldRestoreVolume(0)).toBe(true);
    expect(shouldRestoreVolume(null)).toBe(false);
    expect(shouldRestoreVolume(undefined)).toBe(false);
    expect(shouldBuildShuffleOrder(true, 3)).toBe(true);
    expect(shouldBuildShuffleOrder(true, 0)).toBe(false);
    expect(shouldBuildShuffleOrder(false, 3)).toBe(false);
    expect(shouldRestoreRepeat('all')).toBe(true);
    expect(shouldRestoreRepeat('')).toBe(false);
    expect(REPEAT_ONE_BUTTON_HTML).toContain('<text');
    expect(collectRegistrySongs({ a: { id: 'a' } as never, b: {} as never }).length).toBe(1);
  });
});
