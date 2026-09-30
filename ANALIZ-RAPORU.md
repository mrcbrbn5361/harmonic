# Harmonic — Kapsamlı Sorun Analiz Raporu

> Tarih: 16 Eylül 2026 · Kapsam: `desktop/` (main + renderer), `website/`, kök config
> Yöntem: tüm kaynak dosyalar satır satır okundu, `git status/log` incelendi, `npm run typecheck --workspace=desktop` çalıştırıldı (**temiz geçti**).
> Eşlikçi dosya: `COZUM-REHBERI.md` (her bulgunun adım adım çözümü). Özet bağlantı: `DOKUMANTASYON.md` §10.

---

## 1. Özet tablo

| Öncelik | Sayı | Başlıklar |
|---|---|---|
| **P0 — Kritik** | 2 | M-01 hardcoded beğenilenler listesi · S-01 auth token sızıntısı/süresizliği |
| **P1 — Yüksek** | 6 | M-02 fire&forget oynatma · M-03 token refresh env uyumsuzluğu · M-04 windowBounds ölü · M-05 auto-update stub · M-06 getNext/getLyrics API şekli · M-07 dış bağlantı allowlist bypass |
| **P2 — Orta** | 10 | R-02 kartlarda eksik escape · M-08 BotServer auth yok · M-09 sandbox:false · M-10 boş catch/console yağmuru · M-11 StoreData eksikliği · R-03 2679 satır tek dosya · M-12 UA/clientVersion çürümesi · G-01 website/dist repo'da · G-02 commitlenmemiş 10 dosya · M-13 profil bekleme süreleri |
| **P3 — Düşük** | 10 | Ölü `apply()` · agresif `cleanTitle` · timeoutsuz LRCLIB · `jsx: react-jsx` artığı · CDP `@ts-ignore` · sabit sürüm stringleri · `confirm()` · OAuth başarı sayfasında sabit isim · polling maliyetleri · ölü `harmonic-store-backup/` |
| **Doğrulanan "sorun değil"** | 9 | §7'ye bakın (yanlış alarmlar ve düşürülen iddialar kayıtlı) |

---

## 2. P0 — Kritik bulgular

### ~~W-01 · Website'de Türkçe karakter bozulması~~ — YANLIŞ ALARM (16 Eyl 2026 düzeltmesi)
- İlk gözlem PowerShell konsol çıktısındaki kodlama artefaktıydı. UTF-8 kanallarla doğrulandı: `Read` ile `indir.html`/`sss.html`/`js/main.js` temiz Türkçe (`İndir`, `Özellikler`, `Menüyü aç`); U+FFFD ve çift-kodlama (`Ã`/`Ä`/`Å`) taraması tüm `website/` altında **0 eşleşme**. Kod değişikliği gerekmez. Detay §7'ye taşındı.

### M-01 · Beğenilen şarkılar sabit (hardcoded) playlist ID'sine bağlı
- **Dosya:** `desktop/src/main/api/innertube.ts:734`
- **Kanıt:** `browse({ browseId: 'VLPLAKBLuBWqGYwwzJL5VdKOlpkUeMn0jKZ' })` — kullanıcıya özel olmayan sabit ID.
- **Etki:** "Beğenilen Şarkılar" sayfası (`app.ts:2153 loadLiked`) gerçek kullanıcının listesini değil, bu sabit listeyi gösterir (veya boş/hata döner).
- **Kök neden:** YouTube Music "beğenilenler" için genel kabul gören `browseId` (`FEmusic_liked_videos` türevleri) kullanılmamış; test artığı kalmış.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-1 M-01.

### W-01 · Website Türkçe karakter bozulması iddiası — YANLIŞ ALARM (düzeltme: 16 Eyl 2026)
- İlk gözlem (`bash` PowerShell çıktısında `��ndir`, `�-zellikler`, `MenǬyǬ a��`) **konsol kodlama artefaktıydı, dosya bozulması değil.**
- Doğrulama (UTF-8 kanallar): `Read` ile `indir.html` (`<title>İndir</title>`), `sss.html`, `js/main.js` (`'Menüyü aç'`) temiz; U+FFFD taraması + çift-kodlama (`Ã`/`Ä`/`Å`) taraması tüm `website/` (dist dahil) altında **0 eşleşme**.
- **Sonuç:** kod değişikliği gerekmez. W-01 P0 listesinden çıkarıldı; P0 sayısı 3 → 2.

