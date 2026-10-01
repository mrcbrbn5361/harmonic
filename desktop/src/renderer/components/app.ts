/* ============================================
   Harmonic - Desktop Music Client
   Main Renderer Script
   ============================================ */

import {
  type Song,
  type QueueItem,
  type QueueContext,
  type UserProfile,
  state,
  songRegistry,
  rebuildMergedQueue
} from './state';
import {
  fisherYatesShuffle as fisherYatesShuffleImpl,
  applyAddToQueue,
  applyPlayNext,
  applyClearUserQueue,
  applySetContext,
  getNextIndex,
  getPrevIndex
} from './queue';
import {
  applyPreparePlay,
  applyToggleShuffle,
  cycleRepeat,
  filterRadioItems,
  applyAppendRadioItems,
  decideTrackEnded
} from './player';
import {
  api,
  dlog,
  ytSearch,
  ytPlayer,
  ytHome,
  ytSuggestions,
  ytLyrics
} from './api-client';
import {
  escapeHtml,
  formatTime,
  parseLRC,
  sanitizeName,
  findActiveLyricIndex,
  resolveDisplayName,
  toHiResAvatar,
  getAvatarInitial,
  getUpcomingContext,
  type LyricLine
} from './views';
import {
  show,
  hide,
  toggle,
  showToast,
  confirmDialog,
  closePanels as closePanelsImpl
} from './ui-feedback';

  // ── Helpers (saf görünüm mantığı views.ts'tedir) ──
  const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
  const $$ = (sel: string) => document.querySelectorAll(sel);

  function FisherYatesShuffle(arr: number[]): number[] {
    return fisherYatesShuffleImpl(arr);
  }

  function addToQueue(song: Song): void {
    applyAddToQueue(state, song);
    showToast(`Sıraya eklendi: ${song.title}`, 'success');
  }

  function playNext(song: Song): void {
    applyPlayNext(state, song);
    showToast(`Önce çalınacak: ${song.title}`, 'success');
  }

  function clearUserQueue(): void {
    applyClearUserQueue(state);
    showToast('Sıra temizlendi', 'info');
  }

  function setContext(songs: Song[], name: string, type: QueueContext['type']): void {
    applySetContext(state, songs, name, type);
    const ctxEl = $('#playerContext');
    if (ctxEl) ctxEl.textContent = name || '';
  }

  // ── Paneller (kapatma çekirdeği ui-feedback.ts'tedir) ──
  function closePanels(): void {
    closePanelsImpl(state);
  }

  // ── Auth (sanitizeName views.ts'tedir) ──

  async function checkAuthState() {
    try {
      const loggedIn = await api.auth.isMusicAuthenticated();
      state.isLoggedIn = !!loggedIn;

      if (loggedIn) {
        state.user = await api.auth.getMusicUser();
        if (state.user && !sanitizeName(state.user.name)) {
          state.user.name = '';
        }
      } else {
        state.user = null;
      }
      updateAuthUI();
    } catch {
      state.isLoggedIn = false;
      state.user = null;
      updateAuthUI();
    }
  }

  function updateAuthUI() {
    const userSection = $('#userSection');
    const loginBtn = $('#btnAuthLogin');
    const userInfo = $('#userInfo');
    const userName = $('#userName');
    const userEmail = $('#userEmail');
    const userAvatar = $('#userAvatar');
    const avatarText = $('#avatarText');

    if (state.isLoggedIn && state.user) {
      if (userSection) userSection.classList.add('logged-in');
      if (loginBtn) loginBtn.style.display = 'none';
      if (userInfo) {
        userInfo.style.display = 'flex';
        const displayName = resolveDisplayName(state.user);
        if (userName) userName.textContent = displayName;
        if (userEmail) userEmail.textContent = state.user.email;
        if (userAvatar) {
          if (state.user.picture) {
            const hiRes = toHiResAvatar(state.user.picture);
            userAvatar.style.backgroundImage = `url("${hiRes}")`;
            userAvatar.style.backgroundSize = 'cover';
            userAvatar.style.backgroundPosition = 'center';
            userAvatar.style.backgroundColor = 'transparent';
            userAvatar.textContent = '';
            if (avatarText) avatarText.style.display = 'none';
          } else if (avatarText && state.user.name) {
            userAvatar.style.backgroundImage = 'none';
            avatarText.style.display = 'block';
            avatarText.textContent = getAvatarInitial(state.user.name);
          }
        }
      }
    } else {
      if (userSection) userSection.classList.remove('logged-in');
      if (loginBtn) loginBtn.style.display = 'flex';
      if (userInfo) userInfo.style.display = 'none';
    }
  }

  function setupAuth() {
    const loginBtn = $('#btnAuthLogin');
    const logoutBtn = $('#btnAuthLogout');
    const openLoginBtn = $('#btnOpenLogin');
    const startWelcomeBtn = $('#btnStartWelcome');

    async function doLoginMusic() {
      showToast('Chrome açılıyor... YouTube Music\'e giriş yapıp buraya dönün.', 'info');
      const opened = await api.auth.loginMusic();
      if (!opened?.opened) {
        showToast(`Chrome açılamadı: ${opened?.error || 'bilinmeyen hata'}`, 'error');
        return;
      }
      showChromeImportPrompt(opened);
    }

    // Her durumda listener ekle — updateAuthUI görünürlüğü yönetir
    if (loginBtn) loginBtn.addEventListener('click', doLoginMusic);
    if (openLoginBtn) openLoginBtn.addEventListener('click', doLoginMusic);
    if (startWelcomeBtn) startWelcomeBtn.addEventListener('click', doLoginMusic);

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await api.auth.logoutMusic().catch(()=>{});
        state.isLoggedIn = false;
        state.user = null;
        updateAuthUI();
        showToast('Çıkış yapıldı.', 'info');
      });
    }
  }

  function showChromeImportPrompt(opened: any) {
    const existing = document.getElementById('chromeImportModal');
    if (existing) existing.remove();
    const hasExt = !!opened?.externalFound;
    const modal = document.createElement('div');
    modal.id = 'chromeImportModal';
    modal.className = 'modal-overlay visible';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h3>${hasExt? 'Açık YouTube Music Hesabını Seç' : 'Harmonic Giriş Penceresi Açıldı'}</h3>
          <button class="icon-btn" id="closeChromeImport"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
          ${hasExt? `<div style="padding:10px;border-radius:8px;background:var(--c-bg-3);border:1px solid var(--c-border);margin-bottom:10px"><p style="margin:0;color:var(--c-text-1)"><strong>Zaten YouTube Music açık</strong>. Lütfen o tarayıcıda <strong>YouTube Music → sağ üst profil → Hesap değiştir</strong> ile istediğin hesaba geç, sonra buraya dönüp <strong>Girişi Aktar</strong>'a bas. Ayrı şifre ekranı açılmayacak.</p></div><p style="margin:0 0 8px;color:var(--c-text-2);font-size:12px">Not: İlk seferinde Harmonic giriş penceresi yerine mevcut Chrome'un kullanılacak, bu yüzden yeni şifre sormaz.</p>` : `<p style="margin:0 0 12px;color:var(--c-text-1);line-height:1.5">Ayrı bir <strong>YouTube Music giriş penceresi</strong> açıldı. Orada hesabınla giriş yap, ana sayfa yüklenince <strong>Girişi Aktar</strong>'a bas.</p>`}
          <div id="importStatus" style="padding:10px;border-radius:6px;background:var(--c-bg-2);font-size:13px;color:var(--c-text-2);min-height:18px">${hasExt?'Harici Chrome hesabı bekleniyor...':'Pencere açık, giriş bekleniyor...'}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelChromeImport">İptal</button>
          <button class="btn btn-primary" id="doChromeImport">${hasExt?'Seçili Hesapla Giriş Yap':'Girişi Aktar'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#closeChromeImport')?.addEventListener('click', close);
    modal.querySelector('#cancelChromeImport')?.addEventListener('click', close);

    modal.querySelector('#doChromeImport')?.addEventListener('click', async () => {
      const status = modal.querySelector('#importStatus') as HTMLElement;
      const btn = modal.querySelector('#doChromeImport') as HTMLButtonElement;
      btn.disabled = true; btn.textContent = 'Aktarılıyor...'; status.textContent = 'Hesap doğrulanıyor...';
      try {
        const r = await api.auth.importFromChrome();
        if (r?.success) {
          state.isLoggedIn = true; state.user = await api.auth.getMusicUser(); updateAuthUI();
          status.textContent = `${state.user?.name || 'Giriş'} olarak giriş yapıldı (${r.cookies} cookie)`;
          status.style.color = 'var(--c-success)';
          await checkAuthState(); updateAuthUI(); loadHome();
          setTimeout(close, 1500);
        } else { status.textContent = `Hata: ${r?.error || 'Pencerede giriş yapılmamış'}`; status.style.color = 'var(--c-error)'; btn.disabled=false; btn.textContent='Tekrar Dene'; }
      } catch(e:any){ status.textContent=`Hata: ${e?.message||String(e)}`; status.style.color='var(--c-error)'; btn.disabled=false; btn.textContent='Tekrar Dene'; }
    });
  }

  // ── Navigation ─────────────────────────────
  function navigateTo(page: string) {
    state.page = page;
    state.navGeneration++;
    $$('.nav-link').forEach((l) => {
      l.classList.toggle('active', (l as HTMLElement).dataset.page === page);
    });
    $$('.page').forEach((p) => {
      (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.page === page);
    });
    if (page === 'home') loadHome();
    if (page === 'library') loadLibrary();
    if (page === 'liked') loadLiked();
  }

  function setupNav() {
    $$('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = (link as HTMLElement).dataset.page;
        if (page) navigateTo(page);
      });
    });
  }

  // ── Search ─────────────────────────────────
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSearchQuery = '';

  function setupSearch() {
    const input = $('#searchInput') as HTMLInputElement;
    const clear = $('#searchClear');
    const dropdown = $('#suggestionsDropdown');

    input.addEventListener('input', () => {
      clear.classList.toggle('visible', input.value.length > 0);
      const query = input.value.trim();

      // Anlık arama - 1 karakterden itibaren
      if (query.length >= 1) {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          // Önce önerileri göster
          const suggestions = await ytSuggestions(query);
          if (suggestions.length && document.activeElement === input) {
            dropdown.innerHTML = suggestions.map((s: string) =>
              `<div class="suggestion-item" data-q="${escapeHtml(s)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>${escapeHtml(s)}</span>
              </div>`
            ).join('');
            show(dropdown);
            dropdown.querySelectorAll('.suggestion-item').forEach((item) => {
              item.addEventListener('click', () => {
                input.value = (item as HTMLElement).dataset.q || '';
                hide(dropdown);
                doSearch(input.value);
              });
            });
          }

          // Aynı zamanda doğrudan sonuçları da göster
          if (query.length >= 2) {
            lastSearchQuery = query;
            doSearch(query);
          }
        }, 200); // 200ms debounce
      } else {
        hide(dropdown);
        // Input temizlendiğinde sonuçları da temizle
        if (query.length === 0) {
          $('#searchResults').innerHTML = `
            <div class="empty-state">
              <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
              <p class="empty-text">Müzik aramaya başlayın</p>
              <p class="empty-hint-text">Sanatçı, şarkı veya albüm adı yazın</p>
            </div>`;
          lastSearchQuery = '';
        }
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        hide(dropdown);
        lastSearchQuery = '';
        doSearch(input.value);
      }
      if (e.key === 'Escape') {
        hide(dropdown);
        input.blur();
      }
    });

    input.addEventListener('focus', () => {
      const query = input.value.trim();
      if (query.length >= 1 && dropdown.children.length > 0) {
        show(dropdown);
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => hide(dropdown), 200);
    });

    clear.addEventListener('click', () => {
      input.value = '';
      clear.classList.remove('visible');
      lastSearchQuery = '';
      $('#searchResults').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
          <p class="empty-text">Müzik aramaya başlayın</p>
          <p class="empty-hint-text">Sanatçı, şarkı veya albüm adı yazın</p>
        </div>`;
      input.focus();
    });

    $$('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.searchFilter = (chip as HTMLElement).dataset.filter as any || 'all';
        lastSearchQuery = '';
        if (input.value) doSearch(input.value);
      });
    });
  }

  let activeSearchId = 0;

  async function doSearch(query: string) {
    if (!query.trim()) return;
    const searchId = ++activeSearchId;
    const container = $('#searchResults');
    container.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Aranıyor...</p></div>';

    try {
      dlog('doSearch:', query);
      const results = await ytSearch(query);
      if (searchId !== activeSearchId) return; // Eski istek, ezilmesin
      // Sonuçları cache'le (tıklama için)
      state.lastSearchResults = [
        ...(results.songs || []),
        ...(results.videos || [])
      ];

      if (!results.songs?.length && !results.videos?.length && !results.albums?.length) {
        container.innerHTML = '<div class="empty-state"><p class="empty-text">Sonuç bulunamadı</p></div>';
        return;
      }

      let html = '';
      const filter = state.searchFilter;

      // Şarkılar
      if (results.songs?.length && (filter === 'all' || filter === 'songs')) {
        html += `<div class="song-list">${results.songs.map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div>`;
      }

      // Videolar
      if (results.videos?.length && (filter === 'all' || filter === 'videos')) {
        html += `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">Videolar</h3><div class="song-list">${results.videos.map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div></div>`;
      }

      // Albümler
      if (results.albums?.length && (filter === 'all' || filter === 'albums')) {
        html += `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">Albümler</h3><div class="card-grid">${results.albums.map((a: any) => `
          <div class="card" data-browse="${escapeHtml(a.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(a.title)}</div>
            <div class="card-sub">${escapeHtml(a.artist || '')}</div>
          </div>`).join('')}</div></div>`;
      }

      // Sanatçılar
      if (results.artists?.length && (filter === 'all' || filter === 'artists')) {
        html += `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">Sanatçılar</h3><div class="card-grid">${results.artists.map((a: any) => `
          <div class="card" data-browse="${escapeHtml(a.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(a.name)}</div>
          </div>`).join('')}</div></div>`;
      }

      container.innerHTML = html || '<div class="empty-state"><p class="empty-text">Sonuç bulunamadı</p></div>';
      attachSongEvents(container, 'Arama Sonuçları', 'radio');

      // Albüm ve sanatçı kartlarına tıklama dinleyicisi ekle
      container.querySelectorAll('.card[data-browse]').forEach((card) => {
        card.addEventListener('click', () => {
          const browseId = (card as HTMLElement).dataset.browse;
          const title = (card as HTMLElement).querySelector('.card-title')?.textContent || '';
          const thumb = (card as HTMLElement).querySelector('img')?.src || '';
          if (browseId) openBrowse(browseId, title, thumb);
        });
      });
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p class="empty-text">Arama yapılırken bir hata oluştu</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
      container.querySelector('.btn-retry')?.addEventListener('click', () => doSearch(query));
    }
  }

  // ── Song Row HTML ──────────────────────────
  function songRow(song: Song, num?: number): string {
    if (song?.id) {
      songRegistry.set(song.id, song);
    }
    const isPlaying = state.currentSong?.id === song.id;
    const isLiked = state.liked.has(song.id);
    const subtitle = song.album ? `${escapeHtml(song.artist)} · ${escapeHtml(song.album)}` : escapeHtml(song.artist);
    return `
      <div class="song-row${isPlaying ? ' playing' : ''}" data-id="${escapeHtml(song.id)}">
        ${num != null ? `<span class="song-num">${num}</span>` : ''}
        <img class="song-thumb" src="${escapeHtml(song.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="song-meta">
          <div class="song-title">${escapeHtml(song.title)}</div>
          <div class="song-artist">${subtitle}</div>
        </div>
        <span class="song-dur">${formatTime(song.duration)}</span>
        <div class="song-actions">
          <button class="icon-btn like-btn${isLiked ? ' active' : ''}" data-id="${escapeHtml(song.id)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>
      </div>`;
  }

  function attachSongEvents(container: HTMLElement, contextName?: string, contextType?: QueueContext['type']) {
    container.querySelectorAll('.song-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.like-btn')) return;
        const id = (row as HTMLElement).dataset.id;
        const song = findSong(id);
        if (song) {
          // ARAMA VEYA ANA SAYFA ÖNERİLERİ KONTROLÜ:
          // Arama sonuçlarından veya ana sayfa önerilerinden bir şarkıya tıklandığında,
          // kullanıcının arayüz listesiyle sınırlı kalması engellenir. Parçaya özel kesintisiz radyo başlatılır.
          const isHomeOrSearch = contextType === 'radio' || !!container.closest('#searchResults') || !!container.closest('#homeContent') || state.page === 'search' || state.page === 'home';
          if (isHomeOrSearch) {
            setContext([song as QueueItem], `${song.title} Radyosu`, 'radio');
            state.queueIndex = state.userQueue.length;
            playSong(song);
            // Şarkıya ait radyo parçalarını arka planda çek ve kuyruğa ekle
            api.youtube.next(song.id).then((res: any) => {
              if (res?.items?.length && state.currentSong?.id === song.id) {
                const recs = res.items.filter((s: Song) => s.id !== song.id) as QueueItem[];
                recs.forEach((s) => songRegistry.set(s.id, s));
                state.contextQueue = [song as QueueItem, ...recs];
                state.queue = rebuildMergedQueue();
                if (state.panelOpen === 'queue') renderQueue();
                syncBotServerAndLivePreview(state.currentSong?.title, state.currentSong?.artist, state.currentSong?.thumbnail);
              }
            }).catch(() => {});
            return;
          }

          // Normal albüm / çalma listesi / kitaplık bağlamı
          const allRows = container.querySelectorAll('.song-row[data-id]');
          const contextSongs: QueueItem[] = [];
          let clickedIdx = 0;
          allRows.forEach((r) => {
            const s = findSong((r as HTMLElement).dataset.id);
            if (s) {
              if (s.id === id) clickedIdx = contextSongs.length;
              contextSongs.push(s as QueueItem);
            }
          });
          const cName = contextName || state.contextName || 'Liste';
          const cType = contextType || state.contextType || 'playlist';
          if (contextSongs.length) {
            const offset = state.userQueue.length;
            setContext(contextSongs, cName, cType);
            state.queueIndex = offset + clickedIdx;
          } else {
            const offset = state.userQueue.length;
            setContext([song as QueueItem], cName, cType);
            state.queueIndex = offset;
          }
          playSong(song);
        }
      });
      // Sağ tık menüsü
      row.addEventListener('contextmenu', (e) => {
        const me = e as MouseEvent;
        me.preventDefault();
        const id = (row as HTMLElement).dataset.id;
        const song = findSong(id);
        if (song) showContextMenu(me.clientX, me.clientY, song);
      });
    });
    container.querySelectorAll('.like-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike((btn as HTMLElement).dataset.id!);
      });
    });
  }

  function findSong(id: string | undefined): Song | QueueItem | undefined {
    if (!id) return undefined;
    if (state.currentSong?.id === id) return state.currentSong;
    if (songRegistry.has(id)) return songRegistry.get(id);
    const inQueue = state.queue.find((s) => s.id === id);
    if (inQueue) return inQueue;
    const inLiked = state.likedSongsMap[id];
    if (inLiked) return inLiked;
    return state.lastSearchResults.find((s) => s.id === id);
  }

  function updateVolumeSliderBg() {
    const volSlider = $('#volumeSlider') as HTMLInputElement | null;
    if (volSlider) {
      volSlider.value = String(state.volume);
      volSlider.style.setProperty('--vol-pct', `${state.volume}%`);
    }
    const volBtn = $('#btnVolume');
    if (volBtn) {
      if (state.volume === 0) {
        volBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
        volBtn.title = 'Sesi Aç (Mute)';
      } else if (state.volume < 50) {
        volBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        volBtn.title = 'Sesi Kapat';
      } else {
        volBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        volBtn.title = 'Sesi Kapat';
      }
    }
  }

  // ── Player (IPC tabanlı: ses gizli pencereden) ──
  function setupPlayer() {
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnNext').addEventListener('click', nextSong);
    $('#btnPrev').addEventListener('click', prevSong);
    $('#btnShuffle').addEventListener('click', toggleShuffle);
    $('#btnRepeat').addEventListener('click', toggleRepeat);
    $('#btnLike').addEventListener('click', () => {
      if (state.currentSong) toggleLike(state.currentSong.id);
    });

    // Scrubber
    const scrubber = $('#scrubber');
    let isDragging = false;

    function seekFromEvent(e: MouseEvent) {
      if (!state.duration) return;
      const rect = scrubber.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = pct * state.duration;
      api.player.seek(t).catch(() => {});
    }

    scrubber.addEventListener('click', (e) => {
      seekFromEvent(e);
    });

    // Hover tooltip: imleçteki zaman
    const scrubTooltip = $('#scrubberTooltip');
    scrubber.addEventListener('mousemove', (e) => {
      if (!state.duration) return;
      const rect = scrubber.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      scrubTooltip.textContent = formatTime(pct * state.duration);
      scrubTooltip.style.left = `${pct * 100}%`;
    });

    scrubber.addEventListener('mousedown', (e) => {
      isDragging = true;
      seekFromEvent(e);
      const onMove = (ev: MouseEvent) => {
        if (!isDragging || !state.duration) return;
        const rect = scrubber.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const t = pct * state.duration;
        // Update visual immediately during drag
        $('#scrubberFill').style.width = `${pct * 100}%`;
        $('#scrubberThumb').style.left = `${pct * 100}%`;
        $('#timeNow').textContent = formatTime(t);
      };
      const onUp = (ev: MouseEvent) => {
        isDragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (state.duration) {
          const rect = scrubber.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          api.player.seek(pct * state.duration).catch(() => {});
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Volume
    const volSlider = $('#volumeSlider') as HTMLInputElement;
    const btnVolume = $('#btnVolume');
    updateVolumeSliderBg();

    let volRaf: number | null = null;
    const applyVol = (vol: number) => {
      state.volume = Math.max(0, Math.min(100, Math.round(vol)));
      if (state.volume > 0) state.lastVolume = state.volume;
      if (volSlider) volSlider.value = String(state.volume);
      updateVolumeSliderBg();
      if (volRaf) cancelAnimationFrame(volRaf);
      volRaf = requestAnimationFrame(() => {
        api.player.setVolume(state.volume / 100).catch(() => {});
        api.store.set('volume', state.volume);
      });
    };

    volSlider.addEventListener('input', () => {
      applyVol(parseInt(volSlider.value) || 0);
    });

    // Volume button: mute toggle
    btnVolume.addEventListener('click', () => {
      if (state.volume > 0) {
        state.lastVolume = state.volume;
        applyVol(0);
      } else {
        applyVol(state.lastVolume || 80);
      }
    });

    // Fare tekerleğiyle ses ayarı (+%5 / -%5)
    const onVolWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      applyVol(state.volume + delta);
    };
    volSlider.addEventListener('wheel', onVolWheel, { passive: false });
    btnVolume.addEventListener('wheel', onVolWheel, { passive: false });

    // Volume çift-tık → %50
    volSlider.addEventListener('dblclick', () => {
      applyVol(50);
    });

    // state.volume 0-100 aralığında olmalı; initial setVolume
    api.player.setVolume(Math.max(0, Math.min(100, state.volume)) / 100).catch(() => {});

    // Gizli pencereden gelen metadata + playback state
    let _lastPollPlaying: boolean | null = null;
    let _pollCount = 0;
    // Parça-sonu tek seferlik tetikleme anahtarı + sonda donma sayacı + atlama anahtarı
    let _endedFor = '';
    let _endStallCount = 0;
    let _skipFor = '';
    api.player.onUpdate((u: any) => {
      // Reklam arka planda tamamen sessiz ve otomatik olarak anında geçilir — kullanıcı hiçbir reklam butonu görmez.
      if (u.isAd) {
        api.player.skipAd().catch(() => {});
        return;
      }
      const pollVid = u.videoId || '';
      const mine = state.currentSong?.id || '';
      const matchesMine = !pollVid || !mine || pollVid === mine;

      // 1. Anlık parça sonu (stream-resolver'dan gelen 'ended' bayrağı veya playerState === 0)
      if (mine && (u.ended || (u.playerState === 0 && (u.currentTime || 0) >= (u.duration || 0) - 2))) {
        const endKey = mine + '|' + Math.round(u.duration || 0);
        if (_endedFor !== endKey) {
          _endedFor = endKey;
          handleTrackEnded();
        }
        return;
      }

      // 2. Parça kimliği uyuşmuyorsa (arka planda YouTube Music autoplay ile sonrakine geçtiyse)
      if (!matchesMine) {
        // Eski istenen şarkının poll'ü veya yeni şarkı yükleme esnası ise yoksay (stale poll engeli)
        if (_prevRequestedId && pollVid === _prevRequestedId) return;
        if (Date.now() - lastPlayRequestAt < 6000) return;

        // Arka plandaki oynatıcı geçerli bir video ve başlığa sahipse
        if (pollVid && u.title) {
          // Kuyruğumuzda sonraki parça zaten bu mu?
          const nextInQ = state.queue[state.queueIndex + 1];
          if (nextInQ && nextInQ.id === pollVid) {
            state.queueIndex++;
            state.currentSong = nextInQ;
          } else if (state.queueIndex >= state.queue.length - 1) {
            // Kuyruk sonuna gelinmiş ve YTM yeni şarkı başlatmış: Akıllı Otomatik Adaptasyon
            const autoSong: QueueItem = {
              id: pollVid,
              title: u.title,
              artist: u.artist || '',
              artistId: '',
              thumbnail: u.thumbnail || `https://i.ytimg.com/vi/${pollVid}/hqdefault.jpg`,
              duration: u.duration || 0
            };
            songRegistry.set(pollVid, autoSong);
            state.contextQueue.push(autoSong);
            state.queue = rebuildMergedQueue();
            state.queueIndex = state.queue.length - 1;
            state.currentSong = autoSong;

            // Kuyruğu zenginleştirmek için radyo önerilerini arka planda çek
            api.youtube.next(pollVid).then((res: any) => {
              if (res?.items?.length && state.currentSong?.id === pollVid) {
                const recs = res.items.filter((s: Song) => s.id !== pollVid) as QueueItem[];
                recs.forEach((s) => songRegistry.set(s.id, s));
                state.contextQueue.push(...recs);
                state.queue = rebuildMergedQueue();
                if (state.panelOpen === 'queue') renderQueue();
                syncBotServerAndLivePreview(state.currentSong?.title, state.currentSong?.artist, state.currentSong?.thumbnail);
              }
            }).catch(() => {});
          } else {
            // Sıradaki şarkı bekleniyorken YTM başka parça bildirdiyse döngüye girmemek için bekle
            if (Date.now() - lastPlayRequestAt > 8000 && state.queue[state.queueIndex]) {
              playSong(state.queue[state.queueIndex]);
            }
            return;
          }

          // Yeni şarkı benimsendi: UI'ı ve sözleri hemen güncelle
          lastPlayRequestAt = Date.now();
          $('#playerTitle').textContent = state.currentSong.title;
          $('#playerArtist').textContent = state.currentSong.artist;
          $('#playerThumb').style.backgroundImage = `url(${state.currentSong.thumbnail})`;
          updateLikeBtn();
          updateMediaSessionMetadata();
          setDiscordActivity(state.currentSong.title, state.currentSong.artist, state.currentSong.thumbnail);
          syncBotServerAndLivePreview(state.currentSong.title, state.currentSong.artist, state.currentSong.thumbnail);

          // Şarkı sözlerini yeni parça için arka planda yükle
          (state as any).currentLyrics = null;
          ytLyrics(state.currentSong.id, state.currentSong.title, state.currentSong.artist, state.currentSong.duration).then((l) => {
            if (state.currentSong?.id === pollVid && l) {
              (state as any).currentLyrics = l;
              if ((api as any).botServer) {
                (api as any).botServer.updateState({ lyrics: l }).catch(() => {});
              }
              if (state.panelOpen === 'lyrics') renderLyricsContent(l);
            }
          }).catch(() => {});

          if (state.panelOpen === 'lyrics') loadLyrics();
          if (state.panelOpen === 'queue') renderQueue();
        } else {
          return;
        }
      }

      _mismatchVid = ''; _mismatchCount = 0;

      // Yedek parça sonu (sonda takılma kontrolü)
      if (mine && u.duration > 5) {
        const endKey = mine + '|' + Math.round(u.duration);
        if ((u.currentTime || 0) >= (u.duration || 0) - 0.3) {
          _endStallCount++;
          if (_endStallCount >= 2 && _endedFor !== endKey) {
            _endedFor = endKey;
            handleTrackEnded();
            return;
          }
        } else {
          _endStallCount = 0;
          if ((u.currentTime || 0) < (u.duration || 0) - 2) _endedFor = '';
        }
      } else {
        _endStallCount = 0;
      }
      // Açılamayan parça (Spotify: otomatik atla) — yavaş ağa tolerans için 12sn bekle
      if (mine && Date.now() - lastPlayRequestAt > 12000 && (!u.duration || !u.title)) {
        const skipKey = 'skip|' + mine;
        if (_skipFor !== skipKey) {
          _skipFor = skipKey;
          showToast('Şarkı açılamadı, sonrakine geçiliyor...', 'warning');
          nextSong();
        }
        return;
      }
      if (u.duration && u.title) _skipFor = '';
      // Metadata (eşleşen parça)
      if (u.title) $('#playerTitle').textContent = u.title;
      if (u.artist) $('#playerArtist').textContent = u.artist;
      if (u.thumbnail) $('#playerThumb').style.backgroundImage = `url(${u.thumbnail})`;
      // Süreler — paused iken bile ilk yükleme yapılsın
      if (u.currentTime != null) state.currentTime = u.currentTime || 0;
      if (u.duration != null) state.duration = u.duration || 0;
      if (state.duration) {
        if (!isDragging) {
          const pct = (state.currentTime / state.duration) * 100;
          $('#scrubberFill').style.width = `${pct}%`;
          $('#scrubberThumb').style.left = `${pct}%`;
          $('#timeNow').textContent = formatTime(state.currentTime);
          $('#timeEnd').textContent = formatTime(state.duration);
        }
        syncBotServerAndLivePreview(u.title, u.artist, u.thumbnail, u.album);
        syncActiveLyric(state.currentTime);
      }
      // Play/pause state
      const incomingPlaying = !u.paused && !u.isAd;
      if (state.playing !== incomingPlaying) {
        state.playing = incomingPlaying;
        state.paused = !incomingPlaying;
        updatePlayIcon();
      }
      // Discord: parça değişince güncelle (timer korunur), durunca temizle
      const trackKey = u.videoId || state.currentSong?.id || '';
      if (!state.playing) {
        if (lastDiscordKey) clearDiscordTrack();
      } else if (u.title && u.artist && trackKey) {
        if (trackKey !== lastDiscordKey) {
          updateDiscordForTrack(trackKey, u.title, u.artist, u.thumbnail, u.album || state.currentSong?.album);
        } else {
          maybeRefreshDiscord(trackKey, u.title, u.artist, u.thumbnail, u.album || state.currentSong?.album);
        }
      }
    });

    // Gizli oynatıcıdan gelen gerçek hatalar (yükleme/kuyruk) — sessiz kalma, toast göster
    api.player.onError((msg: string) => {
      dlog('Player hatası:', msg);
      state.playing = false;
      state.paused = true;
      updatePlayIcon();
      showToast(`Oynatma hatası: ${msg}`, 'error');
    });
  }

  async function playSong(song: Song) {
    if (!song || !song.id) {
      dlog('playSong: geçersiz şarkı nesnesi:', song);
      return;
    }
    dlog('playSong çağrıldı:', song.id, song.title);

    // İstek takibi (aynı şarkı tekrarında sıfırlama — retry sayacı korunur)
    const _prevId = state.currentSong?.id;
    if (song.id !== _prevId) {
      _navRetryId = '';
      _prevRequestedId = requestedId;
      requestedId = song.id;
    }

    // Queue index/history/recent — saf mantık player.ts'tedir
    applyPreparePlay(state, song);
    state.currentTime = 0;
    state.duration = song.duration || 0;
    lastPlayRequestAt = Date.now();

    // Update UI
    $('#playerTitle').textContent = song.title;
    $('#playerArtist').textContent = song.artist;
    $('#playerThumb').style.backgroundImage = `url(${song.thumbnail})`;
    updateLikeBtn();

    // Highlight in lists
    $$('.song-row').forEach((r) => {
      r.classList.toggle('playing', (r as HTMLElement).dataset.id === song.id);
    });
    // Sıra paneli açıksa yaklaşan listeyi tazele
    if (state.panelOpen === 'queue') renderQueue();

    if (!state.isLoggedIn) {
      dlog('Giriş yok, oynatılamıyor');
      showToast('Şarkı çalmak için önce giriş yapın (sol menüden Giriş Yap).', 'warning');
      return;
    }

    // IPC ile gizli pencerede oynat
    dlog('IPC player.play:', song.id);
    state.playing = true;
    state.paused = false;
    updatePlayIcon();
    const res: any = await ytPlayer(song.id);
    dlog('IPC player sonucu:', res);
    if (res?.error === 'not_authenticated') {
      showToast('Oturumunuz dolmuş. Tekrar giriş yapın.', 'warning');
      state.isLoggedIn = false;
      state.playing = false;
      updatePlayIcon();
      updateAuthUI();
    } else if (!res?.playing) {
      const detail = res?.error === 'player_unavailable'
        ? 'Oynatıcı hazır değil, uygulamayı yeniden başlatın.'
        : 'Bu şarkı şu anda çalınamıyor, başka bir şarkı deneyin.';
      showToast(detail, 'error');
      state.playing = false;
      updatePlayIcon();
    }

    // Discord Rich Presence
    setDiscordActivity(song.title, song.artist, song.thumbnail);

    // Media session metadata güncelle
    updateMediaSessionMetadata();

    // Şarkı sözlerini arka planda çekip bot server'a besle
    (state as any).currentLyrics = null;
    ytLyrics(song.id, song.title, song.artist, song.duration).then((l) => {
      if (state.currentSong?.id === song.id && l) {
        (state as any).currentLyrics = l;
        if ((api as any).botServer) {
          (api as any).botServer.updateState({ lyrics: l }).catch(() => {});
        }
      }
    }).catch(() => {});

    // Lyrics panel açıksa şarkı sözlerini yenile
    if (state.panelOpen === 'lyrics') {
      loadLyrics();
    }
  }

  // Metadata IPC'den geldiğinde otomatik çağrılır.
  // Aynı parça için tekrar çağrılmaz (timer sıfırlanmaz); pause/resume'da
  // konum senkronu korunur: startTimestamp = şimdi - konum.
  let lastDiscordKey = '';
  let lastDiscordSentAt = 0;
  // Kullanıcının en son parça açma zamanı — navigasyon bitene kadar stale poll'ler ekranı ezemez
  let lastPlayRequestAt = 0;
  // İstenen / bir önceki istenen parça (navigasyon takılması vs YTM autoplay ayrımı)
  let requestedId = '';
  let _prevRequestedId = '';
  let _navRetryId = '';
  // Eşleşmeyen parça poll takibi (navigasyon takılması / YTM autoplay ayrımı)
  let _mismatchVid = '';
  let _mismatchCount = 0;
  const DISCORD_REFRESH_MS = 30000;
  function updateDiscordForTrack(key: string, title: string, artist: string, coverUrl?: string, album?: string, force = false) {
    if (!key || !title) return;
    const now = Date.now();
    if (key === lastDiscordKey && !force) {
      // Aynı parça: 30sn'de bir progress tazele (rate limit: 5/dk altında)
      if (now - lastDiscordSentAt < DISCORD_REFRESH_MS) return;
    }
    lastDiscordKey = key;
    lastDiscordSentAt = now;
    const posMs = Math.max(0, Math.round((state.currentTime || 0) * 1000));
    const start = Date.now() - posMs;
    const payload: Record<string, unknown> = {
      details: title,
      state: artist || '',
      startTimestamp: start,
      // Spotify görünümü: küçük rozet = bizim logo, hover = Harmonic Music
      smallImageKey: 'logo',
      smallImageText: 'Harmonic Music'
    };
    if (state.duration > 0) payload.endTimestamp = start + Math.round(state.duration * 1000);
    if (coverUrl) payload.coverUrl = coverUrl;
    // ytmdesktop2: large_text her zaman album/title olmalı, yoksa hover eski kalıyor
    (payload as any).largeImageText = album || title;
    // YouTube Music'te Aç butonu
    if (key && key.length === 11) {
      (payload as any).buttons = [{ label: "YouTube Music'te Aç", url: `https://music.youtube.com/watch?v=${key}` }];
    }
    api.discord.setActivity(payload).catch((e: any) => dlog('Discord hatası:', String(e)));
    syncBotServerAndLivePreview(title, artist, coverUrl, album);
  }

  function syncBotServerAndLivePreview(title?: string, artist?: string, coverUrl?: string, album?: string) {
    // 1. Canlı Discord Embed Kart Önizlemesi
    const usernameEl = $('#previewUsername');
    const headerUserEl = document.querySelector('.discord-chat-header > span:first-child') as HTMLElement;
    const titleEl = $('#previewTrackTitle');
    const artistEl = $('#previewTrackArtist');
    const albumEl = $('#previewTrackAlbum');
    const thumbEl = $('#previewTrackThumb') as HTMLImageElement;
    const curTimeEl = $('#previewCurrentTime');
    const totTimeEl = $('#previewTotalTime');
    const barFillEl = $('#previewBarFill');
    const rec1El = $('#previewRec1');
    const rec2El = $('#previewRec2');
    const rec3El = $('#previewRec3');
    const btnRec1 = $('#previewBtnRec1');
    const btnRec2 = $('#previewBtnRec2');
    const btnRec3 = $('#previewBtnRec3');
    const btnLyrics = $('#previewBtnLyrics');

    const currentUserName = (state.user?.name || (state as any).discordUser?.username || 'Harmonic Dinleyicisi').trim();
    if (usernameEl) usernameEl.textContent = currentUserName;
    if (headerUserEl) headerUserEl.textContent = currentUserName;

    const displayTitle = title || state.currentSong?.title || 'Ağlama Yar';
    const displayArtist = artist || state.currentSong?.artist || 'Nurettin Rençber';
    const displayAlbum = album || state.currentSong?.album || 'Eski Yara';
    const displayCover = coverUrl || state.currentSong?.thumbnail || 'assets/icon.png';

    if (titleEl) titleEl.textContent = displayTitle;
    if (artistEl) artistEl.textContent = displayArtist;
    if (albumEl) albumEl.textContent = displayAlbum;
    if (thumbEl && displayCover) thumbEl.src = displayCover;

    // Sayı + formatlı alanlar tutarlı olmalı (canlı testte duration:0 / "04:47" çelişkisi yakalandı).
    const effDuration = state.duration > 0 ? state.duration : 287;
    const curFmt = formatTime(state.currentTime, true);
    const durFmt = formatTime(effDuration, true);

    if (curTimeEl) curTimeEl.textContent = curFmt;
    if (totTimeEl) totTimeEl.textContent = durFmt;
    if (barFillEl) {
      const pct = (state.duration > 0) ? Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100)) : 25;
      barFillEl.style.width = `${pct}%`;
    }

    const upcoming = state.queue.slice(state.queueIndex + 1, state.queueIndex + 4);
    if (rec1El) {
      if (upcoming[0]) {
        rec1El.textContent = `${upcoming[0].title} - ${upcoming[0].artist}`;
        if (btnRec1) {
          btnRec1.textContent = `1. ${upcoming[0].title} ↗`;
          btnRec1.style.display = 'inline-flex';
          btnRec1.onclick = () => playSong(upcoming[0]);
        }
      } else {
        rec1El.textContent = 'Sırada şarkı yok (Otomatik öneriler bekleniyor)';
        if (btnRec1) btnRec1.style.display = 'none';
      }
    }
    if (rec2El) {
      if (upcoming[1]) {
        rec2El.textContent = `${upcoming[1].title} - ${upcoming[1].artist}`;
        if (btnRec2) {
          btnRec2.textContent = `2. ${upcoming[1].title} ↗`;
          btnRec2.style.display = 'inline-flex';
          btnRec2.onclick = () => playSong(upcoming[1]);
        }
      } else {
        rec2El.textContent = '—';
        if (btnRec2) btnRec2.style.display = 'none';
      }
    }
    if (rec3El) {
      if (upcoming[2]) {
        rec3El.textContent = `${upcoming[2].title} - ${upcoming[2].artist}`;
        if (btnRec3) {
          btnRec3.textContent = `3. ${upcoming[2].title} ↗`;
          btnRec3.style.display = 'inline-flex';
          btnRec3.onclick = () => playSong(upcoming[2]);
        }
      } else {
        rec3El.textContent = '—';
        if (btnRec3) btnRec3.style.display = 'none';
      }
    }

    if (btnLyrics) {
      btnLyrics.onclick = () => {
        const lyricsPanel = $('#lyricsPanel');
        if (lyricsPanel) {
          if (state.panelOpen === 'lyrics') closePanels();
          else {
            closePanels();
            state.panelOpen = 'lyrics';
            show(lyricsPanel);
            loadLyrics();
          }
        }
      };
    }

    // 2. BotServer (Port 9863) State Güncelleme
    if ((api as any).botServer) {
      const recs = upcoming.map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        thumbnail: s.thumbnail,
        url: s.id ? `https://music.youtube.com/watch?v=${s.id}` : undefined
      }));

      (api as any).botServer.updateState({
        status: state.playing ? 'playing' : (state.paused ? 'paused' : 'stopped'),
        isPlaying: state.playing,
        track: {
          id: state.currentSong?.id,
          title: displayTitle,
          artist: displayArtist,
          album: displayAlbum,
          thumbnail: displayCover,
          artwork: displayCover,
          duration: effDuration,
          durationFormatted: durFmt,
          currentTime: state.currentTime,
          currentTimeFormatted: curFmt,
          timeString: `${curFmt} / ${durFmt}`,
          progress: effDuration > 0 ? (state.currentTime / effDuration) : 0,
          url: state.currentSong?.id ? `https://music.youtube.com/watch?v=${state.currentSong.id}` : undefined
        },
        recommendations: recs,
        lyrics: (state as any).currentLyrics || undefined
      }).catch(() => {});
    }
  }

  function clearDiscordTrack() {
    lastDiscordKey = '';
    lastDiscordSentAt = 0;
    api.discord.clearActivity().catch(() => {});
    if ((api as any).botServer) {
      (api as any).botServer.updateState({
        status: 'stopped',
        isPlaying: false,
        track: null
      }).catch(() => {});
    }
  }

  function maybeRefreshDiscord(key: string, title: string, artist: string, coverUrl?: string, album?: string) {
    if (!key || key !== lastDiscordKey || !state.playing) return;
    if (Date.now() - lastDiscordSentAt >= DISCORD_REFRESH_MS) {
      updateDiscordForTrack(key, title, artist, coverUrl, album, true);
    }
  }

  function setDiscordActivity(title: string, artist: string, coverUrl?: string) {
    const key = state.currentSong?.id || (title + '|' + artist);
    if (!title && !artist) {
      clearDiscordTrack();
      return;
    }
    updateDiscordForTrack(key, title || 'Çalıyor', artist, coverUrl);
  }

  function togglePlay() {
    if (state.playing) {
      api.player.pause().catch(() => {});
      state.playing = false;
      state.paused = true;
      state.lastPausedAt = Date.now();
      updatePlayIcon();
      // Discord'tan parçayı temizle - 100ms sonra tekrar kontrol et (poll loop'dan kaynaklı çakışma önleme)
      clearDiscordTrack();
      setTimeout(() => { if (!state.playing) clearDiscordTrack(); }, 100);
    } else {
      // Önce şarkı varsa resume et, yoksa sıradakini başlat
      if (state.currentSong) {
        api.player.resume().catch(() => {});
        state.playing = true;
        state.paused = false;
        updatePlayIcon();
        updateDiscordForTrack(state.currentSong.id, state.currentSong.title, state.currentSong.artist, state.currentSong.thumbnail);
      } else if (state.queue.length) {
        playSong(state.queue[state.queueIndex >= 0 ? state.queueIndex : 0]);
      }
    }
  }

  function nextSong() {
    if (!state.queue.length) return;

    const decision = getNextIndex(state);
    if (decision.kind === 'repeat-current') {
      playSong(state.queue[state.queueIndex >= 0 ? state.queueIndex : 0]);
      return;
    }
    if (decision.kind === 'play') {
      if (decision.shuffleOrder) state.shuffleOrder = decision.shuffleOrder;
      state.queueIndex = decision.index;
      playSong(state.queue[state.queueIndex]);
      // Kuyruk sonuna yaklaşıldıysa (kalan <= 2) arka planda radyo çekerek kuyruğu uzat
      if (!state.shuffle && state.queueIndex >= state.queue.length - 2 && state.currentSong) {
        preloadRadioQueue(state.currentSong);
      }
      return;
    }
    // decision.kind === 'radio' | 'stop'
    if (decision.kind === 'radio' && state.currentSong) {
      fetchRadioAndContinue(state.currentSong);
      return;
    }
    state.playing = false;
    updatePlayIcon();
    return;
  }

  async function fetchRadioAndContinue(song: Song) {
    try {
      const res = await api.youtube.next(song.id);
      if (res?.items?.length) {
        const nextItems = filterRadioItems(res.items, song.id);
        if (nextItems.length) {
          nextItems.forEach((s: Song) => songRegistry.set(s.id, s));
          applyAppendRadioItems(state, nextItems);
          const targetSong = nextItems[0];
          const nextIdx = state.queue.findIndex((s) => s.id === targetSong.id);
          if (nextIdx !== -1) {
            state.queueIndex = nextIdx;
            playSong(state.queue[state.queueIndex]);
            if (state.panelOpen === 'queue') renderQueue();
            return;
          }
        }
      }
    } catch {}
    state.playing = false;
    updatePlayIcon();
  }

  let _preloadingRadio = false;
  async function preloadRadioQueue(song: Song) {
    if (_preloadingRadio || !song?.id) return;
    _preloadingRadio = true;
    try {
      const res = await api.youtube.next(song.id);
      if (res?.items?.length) {
        const existingIds = new Set(state.queue.map(s => s.id));
        const newItems = filterRadioItems(res.items, song.id, existingIds);
        if (newItems.length) {
          newItems.forEach((s: Song) => songRegistry.set(s.id, s));
          applyAppendRadioItems(state, newItems);
          if (state.panelOpen === 'queue') renderQueue();
          syncBotServerAndLivePreview(state.currentSong?.title, state.currentSong?.artist, state.currentSong?.thumbnail);
        }
      }
    } catch {} finally {
      _preloadingRadio = false;
    }
  }

  function prevSong() {
    if (!state.queue.length) return;
    const decision = getPrevIndex(state, state.currentTime);
    if (decision.kind === 'noop') return;
    if (decision.kind === 'restart') {
      api.player.seek(0).catch(() => {});
      return;
    }
    if (decision.shuffleOrder) state.shuffleOrder = decision.shuffleOrder;
    state.queueIndex = decision.index;
    playSong(state.queue[state.queueIndex]);
  }

  // Parça bitti (Spotify: repeat-one → baştan çal, yoksa sıradakine geç)
  async function handleTrackEnded() {
    _mismatchVid = ''; _mismatchCount = 0;
    if (!state.currentSong) return;
    if (state.repeat === 'one') {
      playSong(state.currentSong);
      return;
    }
    const autoPlay = await api.store.get('autoPlay').catch(() => true);
    const decision = decideTrackEnded(state, autoPlay);
    if (decision === 'repeat-one') {
      playSong(state.currentSong);
      return;
    }
    if (decision === 'stop') {
      state.playing = false;
      updatePlayIcon();
      return;
    }
    nextSong();
  }

  function toggleShuffle() {
    applyToggleShuffle(state);
    $('#btnShuffle').classList.toggle('active', state.shuffle);
    api.store.set('shuffle', state.shuffle);
  }

  function toggleRepeat() {
    state.repeat = cycleRepeat(state.repeat);
    const btn = $('#btnRepeat');
    btn.classList.toggle('active', state.repeat !== 'off');
    api.store.set('repeat', state.repeat);
    if (state.repeat === 'one') {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-weight="bold">1</text></svg>';
    } else {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
    }
  }

