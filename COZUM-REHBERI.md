# Harmonic — Çözüm Rehberi

> **Uygulama durumu (16 Eyl 2026, working tree — commitlenmedi):**
> ✅ Faz-0 (kısmi: commit kullanıcıya bırakıldı) · ✅ Faz-1 tamam (M-01, S-01, M-07, M-02, M-03; W-01 ve R-01 yanlış alarm çıktı, kod değişmedi)
> ✅ Faz-2 tamam (M-04, M-06, R-02, M-11, M-12, M-08, M-05)
> ✅ Faz-3 tamam (P3-01/04/05/06/07/08, lyrics timeout, M-10 logger, M-09 sandbox, W-02 SEO)
> ⏸️ Ertelenenler: M-13 (auth zamanlama — canlı testsiz kırılgan alana dokunulmadı), R-03 (modül bölme — testsiz büyük refactor riski), P3-02 `cleanTitle` (canlı eşleşme verisi olmadan değiştirilmedi)
> 17 Eyl doc-tutarlılık: M-08 token davranışı `DOKUMANTASYON.md` §4.4 + `website/discord-bot.html` REST sekmesine işlendi, `build:website` tazelendi; memory.md'ye §8 Antigravity promptu + §9 kota notu eklendi.
> 17 Eyl canlı smoke: gerçek binary 2 kez çalıştı/öldürüldü (çökme yok); `/health`+`/state` 200, sürüm dinamik; bulunan `duration` çelişkisi `effDuration` ile düzeltildi, full rebuild (installer+portable+zip) + relaunch doğrulaması yapıldı.
> `typecheck` her faz sonu temiz. Smoke-test listesi için bu dosyanın sonundaki "Doğrulama komutları" + Faz-2/3 kabul kriterlerine bakın.
>