### S-01 · Auth-client token'ları süresiz + renderer'a sızıyor
- **Dosyalar:** `desktop/src/main/providers/auth-provider.ts:1-16`, `desktop/src/main/main.ts:403`
- **Kanıt:**
  - `token: randomUUID()` üretiliyor ama **süre sonu yok**; `isValid()` sadece listede arıyor.
  - `ipcMain.handle('auth:clients', () => authProvider.listClients())` **token dahil** tüm nesneyi renderer'a veriyor (renderer sadece `appName`/`appId` gösteriyor, `app.ts:2506`).
  - Token'lar `electron-store`'da **düz metin** saklanıyor.
- **Etki:** çalınan/kopyalanan bir token süresiz geçerli; renderer belleğinde gereksiz gizli veri.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-1 S-01 (süre sonu + IPC redaksiyonu).

---

## 3. P1 — Yüksek bulgular

### M-02 · `yt:player` fire&forget + senkron fırlatma yakalanamıyor
- **Dosya:** `desktop/src/main/main.ts:187-204`
- **Kanıt:** `streamResolver.play(videoId).catch(...)` — `play()` içindeki senkron `throw` (örn. `ensureWindow` içinde `throw new Error('...destroyed')`, `stream-resolver.ts:259`) `.catch()`'e ulaşmaz; ayrıca `play()` kuyruğu hatayı yutup sadece logluyor (`stream-resolver.ts:479-484`).
- **Etki:** oynatma sessizce başlamaz, renderer `playing:true` gösterir (iyimser UI, `app.ts:1058-1073` kısmen telafi eder ama `res.playing` her zaman `true` döner).
- **Çözüm:** `COZUM-REHBERI.md` §Faz-1 M-02.

### M-03 · Google token refresh, env varsayılanını görmezden geliyor
- **Dosya:** `desktop/src/main/auth/google-oauth.ts:321-344`
- **Kanıt:** `refreshGoogleToken` `clientId/Secret`'i doğrudan `store.get('googleClientId')`'dan okuyor; oysa `getGoogleConfig()` (358-365) `process.env` yedeğini kullanıyor. Env ile paketlenmiş kurulumda refresh **boş kimlikle** sessizce başarısız olur (`catch {}`).
- **Yan not (zararsız ama kirli):** satır 324'teki `const config = this.store.get('googleTokens')` hiç kullanılmıyor (önceki raporda "kritik" denmişti; gerçek etkisi yok, sadece ölü değişken).
- **Çözüm:** `COZUM-REHBERI.md` §Faz-1 M-03.

### M-04 · `windowBounds` altyapısı ölü — pencere boyutu hatırlanmıyor
- **Dosya:** `desktop/src/main/utils/store.ts:111-117` (tanımlı), **kullanım: yok** (grep ile doğrulandı).
- **Kanıt:** `createWindow()` sabit `1280x820` açıyor (`main.ts:37-58`); `close/resize` olaylarında `saveWindowBounds` hiç çağrılmıyor.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 M-04.

### M-05 · Otomatik güncelleme fiilen kapalı
- **Dosya:** `desktop/src/main/main.ts:439-450`, `481-489`
- **Kanıt:** `auto:checkForUpdates` sabit `{ status: 'already_checking' }` dönüyor; açılış kontrolü `GH_TOKEN` veya `../release` klasörü yoksa atlanıyor (`console.log('[Auto] Update check disabled')`). Normal kullanıcıda ikisi de yok → **güncelleme hiç denetlenmiyor**. Arayüzde "güncellemeleri denetle" düğmesi de yok.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 M-05.