function updatePlayIcon() {
    const playIcon = $('#btnPlay .icon-play') as HTMLElement;
    const pauseIcon = $('#btnPlay .icon-pause') as HTMLElement;
    const isPlaying = state.playing;
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }
  
  // ── Like ───────────────────────────────────
  function toggleLike(id: string) {
    const song = findSong(id) || (state.currentSong?.id === id ? state.currentSong : undefined);
    if (state.liked.has(id)) {
      state.liked.delete(id);
      delete state.likedSongsMap[id];
    } else {
      state.liked.add(id);
      if (song) {
        state.likedSongsMap[id] = song;
        songRegistry.set(id, song);
      }
    }
    saveLiked();
    updateLikeBtn();
    $$('.like-btn').forEach((btn) => {
      if ((btn as HTMLElement).dataset.id === id) {
        btn.classList.toggle('active', state.liked.has(id));
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', state.liked.has(id) ? 'currentColor' : 'none');
      }
    });
    if (state.page === 'liked') loadLiked();
  }

  function updateLikeBtn() {
    if (!state.currentSong) return;
    const btn = $('#btnLike');
    const liked = state.liked.has(state.currentSong.id);
    btn.classList.toggle('active', liked);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', liked ? 'currentColor' : 'none');
  }

  function saveLiked() {
    api.store.set('likedSongs', Array.from(state.liked));
    api.store.set('likedSongsDetails', state.likedSongsMap);
  }


  // ── Panels ─────────────────────────────────
  function setupPanels() {
    const lyricsPanel = $('#lyricsPanel');
    const queuePanel = $('#queuePanel');
    const backdrop = $('#panelBackdrop');

    $('#btnLyrics').addEventListener('click', () => {
      if (state.panelOpen === 'lyrics') { closePanels(); return; }
      closePanels();
      state.panelOpen = 'lyrics';
      show(lyricsPanel);
      show(backdrop);
      if (state.currentSong) loadLyrics();
    });

    $('#btnQueue').addEventListener('click', () => {
      if (state.panelOpen === 'queue') { closePanels(); return; }
      closePanels();
      state.panelOpen = 'queue';
      show(queuePanel);
      show(backdrop);
      renderQueue();
    });

    $('#closeLyrics').addEventListener('click', closePanels);
    $('#closeQueue').addEventListener('click', closePanels);
    backdrop.addEventListener('click', closePanels);
  }

  // ── Context Menu ────────────────────────────
  let activeContextMenu: HTMLElement | null = null;

  function showContextMenu(x: number, y: number, song: Song) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <div class="ctx-item" data-action="play">Şimdi Çal</div>
      <div class="ctx-item" data-action="playNext">Önce Çal</div>
      <div class="ctx-item" data-action="addToQueue">Sıraya Ekle</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="addToLiked">${state.liked.has(song.id) ? 'Beğeniyi Kaldır' : 'Beğeniye Ekle'}</div>
      <div class="ctx-item" data-action="addToPlaylist">Çalma Listesine Ekle...</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="copyLink">Bağlantıyı Kopyala</div>
    `;

    // Pozisyon ayarla
    menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 250)}px`;

    document.body.appendChild(menu);
    activeContextMenu = menu;

    menu.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).dataset.action;
      if (!action) return;
      switch (action) {
        case 'play':
          // Context olarak ayarla ve çal
          const parentList = (e.target as HTMLElement).closest('.song-list');
          if (parentList) {
            const allRows = parentList.querySelectorAll('.song-row[data-id]');
            const ctxSongs: QueueItem[] = [];
            let clickedIdx = 0;
            allRows.forEach((r) => {
              const s = findSong((r as HTMLElement).dataset.id);
              if (s) {
                if (s.id === song.id) clickedIdx = ctxSongs.length;
                ctxSongs.push(s as QueueItem);
              }
            });
            if (ctxSongs.length) setContext(ctxSongs, '', 'home');
          }
          state.queueIndex = state.queue.findIndex((s) => s.id === song.id);
          playSong(song);
          break;
        case 'playNext':
          playNext(song);
          break;
        case 'addToQueue':
          addToQueue(song);
          break;
        case 'addToLiked':
          toggleLike(song.id);
          break;
        case 'addToPlaylist':
          openAddToPlaylistModal(song);
          break;
        case 'copyLink':
          navigator.clipboard?.writeText(`https://music.youtube.com/watch?v=${song.id}`);
          showToast('Bağlantı kopyalandı', 'success');
          break;
      }
      closeContextMenu();
    });

    // Dışarı tıklayınca kapat
    setTimeout(() => {
      document.addEventListener('click', closeContextMenu, { once: true });
    }, 0);
  }

  function closeContextMenu() {
    if (activeContextMenu) {
      activeContextMenu.remove();
      activeContextMenu = null;
    }
  }

  async function openAddToPlaylistModal(song: Song) {
    const modal = $('#addToPlaylistModal');
    const listEl = $('#addToPlaylistList');
    const titleEl = $('#addToPlaylistModalTitle');
    const closeBtn = $('#closeAddToPlaylistModal');
    const cancelBtn = $('#cancelAddToPlaylist');
    const newBtn = $('#btnCreateAndAddPlaylist');

    if (!modal || !listEl) return;
    if (titleEl) titleEl.textContent = `"${song.title}" parçasını ekle`;

    const playlists: any[] = await api.store.get('playlists') || [];

    function renderList() {
      if (!playlists.length) {
        listEl.innerHTML = '<div class="empty-hint" style="padding:16px;text-align:center;color:var(--c-text-2)">Henüz bir çalma listesi oluşturmadınız.</div>';
        return;
      }
      listEl.innerHTML = playlists.map((pl) => {
        const hasSong = (pl.songs || []).some((s: any) => s.id === song.id);
        return `
          <button class="btn btn-ghost" data-pl-id="${escapeHtml(pl.id)}" style="width:100%;justify-content:space-between;padding:10px 12px;border-radius:8px;background:var(--c-bg-3);border:1px solid var(--c-border);cursor:pointer;display:flex;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;text-align:left;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <div>
                <div style="font-weight:600;font-size:13px;color:var(--c-text-0)">${escapeHtml(pl.name)}</div>
                <div style="font-size:11px;color:var(--c-text-2)">${(pl.songs || []).length} şarkı</div>
              </div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${hasSong ? 'var(--c-accent)' : 'var(--c-text-2)'}">${hasSong ? '✓ Eklendi' : '+ Ekle'}</span>
          </button>
        `;
      }).join('');

      listEl.querySelectorAll('[data-pl-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const plId = (btn as HTMLElement).dataset.plId;
          const targetPl = playlists.find((p) => p.id === plId);
          if (!targetPl) return;
          targetPl.songs = targetPl.songs || [];
          if (targetPl.songs.some((s: any) => s.id === song.id)) {
            showToast(`"${song.title}" bu listede zaten var`, 'info');
            return;
          }
          targetPl.songs.push(song);
          await api.store.set('playlists', playlists);
          showToast(`"${song.title}" -> "${targetPl.name}" listesine eklendi`, 'success');
          modal.classList.remove('visible');
          renderPlaylists();
          if (state.page === 'library') loadLibrary();
        });
      });
    }

    renderList();
    modal.classList.add('visible');

    const closeModal = () => modal.classList.remove('visible');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (newBtn) {
      newBtn.onclick = () => {
        closeModal();
        $('#btnNewPlaylist')?.click();
      };
    }
  }

  let currentParsedLyrics: LyricLine[] = [];
  let lastActiveLyricIdx = -1;

  async function loadLyrics() {
    if (!state.currentSong) return;
    const body = $('#lyricsBody');
    const song = state.currentSong;

    if ((state as any).currentLyrics) {
      renderLyricsContent((state as any).currentLyrics);
      return;
    }

    body.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Yükleniyor...</p></div>';
    try {
      const lyrics = await ytLyrics(song.id, song.title, song.artist, song.duration);
      if (state.currentSong?.id !== song.id) return; // Stale parça

      (state as any).currentLyrics = lyrics || null;
      if ((api as any).botServer) {
        (api as any).botServer.updateState({ lyrics: lyrics || undefined }).catch(() => {});
      }

      if (lyrics) {
        renderLyricsContent(lyrics);
      } else {
        currentParsedLyrics = [];
        body.innerHTML = '<div class="empty-state"><p class="empty-text">Şarkı sözleri bulunamadı</p><p class="empty-hint-text">Bu şarkı için henüz söz eklenmemiş</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
        body.querySelector('.btn-retry')?.addEventListener('click', () => {
          (state as any).currentLyrics = undefined;
          loadLyrics();
        });
      }
    } catch {
      currentParsedLyrics = [];
      body.innerHTML = '<div class="empty-state"><p class="empty-text">Sözler yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
      body.querySelector('.btn-retry')?.addEventListener('click', () => {
        (state as any).currentLyrics = undefined;
        loadLyrics();
      });
    }
  }

  function renderLyricsContent(lyrics: string) {
    const body = $('#lyricsBody');
    const parsed = parseLRC(lyrics);
    currentParsedLyrics = parsed;
    lastActiveLyricIdx = -1;

    if (parsed.length > 0) {
      body.innerHTML = parsed.map((item, idx) => `
        <div class="lyric-line synced" data-time="${item.time}" data-idx="${idx}">
          ${item.text ? escapeHtml(item.text) : '&nbsp;'}
        </div>
      `).join('');

      body.querySelectorAll('.lyric-line.synced').forEach((el) => {
        el.addEventListener('click', () => {
          const t = parseFloat((el as HTMLElement).dataset.time || '0');
          if (!isNaN(t)) api.player.seek(t).catch(() => {});
        });
      });
      syncActiveLyric(state.currentTime);
    } else {
      body.innerHTML = lyrics.split('\n').map((line: string) =>
        `<div class="lyric-line">${line ? escapeHtml(line) : '&nbsp;'}</div>`
      ).join('');
    }
  }

  function syncActiveLyric(curTime: number) {
    if (!currentParsedLyrics.length || state.panelOpen !== 'lyrics') return;
    const activeIdx = findActiveLyricIndex(currentParsedLyrics, curTime);

    if (activeIdx !== lastActiveLyricIdx) {
      lastActiveLyricIdx = activeIdx;
      const body = $('#lyricsBody');
      body.querySelectorAll('.lyric-line.synced').forEach((el, idx) => {
        el.classList.toggle('active', idx === activeIdx);
      });

      if (activeIdx >= 0) {
        const activeEl = body.querySelector(`.lyric-line.synced[data-idx="${activeIdx}"]`);
        activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Bot sunucusuna anlık satırı aktar
        if ((api as any).botServer && currentParsedLyrics[activeIdx]?.text) {
          (api as any).botServer.updateState({
            currentLyricLine: currentParsedLyrics[activeIdx].text
          }).catch(() => {});
        }
      }
    }
  }

  function renderQueue() {
    const body = $('#queueBody');
    if (!state.userQueue.length && !state.contextQueue.length) {
      body.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Sıra boş</p></div>';
      return;
    }

    let html = '';

    // Kullanıcının ekledikleri
    if (state.userQueue.length) {
      html += `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h4 style="font-size:13px;font-weight:600;color:var(--c-text-2)">Sıradaki Şarkılar</h4>
          <button class="icon-btn" id="clearUserQueue" style="font-size:11px;padding:4px 8px;background:var(--c-bg-3);border-radius:4px;color:var(--c-text-2);border:none;cursor:pointer">Temizle</button>
        </div>
        <div class="song-list">${state.userQueue.map((s, i) => `
          <div class="queue-item" data-type="user" data-idx="${i}">
            <img class="song-thumb" src="${escapeHtml(s.thumbnail)}" alt="" style="width:36px;height:36px" onerror="this.style.display='none'">
            <div class="song-meta">
              <div class="song-title">${escapeHtml(s.title)}</div>
              <div class="song-artist">${escapeHtml(s.artist)}</div>
            </div>
            <span class="song-dur">${formatTime(s.duration)}</span>
          </div>`).join('')}</div>
      </div>`;
    }

    // Bağlam şarkıları (çalma listesi/albumden gelen)
    if (state.contextQueue.length) {
      const contextLabel = state.contextName || 'Bağlam';
      const upcomingCtx = getUpcomingContext(state.contextQueue, state.currentSong?.id);
      if (upcomingCtx.length) {
        html += `<div>
          <h4 style="font-size:13px;font-weight:600;color:var(--c-text-2);margin-bottom:8px">${escapeHtml(contextLabel)}</h4>
          <div class="song-list">${upcomingCtx.map((s, i) => `
            <div class="queue-item" data-type="context" data-idx="${i}">
              <img class="song-thumb" src="${escapeHtml(s.thumbnail)}" alt="" style="width:36px;height:36px" onerror="this.style.display='none'">
              <div class="song-meta">
                <div class="song-title">${escapeHtml(s.title)}</div>
                <div class="song-artist">${escapeHtml(s.artist)}</div>
              </div>
              <span class="song-dur">${formatTime(s.duration)}</span>
            </div>`).join('')}</div>
        </div>`;
      }
    }

    body.innerHTML = html || '<div class="empty-state"><p class="empty-hint-text">Sıra boş</p></div>';

    // Clear user queue
    const clearBtn = body.querySelector('#clearUserQueue');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearUserQueue();
        renderQueue();
      });
    }

    // Queue item click
    body.querySelectorAll('.queue-item').forEach((item) => {
      item.addEventListener('click', () => {
        const type = (item as HTMLElement).dataset.type;
        const idx = parseInt((item as HTMLElement).dataset.idx!);
        if (type === 'user') {
          const song = state.userQueue[idx];
          if (song) {
            // Kullanıcı queue'sundan seçildi → tüket, sonraki kaldığı yerden devam etsin
            state.userQueue.splice(idx, 1);
            state.queue = rebuildMergedQueue();
            state.queueIndex = idx - 1;
            playSong(song);
          }
        } else if (type === 'context') {
          // idx dilimlenmiş upcomingCtx'e ait — tam dizinden değil dilimden oku
          const upcomingCtx = getUpcomingContext(state.contextQueue, state.currentSong?.id);
          const song = upcomingCtx[idx];
          if (song) {
            state.queueIndex = state.queue.findIndex((s) => s.id === song.id);
            playSong(song);
          }
        }
        renderQueue();
      });
    });
  }

  // ── Home ───────────────────────────────────
  async function loadHome() {
    const gen = state.navGeneration;
    const container = $('#homeContent');
    container.innerHTML = '<div class="skeleton-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';

    try {
    const data = await ytHome();
    if (gen !== state.navGeneration) return; // stale, discard
    console.log('[Harmonic] Home data:', JSON.stringify({ itemCount: data?.items?.length }));
    console.log('[Harmonic] Home first item:', data?.items?.[0] ? JSON.stringify(data.items[0]) : 'null');

    if (!data.items?.length) {
      container.innerHTML = '<div class="empty-state"><p class="empty-text">İçerik yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
      container.querySelector('.btn-retry')?.addEventListener('click', () => loadHome());
      return;
    }

    const songs = data.items.filter((i: any) => i.id) as Song[];
    const cards = data.items.filter((i: any) => i.browseId);

    console.log('[Harmonic] Songs:', songs.length, 'Cards:', cards.length);

    let html = '';

    if (cards.length) {
      html += `<div style="margin-bottom:32px">
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--c-text-0)">Keşfet</h2>
        <div class="card-grid">${cards.slice(0, 8).map((c: any) => `
          <div class="card" data-browse="${escapeHtml(c.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(c.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(c.title || c.name || '')}</div>
            <div class="card-sub">${escapeHtml(c.artist || '')}</div>
          </div>`).join('')}</div>
      </div>`;
    }

    if (songs.length) {
      html += `<div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--c-text-0)">Önerilen Şarkılar</h2>
        <div class="song-list">${songs.slice(0, 10).map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div>
      </div>`;
    }

    container.innerHTML = html || '<div class="empty-state"><p class="empty-text">İçerik bulunamadı</p></div>';

    // Set queue from songs — sadece şarkı çalmıyorsa VE kuyruk boşsa queue'yu güncelle
    if (songs.length && !state.currentSong && !state.queue.length) {
      setContext(songs.slice(0, 30), 'Önerilen Şarkılar', 'home');
    }

    attachSongEvents(container);

    // Kartlara tıklama → listenin içine gir
    container.querySelectorAll('.card[data-browse]').forEach((card) => {
      card.addEventListener('click', () => {
        const browseId = (card as HTMLElement).dataset.browse;
        const title = (card as HTMLElement).querySelector('.card-title')?.textContent || '';
        const thumb = (card as HTMLElement).querySelector('img')?.src || '';
        if (browseId) openBrowse(browseId, title, thumb);
      });
    });
    } catch (err) {
      console.error('[Harmonic] loadHome error:', err);
      container.innerHTML = '<div class="empty-state"><p class="empty-text">İçerik yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
      container.querySelector('.btn-retry')?.addEventListener('click', () => loadHome());
    }
  }

  async function openBrowse(browseId: string, fallbackTitle?: string, fallbackThumb?: string, onBack?: () => void) {
    const activePage = state.page;
    const targetContainer = activePage === 'search' ? $('#searchResults') : (activePage === 'library' ? $('#libraryContent') : $('#homeContent'));
    if (!targetContainer) return;

    targetContainer.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Yükleniyor...</p></div>';
    try {
      const browseData = await api.youtube.browse(browseId);
      const items: any[] = browseData.items || [];
      const songs = items.filter((i: any) => i.id) as Song[];
      const title = browseData.title || fallbackTitle || 'Liste';
      const thumb = fallbackThumb || '';

      let html = `<button id="btnBrowseBack" class="btn btn-ghost" style="margin-bottom:16px;display:flex;align-items:center;gap:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Geri
      </button>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
        ${thumb ? `<img src="${escapeHtml(thumb)}" style="width:96px;height:96px;border-radius:12px;object-fit:cover" onerror="this.style.display='none'">` : ''}
        <div>
          <h2 style="font-size:22px;font-weight:700;margin:0 0 4px">${escapeHtml(title)}</h2>
          <p style="margin:0;color:var(--c-text-2);font-size:13px">${songs.length ? `${songs.length} şarkı` : ''}</p>
        </div>
      </div>`;

      if (songs.length) {
        html += `<div class="song-list">${songs.map((s, i) => songRow(s, i + 1)).join('')}</div>`;
        setContext(songs, title, 'playlist');
      } else if (items.length) {
        const cards = items.filter((i: any) => i.browseId);
        html += `<div class="card-grid">${cards.map((c: any) => `
          <div class="card" data-browse="${escapeHtml(c.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(c.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(c.title || c.name || '')}</div>
            <div class="card-sub">${escapeHtml(c.artist || '')}</div>
          </div>`).join('')}</div>`;
      } else {
        html += `<div class="empty-state"><p class="empty-text">İçerik bulunamadı</p></div>`;
      }

      targetContainer.innerHTML = html;
      attachSongEvents(targetContainer, title, 'playlist');

      targetContainer.querySelector('#btnBrowseBack')?.addEventListener('click', () => {
        if (onBack) onBack();
        else if (activePage === 'search') {
          const q = ($('#searchInput') as HTMLInputElement)?.value;
          if (q) doSearch(q);
        } else if (activePage === 'library') {
          loadLibrary();
        } else {
          loadHome();
        }
      });

      // Alt kartlara tıklandığında kendi browseId'siyle açılsın (sonsuz döngü engellendi)
      targetContainer.querySelectorAll('.card[data-browse]').forEach((subCard) => {
        subCard.addEventListener('click', () => {
          const subId = (subCard as HTMLElement).dataset.browse;
          const subTitle = (subCard as HTMLElement).querySelector('.card-title')?.textContent || '';
          const subThumb = (subCard as HTMLElement).querySelector('img')?.src || '';
          if (subId) openBrowse(subId, subTitle, subThumb, () => openBrowse(browseId, title, thumb, onBack));
        });
      });
    } catch {
      targetContainer.innerHTML = '<div class="empty-state"><p class="empty-text">İçerik yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edip tekrar deneyin</p><div style="display:flex;gap:8px;margin-top:12px;justify-content:center"><button id="btnBrowseRetry" class="btn btn-secondary btn-retry">Tekrar Dene</button><button id="btnBrowseBack" class="btn btn-ghost">← Geri</button></div></div>';
      targetContainer.querySelector('#btnBrowseRetry')?.addEventListener('click', () => openBrowse(browseId, fallbackTitle, fallbackThumb, onBack));
      targetContainer.querySelector('#btnBrowseBack')?.addEventListener('click', () => {
        if (onBack) onBack();
        else loadHome();
      });
    }
  }

  // ── Library ────────────────────────────────
  async function loadLibrary() {
    const gen = state.navGeneration;
    const container = $('#libraryContent');
    container.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Yükleniyor...</p></div>';

    // Yerel olarak dinlenenler
    const localRecent = state.recentlyPlayed;

    // YouTube Music kütüphanesi (giriş yapıldıysa)
    let ytPlaylists: any[] = [];
    let ytArtists: any[] = [];
    let ytAlbums: any[] = [];

    let libraryLoadError = false;
    if (state.isLoggedIn) {
      try {
        [ytPlaylists, ytArtists, ytAlbums] = await Promise.all([
          api.youtube.libraryPlaylists().catch(() => { libraryLoadError = true; return []; }),
          api.youtube.libraryArtists().catch(() => { libraryLoadError = true; return []; }),
          api.youtube.libraryAlbums().catch(() => { libraryLoadError = true; return []; })
        ]);
      } catch {
        libraryLoadError = true;
      }
    }

    if (gen !== state.navGeneration) return; // stale, discard

    let html = '';
    const tab = state.libraryTab || 'recent';

    // 1. Son Çalınanlar
    if (tab === 'recent' || tab === 'songs') {
      if (localRecent.length) {
        html += `<div style="margin-bottom:24px">
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">${tab === 'recent' ? 'Son Çalınanlar' : 'Kütüphane Şarkıları'}</h3>
          <div class="song-list">${localRecent.slice(0, 30).map((s, i) => songRow(s, i + 1)).join('')}</div>
        </div>`;
      }
    }

    // 2. Çalma Listeleri
    if (tab === 'playlists') {
      const localPlaylists = await api.store.get('playlists') || [];
      if (localPlaylists.length) {
        html += `<div style="margin-bottom:24px">
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Özel Listelerim</h3>
          <div class="card-grid">${localPlaylists.map((pl: any) => `
            <div class="card" data-local-pl="${escapeHtml(pl.id)}" style="cursor:pointer">
              <div class="card-thumb" style="background:var(--c-bg-3);display:flex;align-items:center;justify-content:center;color:var(--c-accent)">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
              <div class="card-title">${escapeHtml(pl.name)}</div>
              <div class="card-sub">${(pl.songs || []).length} şarkı</div>
            </div>`).join('')}</div>
        </div>`;
      }

      if (ytPlaylists.length) {
        html += `<div style="margin-bottom:24px">
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">YouTube Music Listeleri</h3>
          <div class="card-grid">${ytPlaylists.map(pl => `
            <div class="card" data-browse="${escapeHtml(pl.browseId)}" style="cursor:pointer">
              <img class="card-thumb" src="${escapeHtml(pl.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
              <div class="card-title">${escapeHtml(pl.title)}</div>
            </div>`).join('')}</div>
        </div>`;
      }
    }

    // 3. Albümler
    if (tab === 'albums') {
      if (ytAlbums.length) {
        html += `<div style="margin-bottom:24px">
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Albümler</h3>
          <div class="card-grid">${ytAlbums.map(a => `
            <div class="card" data-browse="${escapeHtml(a.browseId)}" style="cursor:pointer">
              <img class="card-thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
              <div class="card-title">${escapeHtml(a.title)}</div>
              <div class="card-sub">${escapeHtml(a.artist || '')}</div>
            </div>`).join('')}</div>
        </div>`;
      }
    }

    // Sanatçılar (genel kütüphanede veya albümler/listeler yokken destekleyici)
    if (ytArtists.length && tab === 'albums') {
      html += `<div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Sanatçılar</h3>
        <div class="card-grid">${ytArtists.map(a => `
          <div class="card" data-browse="${escapeHtml(a.browseId)}" style="cursor:pointer">
            <img class="card-thumb" src="${escapeHtml(a.thumbnail)}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${escapeHtml(a.name)}</div>
          </div>`).join('')}</div>
      </div>`;
    }

    if (!html) {
      if (libraryLoadError && state.isLoggedIn) {
        container.innerHTML = '<div class="empty-state"><p class="empty-text">Kütüphane yüklenemedi</p><p class="empty-hint-text">YouTube Music verileri alınırken bir sorun oluştu</p><button class="btn btn-secondary btn-retry" style="margin-top:12px">Tekrar Dene</button></div>';
        container.querySelector('.btn-retry')?.addEventListener('click', () => loadLibrary());
        return;
      }
      container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><p class="empty-text">Bu sekmede henüz içerik yok</p><p class="empty-hint-text">Müzik dinledikçe veya listeler oluşturdukça burada görünecek</p></div>';
      return;
    }

    container.innerHTML = html;
    attachSongEvents(container);

    // Özel liste kartlarına tıklama
    container.querySelectorAll('.card[data-local-pl]').forEach((card) => {
      card.addEventListener('click', () => {
        const plId = (card as HTMLElement).dataset.localPl;
        if (plId) openLocalPlaylist(plId);
      });
    });

    // YouTube kartlarına tıklama
    container.querySelectorAll('.card[data-browse]').forEach((card) => {
      card.addEventListener('click', async () => {
        const browseId = (card as HTMLElement).dataset.browse;
        if (!browseId) return;
        try {
          const browseData = await api.youtube.browse(browseId);
          if (browseData.items?.length) {
            const songs = browseData.items.filter((i: any) => i.id) as Song[];
            if (songs.length) {
              setContext(songs, browseData.title || 'Kütüphane', 'playlist');
              state.queueIndex = 0;
              playSong(songs[0]);
            }
          }
        } catch {}
      });
    });
  }

  async function loadLiked() {
    const gen = state.navGeneration;
    const container = $('#likedContent');

    // Yerel beğenenler
    const localLikes = Array.from(state.liked);

    // YouTube Music beğenilenler (giriş yapıldıysa)
    let ytLiked: Song[] = [];
    if (state.isLoggedIn) {
      try {
        ytLiked = await api.youtube.likedSongs();
      } catch {}
    }

    if (gen !== state.navGeneration) return; // stale, discard

    let html = '';

    // YouTube Music beğenilenleri
    if (ytLiked.length) {
      html += `<div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">YouTube Music Beğenilenler</h3>
        <div class="song-list">${ytLiked.map((s, i) => songRow(s, i + 1)).join('')}</div>
      </div>`;
    }

    // Yerel beğenilenler
    if (localLikes.length) {
      const localSongs = localLikes.map(id => {
        return state.likedSongsMap[id] || songRegistry.get(id) || state.queue.find((s) => s.id === id) || state.recentlyPlayed.find((s) => s.id === id);
      }).filter(Boolean) as Song[];

      if (localSongs.length) {
        html += `<div>
          <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Yerel Beğeniler</h3>
          <div class="song-list">${localSongs.map((s, i) => songRow(s, i + 1)).join('')}</div>
        </div>`;
      }
    }

    if (!html) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div><p class="empty-text">Henüz beğeni yok</p><p class="empty-hint-text">Beğendiğiniz şarkılar burada görünecek</p></div>';
      return;
    }

    container.innerHTML = html;
    attachSongEvents(container, 'Beğenilen Şarkılar', 'playlist');
  }

  // ── Media Session (OS media controls) ──────
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => { if (!state.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (state.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextSong());
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      if (state.duration) api.player.seek(Math.max(0, state.currentTime - 10)).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      if (state.duration) api.player.seek(Math.min(state.duration, state.currentTime + 10)).catch(() => {});
    });
  }

  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !state.currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.currentSong.title,
      artist: state.currentSong.artist,
      artwork: state.currentSong.thumbnail ? [{ src: state.currentSong.thumbnail, sizes: '480x480', type: 'image/jpeg' }] : []
    });
  }

  // ── Keyboard Shortcuts ─────────────────────
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger if typing in input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey) {
            prevSong();
          } else if (state.duration) {
            const step = e.shiftKey ? 10 : 5;
            api.player.seek(Math.max(0, state.currentTime - step)).catch(() => {});
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey) {
            nextSong();
          } else if (state.duration) {
            const step = e.shiftKey ? 10 : 5;
            api.player.seek(Math.min(state.duration, state.currentTime + step)).catch(() => {});
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          state.volume = Math.min(100, state.volume + 5);
          if (state.volume > 0) state.lastVolume = state.volume;
          updateVolumeSliderBg();
          api.player.setVolume(state.volume / 100).catch(() => {});
          api.store.set('volume', state.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          state.volume = Math.max(0, state.volume - 5);
          if (state.volume > 0) state.lastVolume = state.volume;
          updateVolumeSliderBg();
          api.player.setVolume(state.volume / 100).catch(() => {});
          api.store.set('volume', state.volume);
          break;
        case 'KeyN':
          e.preventDefault();
          nextSong();
          break;
        case 'KeyP':
          e.preventDefault();
          prevSong();
          break;
        case 'KeyL':
          e.preventDefault();
          if (state.currentSong) toggleLike(state.currentSong.id);
          break;
        case 'KeyQ':
          e.preventDefault();
          $('#btnQueue')?.click();
          break;
        case 'KeyT':
          e.preventDefault();
          $('#btnLyrics')?.click();
          break;
        case 'KeyM':
          e.preventDefault();
          $('#btnVolume').click();
          break;
        case 'KeyS':
          e.preventDefault();
          toggleShuffle();
          break;
        case 'KeyR':
          e.preventDefault();
          toggleRepeat();
          break;
        case 'KeyF':
          e.preventDefault();
          api.window.maximize();
          break;
        case 'Escape':
          e.preventDefault();
          closePanels();
          closeContextMenu();
          $('#addToPlaylistModal')?.classList.remove('visible');
          $('#playlistModal')?.classList.remove('visible');
          $('#confirmModal')?.classList.remove('visible');
          document.getElementById('chromeImportModal')?.remove();
          break;
      }
    });
  }

  // ── Library Tabs ───────────────────────────
  function setupLibraryTabs() {
    const tabs = document.querySelectorAll('#libraryTabs .tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.libraryTab = (tab as HTMLElement).dataset.tab as any;
        loadLibrary();
      });
    });
  }

  // ── Window Controls ────────────────────────
  function setupWindowControls() {
    $('#tbMinimize').addEventListener('click', () => api.window.minimize());
    $('#tbMaximize').addEventListener('click', () => api.window.maximize());
    $('#tbClose').addEventListener('click', () => api.window.close());
  }

  // ── Playlists ──────────────────────────────
  function setupPlaylists() {
    const modal = $('#playlistModal');
    const input = $('#playlistNameInput') as HTMLInputElement;

    $('#btnNewPlaylist').addEventListener('click', () => {
      input.value = '';
      modal.classList.add('visible');
      setTimeout(() => input.focus(), 100);
    });

    $('#closePlaylistModal').addEventListener('click', () => modal.classList.remove('visible'));
    $('#cancelPlaylist').addEventListener('click', () => modal.classList.remove('visible'));

    $('#createPlaylist').addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) return;
      const playlists = await api.store.get('playlists') || [];
      playlists.push({ id: `pl_${Date.now()}`, name, songs: [], createdAt: Date.now() });
      await api.store.set('playlists', playlists);
      modal.classList.remove('visible');
      renderPlaylists();
    });

    renderPlaylists();
  }

  async function renderPlaylists() {
    const container = $('#playlistsContainer');
    const playlists = await api.store.get('playlists') || [];
    if (!playlists.length) {
      container.innerHTML = '<div class="empty-hint">Henüz liste yok</div>';
      return;
    }
    container.innerHTML = playlists.map((pl: any) => `
      <a class="nav-link" href="#" data-pl="${escapeHtml(pl.id)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>${escapeHtml(pl.name)}</span>
      </a>
    `).join('');

    container.querySelectorAll('.nav-link[data-pl]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const plId = (link as HTMLElement).dataset.pl;
        if (plId) openLocalPlaylist(plId);
      });
    });
  }

  async function openLocalPlaylist(plId: string) {
    const playlists = await api.store.get('playlists') || [];
    const pl = playlists.find((p: any) => p.id === plId);
    if (!pl) return;

    state.page = 'library';
    state.libraryTab = 'playlists';
    $$('.nav-link').forEach((l) => {
      l.classList.toggle('active', (l as HTMLElement).dataset.page === 'library');
    });
    $$('.page').forEach((p) => {
      (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.page === 'library');
    });
    $$('#libraryTabs .tab').forEach((t) => {
      t.classList.toggle('active', (t as HTMLElement).dataset.tab === 'playlists');
    });

    const container = $('#libraryContent');
    const songs: Song[] = pl.songs || [];

    let html = `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="font-size:22px;font-weight:700;color:var(--c-text-0);margin:0 0 4px">${escapeHtml(pl.name)}</h2>
            <p style="margin:0;color:var(--c-text-2);font-size:13px">${songs.length} şarkı • Özel Çalma Listesi</p>
          </div>
          <div style="display:flex;gap:8px">
            ${songs.length ? `<button class="btn btn-primary" id="btnPlayPlaylist" style="display:flex;align-items:center;gap:6px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Çal
            </button>` : ''}
            <button class="btn btn-ghost" id="btnDeletePlaylist" style="color:var(--c-error)">Listeyi Sil</button>
          </div>
        </div>
    `;

    if (songs.length) {
      html += `<div class="song-list">${songs.map((s, i) => songRow(s, i + 1)).join('')}</div></div>`;
    } else {
      html += `
        <div class="empty-state">
          <p class="empty-text">Bu listede henüz şarkı yok</p>
          <p class="empty-hint-text">Şarkılara sağ tıklayıp "Çalma Listesine Ekle..." seçeneğiyle ekleyebilirsiniz.</p>
        </div></div>`;
    }

    container.innerHTML = html;
    attachSongEvents(container);

    container.querySelector('#btnPlayPlaylist')?.addEventListener('click', () => {
      if (songs.length) {
        setContext(songs, pl.name, 'playlist');
        state.queueIndex = 0;
        playSong(songs[0]);
      }
    });

    container.querySelector('#btnDeletePlaylist')?.addEventListener('click', async () => {
      const ok = await confirmDialog('Listeyi Sil', `"${pl.name}" listesini silmek istediğinize emin misiniz?`);
      if (ok) {
        const updated = playlists.filter((p: any) => p.id !== plId);
        await api.store.set('playlists', updated);
        showToast(`"${pl.name}" listesi silindi`, 'info');
        renderPlaylists();
        loadLibrary();
      }
    });
  }

  // ── Settings ───────────────────────────────
  function setupSettings() {
    const themeSelect = $('#settingTheme') as HTMLSelectElement;
    const qualitySelect = $('#settingQuality') as HTMLSelectElement;
    const autoPlay = $('#settingAutoPlay') as HTMLInputElement;

    api.store.get('theme').then((t: string) => {
      themeSelect.value = t || 'dark';
      applyTheme(t || 'dark');
    });
    api.store.get('quality').then((q: string) => { qualitySelect.value = q || 'high'; });
    api.store.get('autoPlay').then((v: boolean) => { autoPlay.checked = v !== false; });

    themeSelect.addEventListener('change', () => {
      api.store.set('theme', themeSelect.value);
      applyTheme(themeSelect.value);
    });
    qualitySelect.addEventListener('change', () => api.store.set('quality', qualitySelect.value));
    autoPlay.addEventListener('change', () => api.store.set('autoPlay', autoPlay.checked));

    // Sürüm rozeti (paket sürümünden — sabit string yok)
    (api as any).app?.getVersion?.().then((v: string) => {
      const el = $('#appVersion');
      if (el && v) el.textContent = `v${v}`;
    }).catch(() => {});

    // Güncelleme denetimi (M-05)
    const btnUpdates = $('#btnCheckUpdates') as HTMLButtonElement | null;
    const updateStatus = $('#updateStatus');
    btnUpdates?.addEventListener('click', async () => {
      if (updateStatus) updateStatus.textContent = 'Denetleniyor...';
      if (btnUpdates) btnUpdates.disabled = true;
      try {
        const r: any = await (api as any).auto?.checkForUpdates?.();
        if (!r) {
          if (updateStatus) updateStatus.textContent = 'Denetim desteklenmiyor';
        } else if (r.status === 'available') {
          if (updateStatus) updateStatus.textContent = `Yeni sürüm mevcut: v${r.version}`;
          showToast(`Yeni sürüm mevcut: v${r.version}`, 'info');
        } else if (r.status === 'up-to-date') {
          if (updateStatus) updateStatus.textContent = 'Uygulama güncel';
        } else {
          if (updateStatus) updateStatus.textContent = `Denetim başarısız: ${r.message || 'bilinmeyen hata'}`;
        }
      } catch (e: any) {
        if (updateStatus) updateStatus.textContent = 'Denetim başarısız';
      } finally {
        if (btnUpdates) btnUpdates.disabled = false;
      }
    });

    // OAuth settings
    setupOAuthSettings();
  }

  function applyTheme(theme: string) {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  async function setupOAuthSettings() {
    // OAuth bilgileri uygulamaya gömülü — giriş alanı yok, durum sabit.
    try {
      const googleConfig = await api.auth.getGoogleConfig();
      const el = document.getElementById('googleOAuthStatus');
      if (el) el.textContent = (googleConfig.clientId ? '✓ Yapılandırıldı' : 'Yapılandırılamadı');
    } catch {}
  }

  function setupVolumeLyricsAuthUI(){
    const vr=(document.getElementById('volumeRatioEnabled') as HTMLInputElement); const ly=(document.getElementById('lyricsEnabled') as HTMLInputElement);
    if(vr){ (api as any).volumeRatio.isEnabled().then((v:boolean)=>vr.checked=!!v); vr.addEventListener('change',()=> (api as any).volumeRatio.setEnabled(vr.checked)); }
    if(ly){ (api as any).lyrics.isEnabled().then((v:boolean)=>ly.checked=v!==false); ly.addEventListener('change',()=> (api as any).lyrics.setEnabled(ly.checked)); }
    const listEl=document.getElementById('authClientsList'); const aId=document.getElementById('authAppId') as HTMLInputElement; const aName=document.getElementById('authAppName') as HTMLInputElement; const btn=document.getElementById('authCreateBtn');
    async function refresh(){ if(!listEl) return; const cs:any[]=await (api as any).authClients.list(); listEl.innerHTML= cs.length? cs.map(c=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--c-border)"><span>${escapeHtml(c.appName)} (${escapeHtml(c.appId)})</span><button data-revoke="${escapeHtml(c.appId)}" style="color:var(--c-error)">Sil</button></div>`).join('') : '<em>Henüz bağlı uygulama yok</em>'; listEl.querySelectorAll('[data-revoke]').forEach(b=> b.addEventListener('click', async()=>{ await (api as any).authClients.revoke((b as HTMLElement).dataset.revoke!); refresh(); })); }
    refresh(); btn?.addEventListener('click', async()=>{ if(!aId.value||!aName.value) return showToast('appId ve ad gerekli','warning'); await (api as any).authClients.create({appId:aId.value, appName:aName.value}); aId.value=''; aName.value=''; refresh(); showToast('İstemci eklendi','success'); });
  }
  function setupDiscord() {
    const enabledToggle = $('#discordEnabled') as HTMLInputElement;
    const buttonsToggle = $('#discordButtons') as HTMLInputElement;
    const thumbsToggle = $('#discordThumbnails') as HTMLInputElement;
    const statusEl = $('#discordConnectionStatus');

    // ytmdesktop2 referans: discord.enabled / buttons / thumbnails
    api.store.get('discordEnabled').then((v: any) => { if (v !== undefined) enabledToggle.checked = !!v; });
    api.store.get('discordButtons').then((v: any) => { if (v !== undefined) buttonsToggle.checked = !!v; });
    api.store.get('discordThumbnails').then((v: any) => { if (v !== undefined) thumbsToggle.checked = !!v; });
    enabledToggle.addEventListener('change', () => { api.store.set('discordEnabled', enabledToggle.checked); if (!enabledToggle.checked) { api.discord.clearActivity().catch(()=>{}); statusEl.textContent = 'Kapalı'; } else { refreshDiscordStatus(); } });
    buttonsToggle.addEventListener('change', () => api.store.set('discordButtons', buttonsToggle.checked));
    thumbsToggle.addEventListener('change', () => api.store.set('discordThumbnails', thumbsToggle.checked));

    // RPC durumu (tokensuz — Discord masaüstü uygulaması gerekli)
    async function refreshDiscordStatus() {
      try {
        const ok = await api.discord.isReady();
        statusEl.textContent = ok ? '✓ Bağlı (RPC)' : 'Discord uygulaması bekleniyor...';
      } catch { statusEl.textContent = '—'; }
    }
    refreshDiscordStatus();
    setInterval(() => { if (enabledToggle.checked) refreshDiscordStatus(); }, 15000);

    // Discord hesabı (resmi OAuth2 — token yapıştırma yok)
    const accName = $('#discordAccountName');
    const accAvatar = $('#discordAvatar') as HTMLImageElement;
    const loginBtn = $('#btnDiscordLogin');
    const logoutBtn = $('#btnDiscordLogout');
    async function refreshDiscordAccount() {
      try {
        const u: any = await (api as any).discordAuth.getUser();
        if (u) {
          if (accName) accName.textContent = u.name || u.username || 'Bağlı';
          if (u.picture) { accAvatar.src = u.picture; accAvatar.style.display = 'block'; }
          else accAvatar.style.display = 'none';
          loginBtn.style.display = 'none';
          logoutBtn.style.display = 'flex';
        } else {
          if (accName) accName.textContent = 'Bağlı değil';
          accAvatar.style.display = 'none';
          loginBtn.style.display = 'flex';
          logoutBtn.style.display = 'none';
        }
      } catch { if (accName) accName.textContent = 'Bağlı değil'; }
    }
    refreshDiscordAccount();
    loginBtn.addEventListener('click', async () => {
      const r: any = await (api as any).discordAuth.login().catch((e: any) => ({ success: false, error: String(e?.message || e) }));
      if (r?.success) {
        showToast('Discord girişi başarılı.', 'success');
        refreshDiscordAccount();
      } else {
        showToast(r?.error || 'Discord girişi başarısız.', 'error');
      }
    });
    logoutBtn.addEventListener('click', async () => {
      await (api as any).discordAuth.logout().catch(() => {});
      refreshDiscordAccount();
      showToast('Discord çıkışı yapıldı.', 'info');
    });

    // Bot Server (Port 9863) Ayarı (v1.0.1)
    const botServerToggle = $('#botServerEnabled') as HTMLInputElement;
    const botServerStatus = $('#botServerStatus');
    if (botServerToggle && (api as any).botServer) {
      api.store.get('botServerEnabled').then((v: any) => {
        botServerToggle.checked = v === true;
        if (botServerStatus) {
          botServerStatus.textContent = v === true ? '✓ Aktif (Port 9863)' : 'Kapalı';
        }
      });
      botServerToggle.addEventListener('change', async () => {
        const active = await (api as any).botServer.toggle(botServerToggle.checked);
        if (botServerStatus) {
          botServerStatus.textContent = active ? '✓ Aktif (Port 9863)' : 'Kapalı';
        }
      });
    }

    // Token koruması (v1.0.1 + M-08): açıkken /api/v1/state Bearer token ister
    const botAuthToggle = $('#botServerAuth') as HTMLInputElement;
    const botTokenInput = $('#botServerToken') as HTMLInputElement;
    const btnRegen = $('#btnRegenToken');
    const btnCopy = $('#btnCopyToken');
    if (botAuthToggle && (api as any).botServer?.getAuth) {
      (api as any).botServer.getAuth().then((a: any) => {
        if (!a) return;
        botAuthToggle.checked = !!a.enabled;
        if (botTokenInput && a.token) botTokenInput.value = a.token;
      }).catch(() => {});
      botAuthToggle.addEventListener('change', async () => {
        const desired = botAuthToggle.checked;
        const a = await (api as any).botServer.setAuthEnabled(desired).catch(() => null);
        if (a) {
          botAuthToggle.checked = !!a.enabled;
          if (botTokenInput) botTokenInput.value = a.token || '';
          if (desired !== !!a.enabled) {
            showToast('İşlem iptal edildi.', 'info');
            return;
          }
        }
        showToast(a?.enabled ? 'Token koruması açıldı.' : 'Token koruması kapatıldı (açık mod).', a?.enabled ? 'info' : 'warning');
      });
      btnRegen?.addEventListener('click', async () => {
        const res = await (api as any).botServer.regenerateToken().catch(() => null);
        const t = res?.token || (typeof res === 'string' ? res : '');
        if (t && botTokenInput) {
          botTokenInput.value = t;
        }
        showToast('Yeni token üretildi ve panoya kopyalandı.', 'success');
      });
      btnCopy?.addEventListener('click', async () => {
        try {
          if (typeof (api as any).botServer?.copyToken === 'function') {
            await (api as any).botServer.copyToken();
            showToast('Bot token panoya kopyalandı.', 'success');
          }
        } catch {
          showToast('Token panoya kopyalanamadı.', 'error');
        }
      });
    }

    // Özel Discord Application ID
    const customAppIdInput = $('#customDiscordAppId') as HTMLInputElement;
    const btnSaveAppId = $('#btnSaveAppId');
    if (customAppIdInput && btnSaveAppId) {
      api.store.get('customDiscordAppId').then((v: any) => {
        if (v) customAppIdInput.value = v;
      });
      btnSaveAppId.addEventListener('click', async () => {
        const val = customAppIdInput.value.trim();
        await api.store.set('customDiscordAppId', val);
        if (api.discord && typeof api.discord.setAppId === 'function') {
          await api.discord.setAppId(val);
        }
        showToast('Discord Application ID kaydedildi ve bağlandı.', 'success');
      });
    }

    // Başlangıçta önizlemeyi doldur
    syncBotServerAndLivePreview();
  }

  // ── Init ───────────────────────────────────
  async function init() {
    console.log('[Renderer] init() starting...');
    
    // Global error handler
    window.addEventListener('error', (e) => {
      console.error('[Renderer] Global error:', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[Renderer] Unhandled rejection:', e.reason);
    });

    setupNav();
    setupSearch();
    setupPlayer();
    setupPanels();
    setupWindowControls();
    setupPlaylists();
    setupSettings();
    setupAuth();
    setupDiscord();
    setupVolumeLyricsAuthUI();
    setupKeyboardShortcuts();
    setupMediaSession();
    setupLibraryTabs();

    // Check auth state
    await checkAuthState();

    // Load saved liked songs
    const savedLikes: string[] = await api.store.get('likedSongs') || [];
    savedLikes.forEach((id) => state.liked.add(id));
    const savedDetails: Record<string, Song> = await api.store.get('likedSongsDetails') || {};
    state.likedSongsMap = savedDetails;
    Object.values(savedDetails).forEach((s) => {
      if (s?.id) songRegistry.set(s.id, s);
    });

    // Load saved volume
    const savedVol = await api.store.get('volume');
    if (savedVol != null) {
      // Eski format: 0-1 arası (0.8) → yeni format: 0-100 (80)
      state.volume = savedVol <= 1 ? Math.round(savedVol * 100) : savedVol;
      const slider = $('#volumeSlider') as HTMLInputElement;
      if (slider) slider.value = String(state.volume);
      updateVolumeSliderBg();
      api.player.setVolume(state.volume / 100).catch(() => {});
    }

    // Load saved shuffle/repeat
    const savedShuffle = await api.store.get('shuffle');
    if (savedShuffle != null) {
      state.shuffle = !!savedShuffle;
      $('#btnShuffle').classList.toggle('active', state.shuffle);
      if (state.shuffle && state.queue.length) {
        state.shuffleOrder = FisherYatesShuffle(state.queue.map((_, i) => i));
      }
    }
    const savedRepeat = await api.store.get('repeat');
    if (savedRepeat) {
      state.repeat = savedRepeat as any;
      const btn = $('#btnRepeat');
      btn.classList.toggle('active', state.repeat !== 'off');
      if (state.repeat === 'one') {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-weight="bold">1</text></svg>';
      }
    }

    navigateTo('home');
  }

  document.addEventListener('DOMContentLoaded', init);