> Eşlikçi dosya: `ANALIZ-RAPORU.md` (bulgu ID'leri buraya atıf yapar).
> İlke: önce emniyet (Faz-0), sonra P0 → P1 → P2/P3. Her madde **dosya + diff + test + kabul kriteri** içerir.
> Kod değiştirmeden önce `npm run typecheck --workspace=desktop` ile taban çizgisini alın (şu an temiz).

---

## Faz-0 · Emniyet (koddan önce, ~15 dk)

### G-02 · Çalışmayı commit'le
```powershell
git status --short
git add desktop/src website/css website/js website/*.html
git commit -m "fix: v1.0.1 sonrasi yerel duzeltmeler (detay ANALIZ-RAPORU.md)"
```
- **Neden:** 10 dosya `M` durumunda; kayıp/çatışma riski (ANALIZ-RAPORU §4 G-02).
- **Kabul:** `git status --short` temiz.

### G-01 · `website/dist/` takibini bırak
```powershell
git rm -r --cached website/dist
```
`.gitignore`'a ekle:
```
website/dist/
```
- **Kabul:** `git ls-files website/dist` boş; site `npm run build:website` ile yeniden üretilebiliyor.

---

## Faz-1 · Kritik + yüksek güvenlik (P0/P1)

### M-01 · Beğenilenler: sabit ID'yi kaldır
**Dosya:** `desktop/src/main/api/innertube.ts:733-750`
1. YouTube Music'te girişli oturumla `browse` çıktısını dump'la, gerçek "beğenilenler" hedefini bul (aday: `FEmusic_liked_videos` veya hesap menüsündeki liste).
2. `getLikedSongs()`'u bulunan hedefe geçir; sabit `'VLPL...'` stringini sil.
3. Hedef bulunamazsa **geçici güvenli davranış:** boş dizi + log (yanlış liste göstermeye devam etme).
- **Test:** girişli hesapta Beğenilenler sayfası gerçek listeyi gösteriyor; girişte chapter yoksa boş-durum mesajı.
- **Kabul:** kodda `VLPLAKBLuBWqGYwwzJL5VdKOlpkUeMn0jKZ` geçmiyor.

### W-01 · ~~Bozuk Türkçe karakterleri onar~~ — YANLIŞ ALARM, işlem yok (16 Eyl 2026)
Doğrulama sonucu dosyalar zaten temiz UTF-8 (bk. `ANALIZ-RAPORU.md` §2). Kod değişikliği yapılmadı; aşağıdaki adım yalnızca gelecekteki şüpheler için kayıt:
```powershell
# Şüphe durumunda dosya bütünlüğünü doğrulama (değişiklik yapmaz):
Select-String -Path website/*.html,website/js/*.js -Pattern '�'  # boş dönmeli
```
- **Kabul:** tarama boş → kapatıldı.

### S-01 · Auth token'lara süre sonu + IPC redaksiyonu
**Dosyalar:** `desktop/src/main/providers/auth-provider.ts`, `desktop/src/main/main.ts:403`
```ts
// auth-provider.ts
interface Client { appId:string; appName:string; appVersion?:string; token:string; createdAt:number; expiresAt:number; }
const TTL = 1000*60*60*24*90; // 90 gün
createManual(...) { ... expiresAt: Date.now()+TTL ... }
isValid(token:string){ const c=this.listClients().find(c=>c.token===token); return !!c && c.expiresAt > Date.now(); }
// süresi dolmuşları periyodik temizle
```
```ts
// main.ts — token'ı renderer'a verme
ipcMain.handle('auth:clients', () => authProvider.listClients().map(({appId,appName,appVersion,createdAt}) => ({appId,appName,appVersion,createdAt})));
```
- **Test:** eski token `isValid` → false; renderer yanıtında `token` alanı yok.
- **Kabul:** IPC çıktısında gizli alan yok; typecheck temiz.

### M-07 · `setWindowOpenHandler`'ı allowlist'e bağla
**Dosya:** `desktop/src/main/main.ts:90-93`, `281-291`
1. `281-291`'deki denetimi `isAllowedExternalUrl(url): boolean` fonksiyonuna çıkar (tek kaynak; `music.youtube.com` tekrarını sil).
2. `setWindowOpenHandler` içinde aynı fonksiyonu kullan; izin verilmeyen URL → `{ action: 'deny' }`.
- **Test:** `https://music.youtube.com/watch?v=x` açılıyor; `https://evil.example` açılmıyor.
- **Kabul:** allowlist tek fonksiyonda, iki çağrı noktası da onu kullanıyor.

### M-02 · Oynatma hatalarını görünür yap
**Dosya:** `desktop/src/main/main.ts:187-204`, `desktop/src/main/api/stream-resolver.ts:479-484`
```ts
// main.ts
try {
  await streamResolver.play(videoId);
  return { id: videoId, playing: true };
} catch (err:any) {
  console.error('[Player] play error:', err?.message||err);
  return { id: videoId, playing: false, error: 'play_failed' };
}
```
- Renderer tarafı (`app.ts:1069`) zaten `!res?.playing` dalını işliyor → kullanıcı artık "çalınamıyor" uyarısını gerçekten görür.
- **Kabul:** `destroy()` sonrası `yt:player` çağrısı `{ playing:false }` dönüyor, istisna main loop'a kaçmıyor.

### M-03 · Refresh'e env yedeğini ekle + ölü değişkeni sil
**Dosya:** `desktop/src/main/auth/google-oauth.ts:321-344`
```ts
private async refreshGoogleToken(tokens: OAuthTokens): Promise<void> {
  if (!tokens.refresh_token) return;
  try {
    const { clientId, clientSecret } = this.getGoogleConfig(); // store + env fallback
    if (!clientId || !clientSecret) return;
    ...
```
- Satır 324'teki kullanılmayan `const config` satırını sil.
- **Kabul:** env-only kurulumda refresh isteği dolu kimlikle gidiyor (başarısızlık hâlâ `catch` içinde ama artık kimlikten değil).

---

## Faz-2 · P1/P2 işlevsel borç

### M-04 · Pencere boyutunu hatırla
**Dosya:** `desktop/src/main/main.ts:37-58`, `70-81`
1. Açılışta `storeManager.getWindowBounds()` varsa `width/height/x/y` ile pencereyi kur.
2. `mainWindow.on('close')` + `resize/move` (debounce'lu) → `saveWindowBounds(mainWindow.getBounds())`.
- **Kabul:** yeniden başlatınca boyut/konum korunuyor.

### R-01 · ~~Sıra tıklamasında birleşik indisi düzelt~~ — YANLIŞ ALARM, işlem yok (16 Eyl 2026)
İzleme sonucu `idx - 1` doğru (gerekçe `ANALIZ-RAPORU.md` R-01 notunda). Kod değişikliği yapılmadı.

### M-06 · `getNext`/`getLyrics`'i canlı yanıtla doğrula
**Dosya:** `desktop/src/main/api/innertube.ts:551-583`, `609-703`
1. Girişli oturumda `next` yanıtını dosyaya dump'la (`JSON.stringify(data).length` + ilk 2 seviye anahtarlar).
2. Ayrıştırıcıyı toleranslı yaz: `playlistPanelRenderer.contents` → `musicQueueRenderer` → mevcut yol sırasıyla dene; hiçbiri yoksa `{ items: [] }` + `console.warn` (sessiz değil).
3. `lyricsBrowseId = 'UCB0o...'` kuklasını sil; endpoint bulunamazsa doğrudan LRCLIB'e düş.
- **Kabul:** radyo/otomatik-devam gerçek şarkı üretiyor; logda kukla ID'ye istek yok.

### R-02 · Kart ızgaralarına `escapeHtml`
**Dosya:** `desktop/src/renderer/components/app.ts:1911-1914`, `2082-2084`, `2097`, `2112`
- `c.browseId`, `c.thumbnail`, `c.title`, `c.artist`, `pl.thumbnail` interpolasyonlarını `escapeHtml(...)` ile sar (arama kartlarındaki `565-568` kalıbıyla aynı).
- **Kabul:** `app.ts`'te şablon içine çiğ `${c.` / `${pl.thumbnail}` kalmadı.

### M-08 · BotServer'a isteğe bağlı token
**Dosya:** `desktop/src/main/api/bot-server.ts`
1. `BOT_TOKEN` (randomUUID, `harmonic-settings` store'unda) üret; Ayarlar'da göster/kopyala.
2. `Authorization: Bearer` varsa zorunlu kıl, yoksa mevcut açık moda düş (kullanıcı tercihi; varsayılan: kapalı → açık geçiş dokümante).
3. `Access-Control-Allow-Origin: *` yerine `http://127.0.0.1:*` + `http://localhost:*` yansıtması (veya istek yoksa `*` bırak ama dokümante et).
- **Kabul:** token açıksa tokensiz istek 401; DOKUMANTASYON §4.4 güncellendi.

### M-11 · `StoreData`'yı tamamla, `as any`'leri temizle
**Dosya:** `desktop/src/main/utils/store.ts:3-19`
```ts
interface StoreData {
  ...mevcut...
  customDiscordAppId?: string;
  discordAppId?: string;
  discordButtons?: boolean;
  discordThumbnails?: boolean;
  botServerEnabled?: boolean;
  likedSongsDetails?: Record<string, { id:string; title:string; artist:string; thumbnail:string }>;
}
```
- Sonra `main.ts:372,378-380,424,468` ve `discord.ts:21,28`'deki `as any`'leri kaldır, typecheck'i tekrar çalıştır.
- **Kabul:** `grep "as any" desktop/src/main` yalnızca gerçekten dış-kütüphane kaynaklı (CDP, discord-rpc ham `request`) satırlarda kalıyor.

### M-12 · UA/istemci sürümünü tek kaynaktan besle
- `desktop/src/main/api/client-versions.ts` (yeni, küçük dosya): `CHROME_UA`, `YT_CLIENT_VERSION`, `LRCLIB_UA`.
- Kullananlar: `innertube.ts:16,124,390`, `music-auth.ts:19`, `stream-resolver.ts:415`, `lyrics-provider.ts:35,47,58`, `innertube.ts:690`.
- **Kabul:** Chrome sürümü tek dosyada; grep ile `Chrome/12` çokluğu bitti.

### M-05 · Güncellemeyi gerçekten çalışır hale getir
**Dosya:** `desktop/src/main/main.ts:438-450`, `481-489`
1. `auto:checkForUpdates` → `autoUpdater.checkForUpdates()` sonucunu dön (hata dahil, stub yok).
2. Ayarlar → "Uygulama Hakkında" grubuna "Güncellemeleri Denetle" düğmesi + durum metni bağla.
3. `checkForUpdatesAndNotify` koşulunu sadeleştir (yayın kanalı yapılandırılmadıysa kullanıcıya "yapılandırılmadı" de, sessiz geçme).
- **Kabul:** düğmeye basınca gerçek denetim sonucu görünüyor.

---

## Faz-3 · Sertleştirme + bakım (P2/P3, fırsatçı)

| ID | İş | Kabul |
|---|---|---|
| M-09 | `sandbox: true` dene (preload uyumlu). Önce `sandbox:true` ile dev'de tüm IPC akışlarını gez; bozulursa geri al ve not düş | tüm IPC testleri geçiyor |
| M-10 | Merkezi `logger` (`debug/info/warn/error`, prod'da `warn+`); boş `catch{}`'lere en az `warn` ekle (gömülü-JS stringleri hariç hepsi) | `catch {}` sayısı < 20, hepsi gerekçeli |
| M-13 | Profil beklemelerini olay-tabanlı yap (`dom-ready` + `MutationObserver`, üst sınır timeout ile) | giriş aktarma p95 süresi düşer, 15+8 sn döngü kalmaz |
| R-03 | `app.ts`'i modüllere böl (player/queue/lyrics/settings/search) — davranış değişmeden, küçük PR'larla | her modül < 500 satır, typecheck temiz |
| P3-01 | `apply()` ya sil ya da gerçek gain-node'a bağla; `pow(...,0.85)` eğrisini ayara tooltip olarak yaz | ölü kod yok |
| P3-02/03 | `cleanTitle`'da `ft/feat`'i silmek yerine parantez varyantıyla LRCLIB'e iki sorgu; tüm `fetch`'lere 8 sn `AbortController` | söz bulma oranı düşmez, asılı istek yok |
| P3-04/05 | `jsx` ayarını sil; `@types/chrome-remote-interface` kur ve `@ts-ignore`'u kaldır | typecheck temiz, ignore yok |
| P3-06 | Sürümü `app.getVersion()`'dan besle (bot-server, about, update-status, UA) | kodda `1.0.1` literali kalmaz |
| P3-07/08 | `confirm()` yerine mevcut modal kalıbı; OAuth başarı sayfasına gerçek kullanıcı adı | native dialog yok |
| W-02 | Website SEO: OG/Twitter tagleri, `favicon`, `theme-color`, JSON-LD `SoftwareApplication`, `alt` metinleri, `dist` hariç tutulduğu için build+deploy adımı dokümante | Lighthouse SEO ≥ 90 |

---

## Doğrulama komutları (her faz sonu)

```powershell
npm run typecheck --workspace=desktop   # hatasız olmalı
npm run build:website                   # website/dist tazelenmeli
```
```powershell
Select-String -Path desktop/src/main/api/innertube.ts -Pattern 'VLPLAKBLuBWqGYwwzJL5VdKOlpkUeMn0jKZ'  # boş olmalı (M-01)
Select-String -Path "website/*.html","website/js/*.js" -Pattern '�|Ǭ'                               # boş olmalı (W-01)
```