### R-01 · Sıra paneli `queueIndex` iddiası — YANLIŞ ALARM (düzeltme: 16 Eyl 2026)
- Yeniden izleme sonucu kod **doğru**: `rebuildMergedQueue()` (`app.ts:173-175`) her zaman `[...userQueue, ...contextQueue]` döndürdüğünden `userQueue`, birleşik kuyruğun öneki; tıklanan `idx` iki koordinatta da aynı. `splice` sonrası `queueIndex = idx - 1` (app.ts:1865) + `playSong`'daki `findIndex` (bulunamaz → koru) birleşimi "sonraki"yi kayan konuma doğru oturtuyor.
- **Sonuç:** kod değişikliği yapılmadı. P1 sayısı 7 → 6.

### M-06 · `getNext` ayrıştırıcısı + `getLyrics` kukla ID — API şekliyle uyumsuzluk riski
- **Dosya:** `desktop/src/main/api/innertube.ts:551-583`, `630-657`
- **Kanıt:**
  - `getNext`, `contents[].musicWatchNextResultsRenderer.results.results.contents` bekliyor; güncel `next` yanıtlarında kuyruk çoğu zaman `playlistPanelRenderer`/`musicQueueRenderer` altındadır → **boş `items`** döner; radyo/otomatik-devam (`app.ts:1381`, `639`, `895`) sessizce çalışmaz.
  - `getLyrics` içinde `lyricsBrowseId = 'UCB0oZn5mVBFj9Uwy91YB4FA'; // dummy` (satır 644) — gerçek endpoint bulunamadığında kukla ID ile `browse` çağrısı yapılır (gereksiz istek + log kirliliği).
- **Durum:** canlı API yanıtı olmadan %100 hüküm verilemez; bu yüzden P1 (doğrula-sonra-düzelt).
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 M-06 (yanıt dump ile doğrulama + toleranslı ayrıştırıcı).

### M-07 · Dış bağlantı allowlist'i `setWindowOpenHandler` tarafından baypas ediliyor
- **Dosya:** `desktop/src/main/main.ts:90-93` vs `281-291`
- **Kanıt:** `shell:openExternal` IPC'si allowlist denetliyor (`music.youtube.com`, `youtube.com`, `ytimg.com`, `github.com`, yalnızca `https:`) ama `setWindowOpenHandler` **her URL'yi** denetimsiz `shell.openExternal(url)` ile açıyor. Ayrıca allowlist'te `music.youtube.com` iki kez geçiyor (satır 285 fazlalığı).
- **Etki:** gizli oynatıcı sayfasındaki/oltalama amaçlı herhangi bir `window.open` dış tarayıcıda açılır.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-1 M-07.

---

## 4. P2 — Orta bulgular

### R-02 · Kart ızgaralarında `escapeHtml` atlanmış (kısmi XSS sertleştirme boşluğu)
- **Dosyalar:** `app.ts:1911-1914` (home kartları: `c.browseId`, `c.thumbnail`, `c.title`, `c.artist` çiğ), `app.ts:2082-2084` (`pl.thumbnail` çiğ), `app.ts:2097`, `app.ts:2112` (albüm/sanatçı `thumbnail` çiğ).
- **Kanıt:** arama sonuçları (`565-568`) ve `songRow` (`605-620`) düzgün escape'liyor; yukarıdaki dört blok escape'lemiyor.
- **Hafifletici:** renderer CSP'si `script-src 'self'` (`index.html:6`) → klasik inline-script XSS çalışmaz; ama attribute-kırma (`" onerror=...` — CSP yine engeller) ve HTML enjeksiyonu/biolzulma riski kalır. Bu yüzden P2.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 R-02.

### M-08 · BotServer (9863) kimlik doğrulamasız + `CORS: *`
- **Dosya:** `desktop/src/main/api/bot-server.ts:84-112`, `120`
- **Kanıt:** `127.0.0.1`'e bağlı (iyi), ama **token yok**, `Access-Control-Allow-Origin: *` var; `/api/v1/state` o anki şarkı + sözleri her yerel işleme/tarayıcı sekmesine açık.
- **Hafifletici:** yalnızca GET, yalnızca loopback. P2.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 M-08 (isteğe bağlı token + CORS sıkılaştırma).

