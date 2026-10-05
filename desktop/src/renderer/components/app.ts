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
  shouldPreloadRadio,
  decideTrackEnded,
  resolveTogglePlayAction,
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
  formatTime,
  sanitizeName,
  resolveDisplayName,
  toHiResAvatar,
  getAvatarInitial
} from './views';
import {
  show,
  hide,
  toggle,
  showToast,
  confirmDialog,
  closePanels as closePanelsImpl
} from './ui-feedback';
import {
  buildSongRow,
  findSongIn,
  isHomeOrSearchContext,
  filterRadioRecs,
  buildPlaybackContext,
} from './song-row';
import {
  clampVolume,
  volumeTier,
  volumeStepTo,
  muteToggleTarget,
  seekFraction,
  seekTimeFor,
  clampSeekTarget,
  keySeekStep,
  applyLikeToggle,
  isTypingTarget,
  resolveKeyAction,
  isRepeatActive,
  isRepeatOne,
} from './transport';
import {
  resolvePanelToggle,
  buildContextMenuHtml,
  clampMenuPos,
  copyLinkFor,
  buildPlaylistPickerListHtml,
} from './panels';
import {
  cacheLyricsToBotServer,
  loadLyrics,
  renderLyricsContent,
  syncActiveLyric,
} from './lyrics-view';
import {
  saveLiked,
  updateLikeBtn,
  syncLikeButtons,
} from './like-view';
import {
  updatePlayIcon,
} from './playback-view';
import {
  renderQueue as renderQueueView,
} from './queue-view';
import {
  loadHome as loadHomeView,
} from './home-view';
import {
  openBrowse as openBrowseView,
} from './browse-view';
import {
  loadLiked as loadLikedView,
} from './liked-view';
import {
  loadLibrary as loadLibraryView,
} from './library-view';
import {
  SEARCH_DEBOUNCE_MS,
  normalizeQuery,
  isEmptyQuery,
  shouldSuggestSearch,
  shouldDirectSearch,
  shouldClearOnEmpty,
  nextSearchId,
  isStaleSearch,
  buildSearchCache,
  hasAnyResults,
  normalizeSearchFilter,
  resolveNavLoader,
  nextNavGeneration,
  buildSuggestionListHtml,
  buildSearchEmptyHtml,
  buildSearchLoadingHtml,
  buildSearchNoResultsHtml,
  buildSearchErrorHtml,
  buildAlbumsSectionHtml,
  buildArtistsSectionHtml,
  resolveSearchSections,
} from './search-nav';
import {
  isStaleContent,
  resolveLocalLiked,
  buildLikedHtml,
} from './content';
import {
  CHROME_LOGIN_TOAST,
  isLoginOpenFailure,
  resolveLoginErrorText,
  hasExternalChrome,
  buildImportSuccessText,
  buildImportExceptionText,
  IMPORT_WINDOW_CLOSED_TR,
  isImportWindowClosedError,
  resolveImportFailureWithVerify,
  normalizeUserName,
  buildChromeImportModalHtml,
  MEDIA_SEEK_STEP,
  shouldHandleMediaSeek,
  buildMediaArtwork,
  PLAYLISTS_EMPTY_HTML,
  LOCAL_PLAYLIST_EMPTY_BODY,
  buildLocalPlaylistEntry,
  shouldCreatePlaylist,
  findLocalPlaylist,
  removeLocalPlaylist,
  buildPlaylistsNavHtml,
  buildLocalPlaylistHeaderHtml,
  buildPlaylistDeleteConfirm,
  shouldShowPlaylistPlay,
  normalizeTheme,
  normalizeQuality,
  normalizeAutoPlay,
  resolveEffectiveTheme,
  formatAppVersion,
  shouldShowAppVersion,
  resolveUpdateCheckDisplay,
  resolveUpdateCheckError,
  resolveGoogleOAuthStatus,
  buildAuthClientsHtml,
  isValidAuthClientInput,
  DISCORD_POLL_MS,
  DISCORD_UNKNOWN_TEXT,
  DISCORD_OFF_TEXT,
  resolveDiscordRpcStatus,
  resolveDiscordAccountLabel,
  shouldShowDiscordAvatar,
  resolveBotServerStatus,
  normalizeBotServerEnabled,
  resolveBotAuthToast,
  shouldAbortBotAuthToggle,
  extractRegenToken,
  normalizeCustomAppId,
  DISCORD_REFRESH_MS,
  shouldSendDiscordUpdate,
  buildDiscordActivityPayload,
  resolveDiscordTrackKey,
  resolvePollDiscordAction,
  resolvePreviewDisplay,
  resolvePreviewEffDuration,
  previewProgressPct,
  buildBotRecs,
  INIT_DEFAULT_PAGE,
  normalizeSavedVolume,
  shouldRestoreVolume,
  shouldBuildShuffleOrder,
  shouldRestoreRepeat,
  REPEAT_ONE_BUTTON_HTML,
  REPEAT_ALL_BUTTON_HTML,
  collectRegistrySongs,
} from './system';

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
        if (state.user) {
          state.user.name = normalizeUserName(state.user.name, sanitizeName(state.user.name));
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
      showToast(CHROME_LOGIN_TOAST, 'info');
      const opened = await api.auth.loginMusic();
      if (isLoginOpenFailure(opened)) {
        showToast(resolveLoginErrorText(opened), 'error');
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

  function showChromeImportPrompt(opened: { externalFound?: unknown } | null | undefined) {
    const existing = document.getElementById('chromeImportModal');
    if (existing) existing.remove();
    const hasExt = hasExternalChrome(opened);
    const modal = document.createElement('div');
    modal.id = 'chromeImportModal';
    modal.className = 'modal-overlay visible';
    modal.innerHTML = buildChromeImportModalHtml(hasExt);
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
          status.textContent = buildImportSuccessText(state.user?.name, r.cookies);
          status.style.color = 'var(--c-success)';
          await checkAuthState(); updateAuthUI(); loadHome();
          setTimeout(close, 1500);
        } else { let verify = false; try { const ls = await api.auth.getLoginState?.(); verify = !!ls?.verifyChallenge; } catch {} status.textContent = resolveImportFailureWithVerify(r?.error, verify); status.style.color = 'var(--c-error)'; btn.disabled=false; btn.textContent='Tekrar Dene'; }
      } catch(e:any){ status.textContent=isImportWindowClosedError(e)?IMPORT_WINDOW_CLOSED_TR:buildImportExceptionText(e); status.style.color='var(--c-error)'; btn.disabled=false; btn.textContent='Tekrar Dene'; }
    });
  }

  // ── Navigation ─────────────────────────────
  function navigateTo(page: string) {
    state.page = page;
    state.navGeneration = nextNavGeneration(state.navGeneration);
    $$('.nav-link').forEach((l) => {
      l.classList.toggle('active', (l as HTMLElement).dataset.page === page);
    });
    $$('.page').forEach((p) => {
      (p as HTMLElement).classList.toggle('active', (p as HTMLElement).dataset.page === page);
    });
    const loader = resolveNavLoader(page);
    if (loader === 'home') loadHome();
    if (loader === 'library') loadLibrary();
    if (loader === 'liked') loadLiked();
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
      const query = normalizeQuery(input.value);

      // Anlık arama - 1 karakterden itibaren
      if (shouldSuggestSearch(query)) {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          // Önce önerileri göster
          const suggestions = await ytSuggestions(query);
          if (suggestions.length && document.activeElement === input) {
            dropdown.innerHTML = buildSuggestionListHtml(suggestions);
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
          if (shouldDirectSearch(query)) {
            lastSearchQuery = query;
            doSearch(query);
          }
        }, SEARCH_DEBOUNCE_MS); // 200ms debounce
      } else {
        hide(dropdown);
        // Input temizlendiğinde sonuçları da temizle
        if (shouldClearOnEmpty(query)) {
          $('#searchResults').innerHTML = buildSearchEmptyHtml();
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
      const query = normalizeQuery(input.value);
      if (shouldSuggestSearch(query) && dropdown.children.length > 0) {
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
      $('#searchResults').innerHTML = buildSearchEmptyHtml();
      input.focus();
    });

    $$('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.searchFilter = normalizeSearchFilter((chip as HTMLElement).dataset.filter);
        lastSearchQuery = '';
        if (input.value) doSearch(input.value);
      });
    });
  }

  let activeSearchId = 0;

  async function doSearch(query: string) {
    if (isEmptyQuery(query)) return;
    activeSearchId = nextSearchId(activeSearchId);
    const searchId = activeSearchId;
    const container = $('#searchResults');
    container.innerHTML = buildSearchLoadingHtml();

    try {
      dlog('doSearch:', query);
      const results = await ytSearch(query);
      if (isStaleSearch(searchId, activeSearchId)) return; // Eski istek, ezilmesin
      // Sonuçları cache'le (tıklama için)
      state.lastSearchResults = buildSearchCache(results);

      if (!hasAnyResults(results)) {
        container.innerHTML = buildSearchNoResultsHtml();
        return;
      }

      let html = '';
      const filter = state.searchFilter;
      const sections = resolveSearchSections(results, filter);

      // Şarkılar
      if (sections.songs) {
        html += `<div class="song-list">${results.songs.map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div>`;
      }

      // Videolar
      if (sections.videos) {
        html += `<div style="margin-top:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">Videolar</h3><div class="song-list">${results.videos.map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div></div>`;
      }

      // Albümler
      if (sections.albums) {
        html += buildAlbumsSectionHtml(results.albums as any);
      }

      // Sanatçılar
      if (sections.artists) {
        html += buildArtistsSectionHtml(results.artists as any);
      }

      container.innerHTML = html || buildSearchNoResultsHtml();
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
      container.innerHTML = buildSearchErrorHtml();
      container.querySelector('.btn-retry')?.addEventListener('click', () => doSearch(query));
    }
  }

  // ── Song Row HTML ──────────────────────────
  function songRow(song: Song, num?: number): string {
    if (song?.id) {
      songRegistry.set(song.id, song);
    }
    return buildSongRow(song, {
      isPlaying: state.currentSong?.id === song.id,
      isLiked: state.liked.has(song.id),
      num,
    });
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
          const isHomeOrSearch = isHomeOrSearchContext(contextType, {
            inSearchResults: !!container.closest('#searchResults'),
            inHomeContent: !!container.closest('#homeContent'),
            page: state.page,
          });
          if (isHomeOrSearch) {
            setContext([song as QueueItem], `${song.title} Radyosu`, 'radio');
            state.queueIndex = state.userQueue.length;
            playSong(song);
            // Şarkıya ait radyo parçalarını arka planda çek ve kuyruğa ekle
            api.youtube.next(song.id).then((res: any) => {
              if (res?.items?.length && state.currentSong?.id === song.id) {
                const recs = filterRadioRecs(res.items, song.id);
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
          const rowIds: Array<string | undefined> = [];
          allRows.forEach((r) => {
            rowIds.push((r as HTMLElement).dataset.id);
          });
          const { songs: contextSongs, clickedIdx } = buildPlaybackContext(rowIds, findSong, id);
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
    return findSongIn(
      {
        currentSong: state.currentSong,
        registryHas: (key: string) => songRegistry.has(key),
        registryGet: (key: string) => songRegistry.get(key),
        queue: state.queue,
        likedMap: state.likedSongsMap,
        lastSearchResults: state.lastSearchResults,
      },
      id,
    );
  }

  function updateVolumeSliderBg() {
    const volSlider = $('#volumeSlider') as HTMLInputElement | null;
    if (volSlider) {
      volSlider.value = String(state.volume);
      volSlider.style.setProperty('--vol-pct', `${state.volume}%`);
    }
    const volBtn = $('#btnVolume');
    if (volBtn) {
      const tier = volumeTier(state.volume);
      if (tier === 'muted') {
        volBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
        volBtn.title = 'Sesi Aç (Mute)';
      } else if (tier === 'low') {
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
      const rect = scrubber.getBoundingClientRect();
      const t = seekTimeFor(seekFraction(e.clientX, rect.left, rect.width), state.duration);
      if (t === null) return;
      api.player.seek(t).catch(() => {});
    }

    scrubber.addEventListener('click', (e) => {
      seekFromEvent(e);
    });

    // Hover tooltip: imleçteki zaman
    const scrubTooltip = $('#scrubberTooltip');
    scrubber.addEventListener('mousemove', (e) => {
      const rect = scrubber.getBoundingClientRect();
      const pct = seekFraction(e.clientX, rect.left, rect.width);
      const t = seekTimeFor(pct, state.duration);
      if (t === null) return;
      scrubTooltip.textContent = formatTime(t);
      scrubTooltip.style.left = `${pct * 100}%`;
    });

    scrubber.addEventListener('mousedown', (e) => {
      isDragging = true;
      seekFromEvent(e);
      const onMove = (ev: MouseEvent) => {
        const rect = scrubber.getBoundingClientRect();
        const pct = seekFraction(ev.clientX, rect.left, rect.width);
        const t = seekTimeFor(pct, state.duration);
        if (!isDragging || t === null) return;
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
          const t = seekTimeFor(seekFraction(ev.clientX, rect.left, rect.width), state.duration);
          if (t !== null) api.player.seek(t).catch(() => {});
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
      state.volume = clampVolume(vol);
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
      if (state.volume > 0) state.lastVolume = state.volume;
      applyVol(muteToggleTarget(state.volume, state.lastVolume));
    });

    // Fare tekerleğiyle ses ayarı (+%5 / -%5)
    const onVolWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      applyVol(volumeStepTo(state.volume, delta));
    };
    volSlider.addEventListener('wheel', onVolWheel, { passive: false });
    btnVolume.addEventListener('wheel', onVolWheel, { passive: false });

    // Volume çift-tık → %50
    volSlider.addEventListener('dblclick', () => {
      applyVol(50);
    });

    // state.volume 0-100 aralığında olmalı; initial setVolume
    api.player.setVolume(clampVolume(state.volume) / 100).catch(() => {});

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
          state.currentLyrics = null;
          ytLyrics(state.currentSong.id, state.currentSong.title, state.currentSong.artist, state.currentSong.duration).then((l) => {
            if (state.currentSong?.id === pollVid && l) {
              cacheLyricsToBotServer(pollVid, l);
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
      const pollAction = resolvePollDiscordAction(state.playing, trackKey, lastDiscordKey, !!(u.title && u.artist));
      if (pollAction === 'clear') {
        clearDiscordTrack();
      } else if (pollAction === 'update') {
        updateDiscordForTrack(trackKey, u.title, u.artist, u.thumbnail, u.album || state.currentSong?.album);
      } else if (pollAction === 'refresh') {
        maybeRefreshDiscord(trackKey, u.title, u.artist, u.thumbnail, u.album || state.currentSong?.album);
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
    state.currentLyrics = null;
    ytLyrics(song.id, song.title, song.artist, song.duration).then((l) => {
      if (state.currentSong?.id === song.id && l) {
        cacheLyricsToBotServer(song.id, l);
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
  function updateDiscordForTrack(key: string, title: string, artist: string, coverUrl?: string, album?: string, force = false) {
    const now = Date.now();
    if (!shouldSendDiscordUpdate(lastDiscordKey, lastDiscordSentAt, now, key, title, force, DISCORD_REFRESH_MS)) return;
    lastDiscordKey = key;
    lastDiscordSentAt = now;
    const payload = buildDiscordActivityPayload({
      key, title, artist, coverUrl, album,
      currentTime: state.currentTime || 0,
      duration: state.duration,
      now,
    });
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

    const { displayTitle, displayArtist, displayAlbum, displayCover } = resolvePreviewDisplay(
      title, artist, coverUrl, album, state.currentSong,
    );

    if (titleEl) titleEl.textContent = displayTitle;
    if (artistEl) artistEl.textContent = displayArtist;
    if (albumEl) albumEl.textContent = displayAlbum;
    if (thumbEl && displayCover) thumbEl.src = displayCover;

    // Sayı + formatlı alanlar tutarlı olmalı (canlı testte duration:0 / "04:47" çelişkisi yakalandı).
    const effDuration = resolvePreviewEffDuration(state.duration);
    const curFmt = formatTime(state.currentTime, true);
    const durFmt = formatTime(effDuration, true);

    if (curTimeEl) curTimeEl.textContent = curFmt;
    if (totTimeEl) totTimeEl.textContent = durFmt;
    if (barFillEl) {
      const pct = previewProgressPct(state.currentTime, state.duration);
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
      const recs = buildBotRecs(upcoming);

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
        lyrics: state.currentLyrics || undefined
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
    const key = resolveDiscordTrackKey(state.currentSong?.id, title, artist);
    if (!title && !artist) {
      clearDiscordTrack();
      return;
    }
    updateDiscordForTrack(key, title || 'Çalıyor', artist, coverUrl);
  }

  function togglePlay() {
    const action = resolveTogglePlayAction(state.playing, !!state.currentSong, state.queue.length);
    if (action === 'pause') {
      api.player.pause().catch(() => {});
      state.playing = false;
      state.paused = true;
      state.lastPausedAt = Date.now();
      updatePlayIcon();
      // Discord'tan parçayı temizle - 100ms sonra tekrar kontrol et (poll loop'dan kaynaklı çakışma önleme)
      clearDiscordTrack();
      setTimeout(() => { if (!state.playing) clearDiscordTrack(); }, 100);
    } else if (action === 'resume') {
      // Önce şarkı varsa resume et, yoksa sıradakini başlat
      api.player.resume().catch(() => {});
      state.playing = true;
      state.paused = false;
      updatePlayIcon();
      if (state.currentSong) {
        updateDiscordForTrack(state.currentSong.id, state.currentSong.title, state.currentSong.artist, state.currentSong.thumbnail);
      }
    } else if (action === 'play-queue') {
      playSong(state.queue[state.queueIndex >= 0 ? state.queueIndex : 0]);
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
      if (shouldPreloadRadio(state) && state.currentSong) {
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
    btn.classList.toggle('active', isRepeatActive(state.repeat));
    api.store.set('repeat', state.repeat);
    if (isRepeatOne(state.repeat)) {
      btn.innerHTML = REPEAT_ONE_BUTTON_HTML;
    } else {
      btn.innerHTML = REPEAT_ALL_BUTTON_HTML;
    }
  }

  // ── Like ───────────────────────────────────
  function toggleLike(id: string) {
    const song = findSong(id) || (state.currentSong?.id === id ? state.currentSong : undefined);
    const wasLiked = state.liked.has(id);
    applyLikeToggle(state, id, song);
    if (!wasLiked && song) songRegistry.set(id, song);
    saveLiked();
    updateLikeBtn();
    syncLikeButtons(id);
    if (state.page === 'liked') loadLiked();
  }


  // ── Panels ─────────────────────────────────
  function setupPanels() {
    const lyricsPanel = $('#lyricsPanel');
    const queuePanel = $('#queuePanel');
    const backdrop = $('#panelBackdrop');

    $('#btnLyrics').addEventListener('click', () => {
      const next = resolvePanelToggle(state.panelOpen, 'lyrics');
      closePanels();
      if (!next) return;
      state.panelOpen = next;
      show(lyricsPanel);
      show(backdrop);
      if (state.currentSong) loadLyrics();
    });

    $('#btnQueue').addEventListener('click', () => {
      const next = resolvePanelToggle(state.panelOpen, 'queue');
      closePanels();
      if (!next) return;
      state.panelOpen = next;
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
    menu.innerHTML = buildContextMenuHtml(state.liked.has(song.id));

    // Pozisyon ayarla
    const pos = clampMenuPos(x, y, window.innerWidth, window.innerHeight);
    menu.style.left = `${pos.left}px`;
    menu.style.top = `${pos.top}px`;

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
          navigator.clipboard?.writeText(copyLinkFor(song.id));
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
      listEl.innerHTML = buildPlaylistPickerListHtml(playlists, song.id);

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

  function renderQueue() {
    renderQueueView({ clearUserQueue, playSong });
  }

  // ── Home ───────────────────────────────────
  async function loadHome() {
    await loadHomeView({
      fetchHome: ytHome,
      renderRow: songRow,
      wireRowEvents: (c) => attachSongEvents(c),
      enterContext: (songs, name, type) => setContext(songs, name, type),
      openBrowse: (id, title, thumb) => openBrowse(id, title, thumb),
      retry: () => loadHome(),
    });
  }

  async function openBrowse(browseId: string, fallbackTitle?: string, fallbackThumb?: string, onBack?: () => void) {
    await openBrowseView({
      getPage: () => state.page,
      fetchBrowse: (id) => api.youtube.browse(id),
      renderRow: (s, n) => songRow(s, n),
      enterContext: (songs, name, type) => setContext(songs, name, type),
      wireRowEvents: (c, t, ty) => attachSongEvents(c, t, ty),
      openSub: (id, t, th, back) => openBrowse(id, t, th, back),
      goSearch: (q) => doSearch(q),
      goLibrary: () => loadLibrary(),
      goHome: () => loadHome(),
      getSearchQuery: () => ($('#searchInput') as HTMLInputElement)?.value ?? '',
      retry: (id, t, th, back) => openBrowse(id, t, th, back),
    }, browseId, fallbackTitle, fallbackThumb, onBack);
  }

  // ── Library ────────────────────────────────
  async function loadLibrary() {
    return loadLibraryView({
      getGen: () => state.navGeneration,
      isStale: (gen) => isStaleContent(gen, state.navGeneration),
      isLoggedIn: () => state.isLoggedIn,
      getRecent: () => state.recentlyPlayed,
      fetchPlaylists: () => api.youtube.libraryPlaylists(),
      fetchArtists: () => api.youtube.libraryArtists(),
      fetchAlbums: () => api.youtube.libraryAlbums(),
      fetchLocalPlaylists: () => api.store.get('playlists'),
      getTab: () => state.libraryTab,
      renderRow: (s, n) => songRow(s, n),
      wireRowEvents: (c) => attachSongEvents(c),
      openLocalPlaylist: (plId) => openLocalPlaylist(plId),
      playLibraryBrowse: async (browseId) => {
        try {
          const browseData = await api.youtube.browse(browseId);
          if (browseData.items?.length) {
            const songs = browseData.items.filter((i: { id?: string }) => i.id) as Song[];
            if (songs.length) {
              setContext(songs, browseData.title || 'Kütüphane', 'playlist');
              state.queueIndex = 0;
              playSong(songs[0]);
            }
          }
        } catch {}
      },
      retry: () => loadLibrary(),
    });
  }

  async function loadLiked() {
    return loadLikedView({
      getGen: () => state.navGeneration,
      isStale: (gen) => isStaleContent(gen, state.navGeneration),
      isLoggedIn: () => state.isLoggedIn,
      fetchYtLiked: () => api.youtube.likedSongs(),
      getLocalIds: () => Array.from(state.liked),
      resolveLocal: (ids) => resolveLocalLiked(ids, (id) => state.likedSongsMap[id] || songRegistry.get(id) || state.queue.find((s) => s.id === id) || state.recentlyPlayed.find((s) => s.id === id)),
      renderRow: (s, n) => songRow(s, n),
      wireRowEvents: (c, t, ty) => attachSongEvents(c, t, ty),
    });
  }

  // ── Media Session (OS media controls) ──────
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => { if (!state.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (state.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextSong());
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      if (shouldHandleMediaSeek(state.duration)) api.player.seek(clampSeekTarget(state.currentTime, -MEDIA_SEEK_STEP, state.duration)).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      if (shouldHandleMediaSeek(state.duration)) api.player.seek(clampSeekTarget(state.currentTime, MEDIA_SEEK_STEP, state.duration)).catch(() => {});
    });
  }

  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !state.currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.currentSong.title,
      artist: state.currentSong.artist,
      artwork: buildMediaArtwork(state.currentSong.thumbnail)
    });
  }

  // ── Keyboard Shortcuts ─────────────────────
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger if typing in input
      if (isTypingTarget((e.target as HTMLElement).tagName)) return;

      const action = resolveKeyAction(e.code, { ctrlKey: e.ctrlKey });
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case 'togglePlay':
          togglePlay();
          break;
        case 'prev':
          prevSong();
          break;
        case 'next':
          nextSong();
          break;
        case 'seekBack':
          if (state.duration) {
            api.player.seek(clampSeekTarget(state.currentTime, -keySeekStep(e.shiftKey), state.duration)).catch(() => {});
          }
          break;
        case 'seekFwd':
          if (state.duration) {
            api.player.seek(clampSeekTarget(state.currentTime, keySeekStep(e.shiftKey), state.duration)).catch(() => {});
          }
          break;
        case 'volUp':
        case 'volDown': {
          state.volume = volumeStepTo(state.volume, action === 'volUp' ? 5 : -5);
          if (state.volume > 0) state.lastVolume = state.volume;
          updateVolumeSliderBg();
          api.player.setVolume(state.volume / 100).catch(() => {});
          api.store.set('volume', state.volume);
          break;
        }
        case 'like':
          if (state.currentSong) toggleLike(state.currentSong.id);
          break;
        case 'queue':
          $('#btnQueue')?.click();
          break;
        case 'lyrics':
          $('#btnLyrics')?.click();
          break;
        case 'mute':
          $('#btnVolume').click();
          break;
        case 'shuffle':
          toggleShuffle();
          break;
        case 'repeat':
          toggleRepeat();
          break;
        case 'maximize':
          api.window.maximize();
          break;
        case 'escape':
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
      if (!shouldCreatePlaylist(name)) return;
      const playlists = await api.store.get('playlists') || [];
      playlists.push(buildLocalPlaylistEntry(name, Date.now()));
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
      container.innerHTML = PLAYLISTS_EMPTY_HTML;
      return;
    }
    container.innerHTML = buildPlaylistsNavHtml(playlists);

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
    const pl = findLocalPlaylist(playlists, plId);
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

    let html = buildLocalPlaylistHeaderHtml(pl.name, songs.length);

    if (shouldShowPlaylistPlay(songs.length)) {
      html += `<div class="song-list">${songs.map((s, i) => songRow(s, i + 1)).join('')}</div></div>`;
    } else {
      html += `${LOCAL_PLAYLIST_EMPTY_BODY}</div>`;
    }

    container.innerHTML = html;
    attachSongEvents(container);

    container.querySelector('#btnPlayPlaylist')?.addEventListener('click', () => {
      if (shouldShowPlaylistPlay(songs.length)) {
        setContext(songs, pl.name, 'playlist');
        state.queueIndex = 0;
        playSong(songs[0]);
      }
    });

    container.querySelector('#btnDeletePlaylist')?.addEventListener('click', async () => {
      const confirm = buildPlaylistDeleteConfirm(pl.name);
      const ok = await confirmDialog(confirm.title, confirm.message);
      if (ok) {
        const updated = removeLocalPlaylist(playlists, plId);
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
      themeSelect.value = normalizeTheme(t);
      applyTheme(normalizeTheme(t));
    });
    api.store.get('quality').then((q: string) => { qualitySelect.value = normalizeQuality(q); });
    api.store.get('autoPlay').then((v: boolean) => { autoPlay.checked = normalizeAutoPlay(v); });

    themeSelect.addEventListener('change', () => {
      api.store.set('theme', themeSelect.value);
      applyTheme(themeSelect.value);
    });
    qualitySelect.addEventListener('change', () => api.store.set('quality', qualitySelect.value));
    autoPlay.addEventListener('change', () => api.store.set('autoPlay', autoPlay.checked));

    // Sürüm rozeti (paket sürümünden — sabit string yok)
    (api as any).app?.getVersion?.().then((v: string) => {
      const el = $('#appVersion');
      if (el && shouldShowAppVersion(v)) el.textContent = formatAppVersion(v);
    }).catch(() => {});

    // Güncelleme denetimi (M-05)
    const btnUpdates = $('#btnCheckUpdates') as HTMLButtonElement | null;
    const updateStatus = $('#updateStatus');
    btnUpdates?.addEventListener('click', async () => {
      if (updateStatus) updateStatus.textContent = 'Denetleniyor...';
      if (btnUpdates) btnUpdates.disabled = true;
      try {
        const r: any = await (api as any).auto?.checkForUpdates?.();
        const display = resolveUpdateCheckDisplay(r);
        if (updateStatus) updateStatus.textContent = display.statusText;
        if (display.toastText) showToast(display.toastText, display.toastKind ?? 'info');
      } catch (e: any) {
        if (updateStatus) updateStatus.textContent = resolveUpdateCheckError().statusText;
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
      document.documentElement.setAttribute('data-theme', resolveEffectiveTheme(theme, prefersDark));
    } else {
      document.documentElement.setAttribute('data-theme', resolveEffectiveTheme(theme, false));
    }
  }

  async function setupOAuthSettings() {
    // OAuth bilgileri uygulamaya gömülü — giriş alanı yok, durum sabit.
    try {
      const googleConfig = await api.auth.getGoogleConfig();
      const el = document.getElementById('googleOAuthStatus');
      if (el) el.textContent = resolveGoogleOAuthStatus(googleConfig.clientId);
    } catch {}
  }

  function setupVolumeLyricsAuthUI(){
    const vr=(document.getElementById('volumeRatioEnabled') as HTMLInputElement); const ly=(document.getElementById('lyricsEnabled') as HTMLInputElement);
    if(vr){ (api as any).volumeRatio.isEnabled().then((v:boolean)=>vr.checked=!!v); vr.addEventListener('change',()=> (api as any).volumeRatio.setEnabled(vr.checked)); }
    if(ly){ (api as any).lyrics.isEnabled().then((v:boolean)=>ly.checked=v!==false); ly.addEventListener('change',()=> (api as any).lyrics.setEnabled(ly.checked)); }
    const listEl=document.getElementById('authClientsList'); const aId=document.getElementById('authAppId') as HTMLInputElement; const aName=document.getElementById('authAppName') as HTMLInputElement; const btn=document.getElementById('authCreateBtn');
    async function refresh(){ if(!listEl) return; const cs:any[]=await (api as any).authClients.list(); listEl.innerHTML= buildAuthClientsHtml(cs); listEl.querySelectorAll('[data-revoke]').forEach(b=> b.addEventListener('click', async()=>{ await (api as any).authClients.revoke((b as HTMLElement).dataset.revoke!); refresh(); })); }
    refresh(); btn?.addEventListener('click', async()=>{ if(!isValidAuthClientInput(aId.value, aName.value)) return showToast('appId ve ad gerekli','warning'); await (api as any).authClients.create({appId:aId.value, appName:aName.value}); aId.value=''; aName.value=''; refresh(); showToast('İstemci eklendi','success'); });
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
    enabledToggle.addEventListener('change', () => { api.store.set('discordEnabled', enabledToggle.checked); if (!enabledToggle.checked) { api.discord.clearActivity().catch(()=>{}); statusEl.textContent = DISCORD_OFF_TEXT; } else { refreshDiscordStatus(); } });
    buttonsToggle.addEventListener('change', () => api.store.set('discordButtons', buttonsToggle.checked));
    thumbsToggle.addEventListener('change', () => api.store.set('discordThumbnails', thumbsToggle.checked));

    // RPC durumu (tokensuz — Discord masaüstü uygulaması gerekli)
    async function refreshDiscordStatus() {
      try {
        const ok = await api.discord.isReady();
        statusEl.textContent = resolveDiscordRpcStatus(!!ok);
      } catch { statusEl.textContent = DISCORD_UNKNOWN_TEXT; }
    }
    refreshDiscordStatus();
    setInterval(() => { if (enabledToggle.checked) refreshDiscordStatus(); }, DISCORD_POLL_MS);

    // Discord hesabı (resmi OAuth2 — token yapıştırma yok)
    const accName = $('#discordAccountName');
    const accAvatar = $('#discordAvatar') as HTMLImageElement;
    const loginBtn = $('#btnDiscordLogin');
    const logoutBtn = $('#btnDiscordLogout');
    async function refreshDiscordAccount() {
      try {
        const u: any = await (api as any).discordAuth.getUser();
        if (u) {
          if (accName) accName.textContent = resolveDiscordAccountLabel(u);
          if (shouldShowDiscordAvatar(u)) { accAvatar.src = u.picture; accAvatar.style.display = 'block'; }
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

    // Bot Server (Port 9863) Ayarı (v1.0.2)
    const botServerToggle = $('#botServerEnabled') as HTMLInputElement;
    const botServerStatus = $('#botServerStatus');
    if (botServerToggle && (api as any).botServer) {
      api.store.get('botServerEnabled').then((v: any) => {
        botServerToggle.checked = normalizeBotServerEnabled(v);
        if (botServerStatus) {
          botServerStatus.textContent = resolveBotServerStatus(normalizeBotServerEnabled(v));
        }
      });
      botServerToggle.addEventListener('change', async () => {
        const active = await (api as any).botServer.toggle(botServerToggle.checked);
        if (botServerStatus) {
          botServerStatus.textContent = resolveBotServerStatus(!!active);
        }
      });
    }

    // Token koruması (v1.0.2 + M-08): açıkken /api/v1/state Bearer token ister
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
          if (shouldAbortBotAuthToggle(desired, !!a.enabled)) {
            showToast('İşlem iptal edildi.', 'info');
            return;
          }
        }
        {
          const toast = resolveBotAuthToast(!!a?.enabled);
          showToast(toast.text, toast.kind);
        }
      });
      btnRegen?.addEventListener('click', async () => {
        const res = await (api as any).botServer.regenerateToken().catch(() => null);
        const t = extractRegenToken(res);
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
        const val = normalizeCustomAppId(customAppIdInput.value);
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
    collectRegistrySongs(savedDetails).forEach((s) => {
      songRegistry.set(s.id, s);
    });

    // Load saved volume
    const savedVol = await api.store.get('volume');
    if (shouldRestoreVolume(savedVol)) {
      // Eski format: 0-1 arası (0.8) → yeni format: 0-100 (80)
      state.volume = normalizeSavedVolume(savedVol);
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
      if (shouldBuildShuffleOrder(state.shuffle, state.queue.length)) {
        state.shuffleOrder = FisherYatesShuffle(state.queue.map((_, i) => i));
      }
    }
    const savedRepeat = await api.store.get('repeat');
    if (shouldRestoreRepeat(savedRepeat)) {
      state.repeat = savedRepeat as any;
      const btn = $('#btnRepeat');
      btn.classList.toggle('active', state.repeat !== 'off');
      if (state.repeat === 'one') {
        btn.innerHTML = REPEAT_ONE_BUTTON_HTML;
      }
    }

    navigateTo(INIT_DEFAULT_PAGE);
  }

  document.addEventListener('DOMContentLoaded', init);