### M-09 · Ana pencere `sandbox: false`
- **Dosya:** `desktop/src/main/main.ts:51-57` (gizli oynatıcı `sandbox: true` — `stream-resolver.ts:267-274`, tutarsız).
- **Kanıt:** `nodeIntegration:false`, `contextIsolation:true` (iyi) ama sandbox kapalı; preload yalnızca IPC köprüsü sunuyor, sandbox ile uyumlu.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-3 M-09 (deneysel etkinleştirme + regresyon testi).

### M-10 · ~100 boş `catch {}` + ~84 `console.*` — sessiz hatalar ve production log gürültüsü
- **Kanıt:** grep sayımları (M-10 detayı `COZUM-REHBERI.md` Ek-A'da). Çoğu `music-auth.ts` ve `stream-resolver.ts` içindeki gömülü JS tellallarında.
- **Etki:** hata ayıklama zorlaşıyor; kullanıcıdan log istendiğinde sinyal/gürültü oranı düşük.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-3 M-10 (merkezi logger + log seviyesi).

### M-11 · `StoreData` arayüzü eksik → `as any` yayılımı
- **Dosya:** `desktop/src/main/utils/store.ts:3-19`
- **Kanıt:** `customDiscordAppId`, `botServerEnabled`, `discordButtons`, `discordThumbnails`, `likedSongsDetails` arayüzde yok; `main.ts:372,378-380,424,468` ve `discord.ts:21,28` hep `as any` kullanıyor (`app.ts`'te 39 `as any`).
- **Etki:** typecheck geçiyor ama tip güvenliği fiilen baypas ediliyor; yanlış anahtar adı sessizce `undefined` döner.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 M-11.

### R-03 · Renderer 2679 satır tek IIFE — bakım borcu
- **Dosya:** `desktop/src/renderer/components/app.ts` (113 KB, `(() => { 'use strict'; ... })()`).
- **Etki:** arama/çalar/kuyruk/sözler/ayarlar aynı kapsamda; değişiklik riski yüksek, birim test yok.
- **Çözüm:** modüllere bölme yol haritası (`COZUM-REHBERI.md` §Faz-3 R-03). Davranış değişikliği gerektirmez, bu yüzden P2.

### M-12 · API istemci sürümü/UA çürümesi
- **Dosya:** `innertube.ts:16` (`clientVersion: 1.20241001.00.00`), `innertube.ts:124` (UA `Chrome/120`), `music-auth.ts:19` (UA `Chrome/126`), `stream-resolver.ts:415` (UA `Chrome/126`).
- **Etki:** üç farklı Chrome kimliği + eski istemci sürümü; YouTube tarafı eski istemcileri düşürdüğünde arama/oynatıcı/profil aynı anda bozulur ve suçlu zor bulunur.
- **Çözüm:** tek sabit dosyası (`COZUM-REHBERI.md` §Faz-2 M-12).

### G-01 · `website/dist/` git'te takip ediliyor (7 dosya)
- **Kanıt:** `git ls-files website/dist` 7 dosya listeliyor; `.gitignore` burayı kapsamıyor (oysa `desktop/dist` ve `desktop/release` ignore'lu).
- **Etki:** derleme çıktısı repoyu şişirir ve kaynakla `dist` arası fark (stale site) riski doğar.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-2 G-01.

### G-02 · Commitlenmemiş 10 dosyalık çalışma (kayıp/çatışma riski)
- **Kanıt:** `git status --short` → `bot-server.ts`, `innertube.ts`, `stream-resolver.ts`, `main.ts`, `preload.ts`, `lyrics-provider.ts`, `discord.ts`, `app.ts`, `index.html`, `main.css` (`M`).
- **Etki:** DOKUMANTASYON §9'daki düzeltmeler dahil değerli iş commitlenmeden duruyor.
- **Çözüm:** `COZUM-REHBERI.md` §Faz-0 (önce commit).

### M-13 · Profil çekmede 15 sn + 8 sn aktif bekleme
- **Dosya:** `desktop/src/main/auth/music-auth.ts:466`, `471`
- **Kanıt:** gizli pencerede avatar render'ı için `for(15)` + menü açılışı için `for(8)` saniyelik döngüler; ayrıca `importFromChrome` içinde 12 sn'lik döngü (`:251`).
- **Etki:** giriş aktarma akışı yavaş; `main.ts` açılışındaki `refreshProfileIfNeeded` (arka planda) ile birleşince ilk profil kartı geç gelir.
- **Çözüm:** `MutationObserver`/olay-tabanlı beklemeye geçiş (`COZUM-REHBERI.md` §Faz-3 M-13).

---

## 5. P3 — Düşük bulgular (kısa liste)

| ID | Konu | Dosya:satır |
|---|---|---|
| P3-01 | `VolumeRatioProvider.apply()` ölü kod (`__harmonicGain`'i hiçbir şey okumuyor); `setVolume`'daki `pow(eff,0.85)` eğrisi belgelenmemiş | `providers/volume-ratio.ts:8-11`, `stream-resolver.ts:615-622` |
| P3-02 | `cleanTitle` `ft./feat.` sonrasını agresif siliyor (öneri/söz eşleşmesini bozabilir) | `providers/lyrics-provider.ts:21-22` |
| P3-03 | LRCLIB'e 3 ardışık istek, timeout/`AbortController` yok | `providers/lyrics-provider.ts:32-67` |
| P3-04 | `jsx: react-jsx` ayarı ölü (React yok) | `desktop/tsconfig.json:16` |
| P3-05 | `// @ts-ignore` ile CDP importu (`@types/chrome-remote-interface` kurulmalı) | `auth/music-auth.ts:5-6` |
| P3-06 | Sürüm stringleri 4+ yerde sabit (`v1.0.1`): `renderer/index.html:416`, `bot-server.ts:46,106`, `main.ts:445`, LRCLIB UA'leri | — |
| P3-07 | Liste silmede native `confirm()` (UI'ı bloklar) | `app.ts:2449` |
| P3-08 | Discord OAuth başarı sayfasında isim sabit `'Discord'` (gerçek kullanıcı adı fetch'ten önce basılıyor) | `auth/discord-oauth.ts:186` |
| P3-09 | 800 ms `executeJavaScript` polling + 15 sn Discord durum poll'u (bilinçli tradeoff, belgeli) | `stream-resolver.ts:11`, `app.ts:2531` |
| P3-10 | Boş `harmonic-store-backup/` (ignore'lu, içerik yok) — kullanıcı verisi olabileceğinden **silinmedi**, sadece not | kök dizin |
| P3-11 | Repo link tutarsızlığı: README `harmonic-app/harmonic`, gerçek publish owner `mrcbrbn5361/harmonic` (`desktop/package.json:61-62`, `DOKUMANTASYON.md`) | `README.md:9-10,140,146-147` (sürüm stringleri bu raporda düzeltildi) |
| P3-12 | CI yok (`.github/` yok), test/lint scripti yok | kök + `desktop/package.json:11-21` |

---

## 6. DOKUMANTASYON §9 (10 maddelik patch log) doğrulama durumu

| # | Madde | Durum (16 Eyl 2026) |
|---|---|---|
| 1 | CORS OPTIONS `return` | ✅ Kodda mevcut (`bot-server.ts:90-94`) |
| 2 | `discord:setAppId` IPC | ✅ Mevcut (`main.ts:371-374`), ancak store'a **çift yazma** (`discord.ts:27-28`) ve `StoreData` eksikliği (M-11) sürüyor |
| 3 | `artwork`/`timeString` şema uyumu | ✅ Mevcut (`bot-server.ts:9-14`, `app.ts:1253-1270`) |
| 4 | `formatTime(0)` | ✅ Düzelmiş (`app.ts:126-132`) |
| 5 | Dinamik kullanıcı adı | ✅ (`app.ts:1163-1165`) |
| 6 | Öneri butonları | ✅ (`app.ts:1191-1226`) |
| 7 | Sözlerin BotServer'a akışı | ✅ (`app.ts:1082-1090`, `1723-1725`) |
| 8 | Discord 128/32 kırpma | ✅ (`discord.ts:97-135`) |
| 9 | Sürüm/menü kalıntıları | ✅ Kısmen — menü dinamik (`main.ts:144`) ama P3-06'daki sabit stringler duruyor |
| 10 | Reklam butonu kaldırma | ✅ Arayüzde buton yok; motor `stream-resolver.ts:305-344` + `app.ts:848-851` ile otomatik |

---

## 7. Önceki incelemedeki yanlış alarmlar (düzeltme kaydı)

Önceki otomatik incelemede geçen ancak **kodda doğrulanamayan** iddialar — tekrar iş yapılmaması için kayıt:

1. ~~"`escapeHtml` tanımsız (kritik)"~~ — **Yanlış.** `app.ts:122-124`'te tanımlı ve 37 noktada kullanılıyor. Gerçek boşluk yalnızca R-02'deki 4 kart bloğu.
2. ~~"CORS OPTIONS çökmesi sürüyor"~~ — **Yanlış.** `return` mevcut (`bot-server.ts:93`).
3. ~~"`formatTime(0)` bozuk"~~ — **Yanlış.** Düzeltilmiş (`app.ts:127`).
4. ~~"150+ `any`"~~ — **Abartılı.** `as any` sayısı `app.ts`'te 39; main genelinde ek ~15. Yine de borç (M-11), ama sayı düzeltildi.
5. ~~"`refreshGoogleToken` yanlış token okuyor (kritik)"~~ — **Yeniden sınıflandırıldı.** Satır 324 ölü değişken (etkisiz); gerçek bug M-03 (env fallback eksikliği).
6. ~~"`getNext` nested yapı kesin yanlış"~~ — **Kanıt yetersiz.** Şüpheli (M-06) ama canlı yanıt dump'ı olmadan hüküm verilemez.
7. ~~"Discord double-token exchange race (orta)"~~ — **Düşürüldü.** `callbackHandled` senkron guard (`discord-oauth.ts:119-120`) yarışı kapatıyor; kalan risk yalnızca kod tekrarı (bakım).
8. ~~"Website Türkçe karakter bozulması (P0)"~~ — **Yanlış.** Konsol kodlama artefaktıydı; dosyalar temiz UTF-8 (bk. §2 W-01 notu).
9. ~~"Sıra paneli queueIndex kayması (P1)"~~ — **Yanlış.** `userQueue` birleşik kuyruğun öneki olduğundan indisler çakışıyor; `idx - 1` mantığı doğru (bk. R-01 notu).

---

## 8. Ekler

- **Ek-A (grep sayımları):** boş `catch {}` ~100 eşleşme (`music-auth.ts` ~30, `stream-resolver.ts` ~35 gömülü-JS dahil), `console.*` 84, `innerHTML` 44 (ağırlık `app.ts`), `as any` ~55.
- **Ek-B (sürüm/envanter):** kök `1.0.1`, desktop `1.0.1`, website `1.0.1`, README bu raporla `1.0.1`'e eşitlendi; `release/` altında `1.0.0` + `1.0.1` exe/zip mevcut (yerel, ignore'lu).
- **Ek-C (typecheck):** `npm run typecheck --workspace=desktop` → hatasız (bu, `as any` baypasları nedeniyle "güvenli" anlamına gelmez — bk. M-11).
- **Ek-D (yerellik notu):** `DOKUMANTASYON.md` `.git/info/exclude` ile bilinçli olarak repo-dışı tutuluyor (yerel-only); bu raporun §10 eki de dolayısıyla yalnızca yerelde yaşar. `ANALIZ-RAPORU.md` ve `COZUM-REHBERI.md` ise untracked durumda — commit kararı kullanıcıya ait (bk. `COZUM-REHBERI.md` Faz-0).
