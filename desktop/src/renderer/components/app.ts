/* ============================================
   Harmonic - Desktop Music Client
   Main Renderer Script
   ============================================ */

(() => {
  'use strict';

  // ── Types ──────────────────────────────────
  interface Song {
    id: string;
    title: string;
    artist: string;
    artistId: string;
    thumbnail: string;
    duration: number;
    album?: string;
    durationText?: string;
  }

  interface QueueItem extends Song {}

  interface QueueContext {
    name: string;
    type: 'playlist' | 'album' | 'search' | 'home' | 'auto';
    songs: QueueItem[];
  }

  // ── State ──────────────────────────────────
  const state = {
    page: 'home',
    currentSong: null as QueueItem | null,
    queue: [] as QueueItem[],
    queueIndex: -1,
    userQueue: [] as QueueItem[],
    contextQueue: [] as QueueItem[],
    contextName: '',
    contextType: 'home' as 'playlist' | 'album' | 'search' | 'home' | 'auto',
    history: [] as QueueItem[],
    playing: false,
    shuffle: false,
    shuffleOrder: [] as number[],
    repeat: 'off' as 'off' | 'all' | 'one',
    volume: 80,
    lastVolume: 80,
    currentTime: 0,
    duration: 0,
    paused: false,
    lastPausedAt: 0,
    liked: new Set<string>(),
    recentlyPlayed: [] as Song[],
    panelOpen: null as 'lyrics' | 'queue' | null,
    lastSearchResults: [] as Song[],
    libraryTab: 'recent' as 'recent' | 'songs' | 'albums' | 'playlists',
    searchFilter: 'all' as 'all' | 'songs' | 'videos' | 'albums' | 'artists',
    navGeneration: 0,
    isLoggedIn: false,
    user: null as { id: string; name: string; email: string; picture: string } | null
  };

  // ── API Bridge ─────────────────────────────
  const api = (window as any).api;

  // Logları ana sürece gönder (stdout'tan izlenebilir)
  function dlog(...args: any[]) {
    const line = args.map((a) => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    console.log('[Harmonic]', line);
    try { api.debugLog(line); } catch {}
  }

  async function ytSearch(query: string) {
    try { 
      const r = await api.youtube.search(query);
      console.log('[Renderer] Search result:', JSON.stringify({ songs: r.songs?.length, videos: r.videos?.length, albums: r.albums?.length }));
      return r;
    } catch (e) { 
      console.error('[Renderer] Search error:', e);
      return { songs: [], videos: [], albums: [], artists: [], playlists: [] }; 
    }
  }

  async function ytPlayer(videoId: string) {
    try {
      const r = await api.youtube.player(videoId);
      dlog('Player sonucu:', { streamUrl: !!r?.streamUrl, title: r?.title });
      return r;
    } catch (e) {
      dlog('Player HATASI:', String(e));
      return null;
    }
  }

  async function ytHome() {
    try { 
      const r = await api.youtube.home();
      console.log('[Renderer] Home result:', JSON.stringify({ items: r?.items?.length }));
      return r; 
    } catch (e) { 
      console.error('[Renderer] Home error:', e);
      return { items: [] }; 
    }
  }

  async function ytSuggestions(input: string) {
    try { return await api.youtube.suggestions(input); } catch { return []; }
  }

  async function ytLyrics(videoId: string) {
    try { return await api.youtube.lyrics(videoId); } catch { return null; }
  }

  // ── Helpers ────────────────────────────────
  const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
  const $$ = (sel: string) => document.querySelectorAll(sel);

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatTime(sec: number): string {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function FisherYatesShuffle(arr: number[]): number[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rebuildMergedQueue(): QueueItem[] {
    return [...state.userQueue, ...state.contextQueue];
  }

  function addToQueue(song: Song): void {
    state.userQueue.push(song as QueueItem);
    state.queue = rebuildMergedQueue();
    showToast(`Sıraya eklendi: ${song.title}`, 'success');
  }

  function playNext(song: Song): void {
    state.userQueue.unshift(song as QueueItem);
    state.queue = rebuildMergedQueue();
    showToast(`Önce çalınacak: ${song.title}`, 'success');
  }

  function clearUserQueue(): void {
    state.userQueue = [];
    state.queue = rebuildMergedQueue();
    showToast('Sıra temizlendi', 'info');
  }

  function setContext(songs: Song[], name: string, type: QueueContext['type']): void {
    state.contextQueue = songs as QueueItem[];
    state.contextName = name;
    state.contextType = type;
    state.queue = rebuildMergedQueue();
    const ctxEl = $('#playerContext');
    if (ctxEl) ctxEl.textContent = name || '';
  }

  function show(el: HTMLElement) { el.classList.add('open', 'visible'); }
  function hide(el: HTMLElement) { el.classList.remove('open', 'visible'); }
  function toggle(el: HTMLElement) { el.classList.contains('open') ? hide(el) : show(el); }

  // ── Auth ──────────────────────────────────
  function sanitizeName(name: string | undefined | null): string {
    if (!name || typeof name !== 'string') return '';
    const trimmed = name.trim();
    if (trimmed.length <= 1) return '';
    if (/^(guide|hamburger|menu|account|hesap|profil|open guide|rehber|kılavuz|youtube music)$/i.test(trimmed)) return '';
    return trimmed;
  }

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
        if (userName) userName.textContent = state.user.name;
        if (userEmail) userEmail.textContent = state.user.email;
        if (userAvatar && state.user.picture) {
          userAvatar.style.backgroundImage = `url(${state.user.picture})`;
          if (avatarText) avatarText.style.display = 'none';
        } else if (avatarText && state.user.name) {
          avatarText.textContent = state.user.name.charAt(0).toUpperCase();
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

    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        showToast('Chrome açılıyor... YouTube Music\'e giriş yapıp buraya dönün.', 'info');
        const opened = await api.auth.loginMusic();
        if (!opened?.opened) {
          showToast(`Chrome açılamadı: ${opened?.error || 'bilinmeyen hata'}`, 'error');
          return;
        }
        showChromeImportPrompt();
      });
    }

    if (openLoginBtn) {
      openLoginBtn.addEventListener('click', async () => {
        showToast('Chrome açılıyor... YouTube Music\'e giriş yapıp buraya dönün.', 'info');
        const opened = await api.auth.loginMusic();
        if (!opened?.opened) {
          showToast(`Chrome açılamadı: ${opened?.error || 'bilinmeyen hata'}`, 'error');
          return;
        }
        showChromeImportPrompt();
      });
    }

    if (startWelcomeBtn) {
      startWelcomeBtn.addEventListener('click', async () => {
        showToast('Chrome açılıyor... YouTube Music\'e giriş yapıp buraya dönün.', 'info');
        const opened = await api.auth.loginMusic();
        if (!opened?.opened) {
          showToast(`Chrome açılamadı: ${opened?.error || 'bilinmeyen hata'}`, 'error');
          return;
        }
        showChromeImportPrompt();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await api.auth.logoutMusic();
        state.isLoggedIn = false;
        state.user = null;
        updateAuthUI();
        showToast('Çıkış yapıldı.', 'info');
      });
    }
  }

  // Chrome'dan giriş aktarım modalı
  function showChromeImportPrompt() {
    const existing = document.getElementById('chromeImportModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'chromeImportModal';
    modal.className = 'modal-overlay visible';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h3 style="display:flex;align-items:center;gap:8px">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
            Chrome'da Giriş Yapın
          </h3>
          <button class="icon-btn" id="closeChromeImport">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
          <p style="margin:0 0 12px;color:var(--c-text-1);line-height:1.5">
            <strong>1.</strong> Açılan Chrome penceresinde Google hesabınızla YouTube Music'e giriş yapın.<br>
            <strong>2.</strong> YouTube Music ana sayfası yüklendikten sonra aşağıdaki <strong>Girişi Aktar</strong>'a basın.<br>
            <strong>3.</strong> Chrome penceresini kapatabilirsiniz.
          </p>
          <div id="importStatus" style="margin-top:12px;padding:10px;border-radius:6px;background:var(--c-bg-2);font-size:13px;color:var(--c-text-2);min-height:18px"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelChromeImport">İptal</button>
          <button class="btn btn-primary" id="doChromeImport">Girişi Aktar</button>
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
      btn.disabled = true;
      btn.textContent = 'Aktarılıyor...';
      status.textContent = 'Chrome\'un cookie\'leri okunuyor...';
      status.style.color = 'var(--c-text-2)';
      try {
        const r = await api.auth.importFromChrome();
        if (r?.success) {
          status.textContent = `${r.cookies} cookie aktarıldı! Artık şarkılar çalınabilir.`;
          status.style.color = 'var(--c-success, #4ade80)';
          state.isLoggedIn = true;
          state.user = await api.auth.getMusicUser();
          updateAuthUI();
          setTimeout(close, 1800);
        } else {
          status.textContent = `Hata: ${r?.error || 'Chrome\'da giriş yapılmamış olabilir'}`;
          status.style.color = 'var(--c-error, #f87171)';
          btn.disabled = false;
          btn.textContent = 'Tekrar Dene';
        }
      } catch (e: any) {
        status.textContent = `Hata: ${e?.message || String(e)}`;
        status.style.color = 'var(--c-error, #f87171)';
        btn.disabled = false;
        btn.textContent = 'Tekrar Dene';
      }
    });
  }

  // ── Toast Notification ─────────────────────
  function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '\u00d7';
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);

    // Stack: position based on existing toasts
    const existing = document.querySelectorAll('.toast.show');
    const offset = existing.length * 60;
    toast.style.bottom = `${100 + offset}px`;

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);

    toast.querySelector('.toast-close')?.addEventListener('click', () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
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
        clearTimeout(searchTimer);
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

  async function doSearch(query: string) {
    if (!query.trim()) return;
    const container = $('#searchResults');
    container.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Aranıyor...</p></div>';

    try {
      dlog('doSearch:', query);
      const results = await ytSearch(query);
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
      attachSongEvents(container);
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p class="empty-text">Arama hatası</p><p class="empty-hint-text">Lütfen tekrar deneyin</p></div>';
    }
  }

  // ── Song Row HTML ──────────────────────────
  function songRow(song: Song, num?: number): string {
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

  function attachSongEvents(container: HTMLElement) {
    container.querySelectorAll('.song-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.like-btn')) return;
        const id = (row as HTMLElement).dataset.id;
        const song = findSong(id);
        if (song) {
          // Container içindeki tüm şarkıları context olarak ayarla
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
          if (contextSongs.length) {
            setContext(contextSongs, '', 'home');
            state.queueIndex = clickedIdx;
          } else {
            setContext([song as QueueItem], '', 'home');
            state.queueIndex = 0;
          }
          playSong(song);
        }
      });
      // Sağ tık menüsü
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = (row as HTMLElement).dataset.id;
        const song = findSong(id);
        if (song) showContextMenu(e.clientX, e.clientY, song);
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
    const inQueue = state.queue.find((s) => s.id === id);
    if (inQueue) return inQueue;
    return state.lastSearchResults.find((s) => s.id === id);
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
    function updateVolumeSliderBg() {
      volSlider.style.setProperty('--vol-pct', `${state.volume}%`);
    }
    updateVolumeSliderBg();
    volSlider.addEventListener('input', () => {
      state.volume = parseInt(volSlider.value) || 0;
      if (state.volume > 0) state.lastVolume = state.volume;
      updateVolumeSliderBg();
      api.player.setVolume(state.volume / 100).catch(() => {});
      api.store.set('volume', state.volume);
    });
    // Volume button: mute toggle
    $('#btnVolume').addEventListener('click', () => {
      if (state.volume > 0) {
        state.lastVolume = state.volume;
        state.volume = 0;
      } else {
        state.volume = state.lastVolume || 80;
      }
      volSlider.value = String(state.volume);
      updateVolumeSliderBg();
      api.player.setVolume(state.volume / 100).catch(() => {});
      api.store.set('volume', state.volume);
    });
    // Volume çift-tık → %50
    volSlider.addEventListener('dblclick', () => {
      state.volume = 50;
      state.lastVolume = 50;
      volSlider.value = '50';
      updateVolumeSliderBg();
      api.player.setVolume(0.5).catch(() => {});
      api.store.set('volume', 50);
    });
    // state.volume 0-100 aralığında olmalı; initial setVolume
    api.player.setVolume(Math.max(0, Math.min(100, state.volume)) / 100).catch(() => {});

    // Gizli pencereden gelen metadata + playback state
    let _adNotified = false;
    let _lastPollPlaying: boolean | null = null;
    let _pollCount = 0;
    api.player.onUpdate((u: any) => {
      // Reklam algılama — closure ile state korunur (her poll'de yeni obje gelir)
      if (u.isAd && !_adNotified) {
        _adNotified = true;
        showToast('Reklam oynuyor...', 'info');
        setTimeout(() => { if (u.isAd) showAdSkipButton(); }, 5000);
      } else if (!u.isAd && _adNotified) {
        _adNotified = false;
        hideAdSkipButton();
      }
      // Metadata (reklam sırasında boş gelebilir — mevcut olanı koru)
      if (u.title) $('#playerTitle').textContent = u.title;
      if (u.artist) $('#playerArtist').textContent = u.artist;
      if (u.thumbnail) $('#playerThumb').style.backgroundImage = `url(${u.thumbnail})`;
      // Süreler — paused iken bile ilk yükleme yapılsın
      if (u.currentTime != null) state.currentTime = u.currentTime || 0;
      if (u.duration != null) state.duration = u.duration || 0;
      if (state.duration) {
        const pct = (state.currentTime / state.duration) * 100;
        $('#scrubberFill').style.width = `${pct}%`;
        $('#scrubberThumb').style.left = `${pct}%`;
        $('#timeNow').textContent = formatTime(state.currentTime);
        $('#timeEnd').textContent = formatTime(state.duration);
      }
      // Play/pause state — debounce: 1 üst üste aynı state gelmeden değiştirme
      const incomingPlaying = !u.paused && !u.isAd;
      if (incomingPlaying === _lastPollPlaying) {
        _pollCount++;
      } else {
        _lastPollPlaying = incomingPlaying;
        _pollCount = 1;
      }
      if (_pollCount >= 1 && state.playing !== incomingPlaying) {
        state.playing = incomingPlaying;
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
  }

  async function playSong(song: Song) {
    dlog('playSong çağrıldı:', song.id, song.title);

    // History'ye ekle (max 50)
    if (state.currentSong && state.currentSong.id !== song.id) {
      state.history = [state.currentSong, ...state.history.filter((s) => s.id !== song.id)].slice(0, 50);
    }

    state.currentSong = song as QueueItem;
    state.currentTime = 0;
    state.duration = song.duration || 0;

    // Add to recently played
    state.recentlyPlayed = [song, ...state.recentlyPlayed.filter((s) => s.id !== song.id)].slice(0, 100);

    // Update UI
    $('#playerTitle').textContent = song.title;
    $('#playerArtist').textContent = song.artist;
    $('#playerThumb').style.backgroundImage = `url(${song.thumbnail})`;
    updateLikeBtn();

    // Highlight in lists
    $$('.song-row').forEach((r) => {
      r.classList.toggle('playing', (r as HTMLElement).dataset.id === song.id);
    });

    if (!state.isLoggedIn) {
      dlog('Giriş yok, oynatılamıyor');
      showToast('Şarkı çalmak için önce giriş yapın (sol menüden Giriş Yap).', 'warning');
      return;
    }

    // IPC ile gizli pencerede oynat
    dlog('IPC player.play:', song.id);
    state.playing = true;
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
      showToast('Bu şarkı şu anda çalınamıyor, başka bir şarkı deneyin.', 'error');
      state.playing = false;
      updatePlayIcon();
    }

    // Queue index güncelle
    const idx = state.queue.findIndex((s) => s.id === song.id);
    if (idx !== -1) {
      state.queueIndex = idx;
    }

    // Discord Rich Presence
    setDiscordActivity(song.title, song.artist, song.thumbnail);

    // Media session metadata güncelle
    updateMediaSessionMetadata();

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
      startTimestamp: start
    };
    if (state.duration > 0) payload.endTimestamp = start + Math.round(state.duration * 1000);
    if (coverUrl) payload.coverUrl = coverUrl;
    if (album) payload.largeImageText = album;
    // YouTube Music'te Aç butonu
    if (key && key.length === 11) {
      (payload as any).buttons = [{ label: "YouTube Music'te Aç", url: `https://music.youtube.com/watch?v=${key}` }];
    }
    api.discord.setActivity(payload).catch((e: any) => dlog('Discord hatası:', String(e)));
  }

  function clearDiscordTrack() {
    lastDiscordKey = '';
    lastDiscordSentAt = 0;
    api.discord.clearActivity().catch(() => {});
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

    // Repeat: one → mevcut şarkıyı başa sar
    if (state.repeat === 'one') {
      playSong(state.queue[state.queueIndex >= 0 ? state.queueIndex : 0]);
      return;
    }

    if (state.shuffle) {
      // Fisher-Yates shuffle order kullan
      if (state.shuffleOrder.length === 0) {
        state.shuffleOrder = FisherYatesShuffle(state.queue.map((_, i) => i));
      }
      const currentShufflePos = state.shuffleOrder.indexOf(state.queueIndex);
      const nextShufflePos = currentShufflePos + 1;
      if (nextShufflePos < state.shuffleOrder.length) {
        state.queueIndex = state.shuffleOrder[nextShufflePos];
      } else if (state.repeat === 'all') {
        state.shuffleOrder = FisherYatesShuffle(state.queue.map((_, i) => i));
        state.queueIndex = state.shuffleOrder[0];
      } else {
        // Sıra bitti, auto-play dene
        state.playing = false;
        updatePlayIcon();
        return;
      }
    } else {
      state.queueIndex = state.queueIndex + 1;
      if (state.queueIndex >= state.queue.length) {
        if (state.repeat === 'all') {
          state.queueIndex = 0;
        } else {
          // Sıra bitti, auto-play dene
          state.playing = false;
          updatePlayIcon();
          return;
        }
      }
    }
    playSong(state.queue[state.queueIndex]);
  }

  function prevSong() {
    if (!state.queue.length) return;
    if (state.currentTime > 3) {
      api.player.seek(0).catch(() => {});
      return;
    }
    state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
    playSong(state.queue[state.queueIndex]);
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle) {
      state.shuffleOrder = FisherYatesShuffle(state.queue.map((_, i) => i));
    } else {
      state.shuffleOrder = [];
    }
    $('#btnShuffle').classList.toggle('active', state.shuffle);
    api.store.set('shuffle', state.shuffle);
  }

  function toggleRepeat() {
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    state.repeat = modes[(modes.indexOf(state.repeat) + 1) % 3];
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
    // Playing durumu iken ve paused değilse play ikonunu gizle, durak ikonunu göster
    playIcon.style.display = state.playing && !state.paused ? 'none' : 'block';
    pauseIcon.style.display = state.playing && !state.paused ? 'block' : 'none';
  }
  
  // ── Like ───────────────────────────────────
  function toggleLike(id: string) {
    if (state.liked.has(id)) state.liked.delete(id);
    else state.liked.add(id);
    saveLiked();
    updateLikeBtn();
    $$('.like-btn').forEach((btn) => {
      if ((btn as HTMLElement).dataset.id === id) {
        btn.classList.toggle('active', state.liked.has(id));
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', state.liked.has(id) ? 'currentColor' : 'none');
      }
    });
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
  }

  // ── Ad Skip Button ─────────────────────────
  function showAdSkipButton() {
    let btn = document.getElementById('adSkipBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'adSkipBtn';
      btn.textContent = 'Reklamı Geç';
      btn.className = 'ad-skip-btn';
      btn.addEventListener('click', () => {
        api.player.skipAd().catch(() => {});
      });
      document.body.appendChild(btn);
    }
    btn.style.display = 'flex';
  }

  function hideAdSkipButton() {
    const btn = document.getElementById('adSkipBtn');
    if (btn) btn.style.display = 'none';
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

  function closePanels() {
    state.panelOpen = null;
    $$('.panel').forEach((p) => hide(p as HTMLElement));
    hide($('#panelBackdrop'));
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

  async function loadLyrics() {
    if (!state.currentSong) return;
    const body = $('#lyricsBody');
    body.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Yükleniyor...</p></div>';
    const lyrics = await ytLyrics(state.currentSong.id);
    if (lyrics) {
      body.innerHTML = lyrics.split('\n').map((line: string) =>
        `<div class="lyric-line">${line ? escapeHtml(line) : '&nbsp;'}</div>`
      ).join('');
    } else {
      body.innerHTML = '<div class="empty-state"><p class="empty-text">Şarkı sözleri bulunamadı</p></div>';
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
      const currentCtxIdx = state.contextQueue.findIndex((s) => s.id === state.currentSong?.id);
      const upcomingCtx = currentCtxIdx >= 0 ? state.contextQueue.slice(currentCtxIdx + 1) : state.contextQueue;
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
            // Kullanıcı queue'sundan seçildi → userQueue'dan kaldır, context'e ekle
            state.userQueue.splice(idx, 1);
            state.queue = rebuildMergedQueue();
            state.queueIndex = state.queue.findIndex((s) => s.id === song.id);
            playSong(song);
          }
        } else if (type === 'context') {
          const song = state.contextQueue[idx];
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
      container.innerHTML = '<div class="empty-state"><p class="empty-text">İçerik yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edin</p></div>';
      return;
    }

    const songs = data.items.filter((i: any) => i.id) as Song[];
    const cards = data.items.filter((i: any) => i.browseId);

    console.log('[Harmonic] Songs:', songs.length, 'Cards:', cards.length);

    let html = '';

    if (songs.length) {
      html += `<div style="margin-bottom:32px">
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--c-text-0)">Önerilen Şarkılar</h2>
        <div class="song-list">${songs.slice(0, 10).map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div>
      </div>`;
    }

    if (cards.length) {
      html += `<div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;color:var(--c-text-0)">Keşfet</h2>
        <div class="card-grid">${cards.slice(0, 8).map((c: any) => `
          <div class="card" data-browse="${c.browseId}" style="cursor:pointer">
            <img class="card-thumb" src="${c.thumbnail}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${c.title || c.name || ''}</div>
            <div class="card-sub">${c.artist || ''}</div>
          </div>`).join('')}</div>
      </div>`;
    }

    container.innerHTML = html || '<div class="empty-state"><p class="empty-text">İçerik bulunamadı</p></div>';

    // Set queue from songs — sadece şarkı çalmıyorsa VE kuyruk boşsa queue'yu güncelle
    if (songs.length && !state.currentSong && !state.queue.length) {
      setContext(songs.slice(0, 30), 'Önerilen Şarkılar', 'home');
    }

    attachSongEvents(container);

    // Kartlara tıklama özelliği ekle
    container.querySelectorAll('.card[data-browse]').forEach((card) => {
      card.addEventListener('click', async () => {
        const browseId = (card as HTMLElement).dataset.browse;
        if (!browseId) return;
        
        // Yükleniyor göster
        const songListContainer = document.createElement('div');
        songListContainer.innerHTML = '<div class="empty-state"><p class="empty-hint-text">Şarkılar yükleniyor...</p></div>';
        card.parentElement?.appendChild(songListContainer);
        
        try {
          const browseData = await (window as any).api.youtube.browse(browseId);
          if (browseData.items?.length) {
            const browseSongs = browseData.items.filter((i: any) => i.id) as Song[];
            if (browseSongs.length) {
              songListContainer.innerHTML = `<div style="margin-top:16px">
                <h3 style="font-size:16px;margin-bottom:12px;color:var(--c-text-1)">${browseData.title || 'Şarkılar'}</h3>
                <div class="song-list">${browseSongs.map((s: Song, i: number) => songRow(s, i + 1)).join('')}</div>
              </div>`;
              attachSongEvents(songListContainer);
              
              // Queue'yu güncelle
              setContext(browseSongs, browseData.title || 'Şarkılar', 'playlist');
            }
          }
        } catch (err) {
          songListContainer.innerHTML = '<div class="empty-state"><p class="empty-text">İçerik yüklenemedi</p></div>';
        }
      });
    });
    } catch (err) {
      console.error('[Harmonic] loadHome error:', err);
      container.innerHTML = '<div class="empty-state"><p class="empty-text">İçerik yüklenemedi</p><p class="empty-hint-text">Lütfen internet bağlantınızı kontrol edin</p></div>';
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

    if (state.isLoggedIn) {
      try {
        [ytPlaylists, ytArtists, ytAlbums] = await Promise.all([
          api.youtube.libraryPlaylists().catch(() => []),
          api.youtube.libraryArtists().catch(() => []),
          api.youtube.libraryAlbums().catch(() => [])
        ]);
      } catch {}
    }

    if (gen !== state.navGeneration) return; // stale, discard

    let html = '';

    // Son Çalınanlar
    if (localRecent.length) {
      html += `<div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Son Çalınanlar</h3>
        <div class="song-list">${localRecent.slice(0, 20).map((s, i) => songRow(s, i + 1)).join('')}</div>
      </div>`;
    }

    // YouTube Music Playlist'leri
    if (ytPlaylists.length) {
      html += `<div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Oynatma Listeleri</h3>
        <div class="card-grid">${ytPlaylists.map(pl => `
          <div class="card" data-browse="${pl.browseId}" style="cursor:pointer">
            <img class="card-thumb" src="${pl.thumbnail}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${pl.title}</div>
          </div>`).join('')}</div>
      </div>`;
    }

    // Sanatçılar
    if (ytArtists.length) {
      html += `<div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Sanatçılar</h3>
        <div class="card-grid">${ytArtists.map(a => `
          <div class="card" data-browse="${a.browseId}" style="cursor:pointer">
            <img class="card-thumb" src="${a.thumbnail}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${a.name}</div>
          </div>`).join('')}</div>
      </div>`;
    }

    // Albümler
    if (ytAlbums.length) {
      html += `<div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--c-text-1)">Albümler</h3>
        <div class="card-grid">${ytAlbums.map(a => `
          <div class="card" data-browse="${a.browseId}" style="cursor:pointer">
            <img class="card-thumb" src="${a.thumbnail}" alt="" loading="lazy" onerror="this.style.background='var(--c-bg-3)'">
            <div class="card-title">${a.title}</div>
            <div class="card-sub">${a.artist || ''}</div>
          </div>`).join('')}</div>
      </div>`;
    }

    if (!html) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><p class="empty-text">Henüz bir şey eklenmemiş</p><p class="empty-hint-text">Giriş yaparak YouTube Music kütüphanenizi görebilirsiniz</p></div>';
      return;
    }

    container.innerHTML = html;
    attachSongEvents(container);

    // Kartlara tıklama
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
        return state.queue.find((s) => s.id === id) || state.recentlyPlayed.find((s) => s.id === id);
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
    attachSongEvents(container);
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
          if (state.duration) {
            const step = e.shiftKey ? 10 : 5;
            api.player.seek(Math.max(0, state.currentTime - step)).catch(() => {});
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (state.duration) {
            const step = e.shiftKey ? 10 : 5;
            api.player.seek(Math.min(state.duration, state.currentTime + step)).catch(() => {});
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          state.volume = Math.min(100, state.volume + 5);
          if (state.volume > 0) state.lastVolume = state.volume;
          ($('#volumeSlider') as HTMLInputElement).value = String(state.volume);
          ($('#volumeSlider') as HTMLInputElement).style.setProperty('--vol-pct', `${state.volume}%`);
          api.player.setVolume(state.volume / 100).catch(() => {});
          api.store.set('volume', state.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          state.volume = Math.max(0, state.volume - 5);
          if (state.volume > 0) state.lastVolume = state.volume;
          ($('#volumeSlider') as HTMLInputElement).value = String(state.volume);
          ($('#volumeSlider') as HTMLInputElement).style.setProperty('--vol-pct', `${state.volume}%`);
          api.player.setVolume(state.volume / 100).catch(() => {});
          api.store.set('volume', state.volume);
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
      <a class="nav-link" href="#" data-pl="${pl.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>${pl.name}</span>
      </a>
    `).join('');
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

  function setupDiscordGateway() {
    const tokenInput = $('#discordTokenInput') as HTMLInputElement;
    const connectBtn = $('#btnDiscordGwConnect');
    const disconnectBtn = $('#btnDiscordGwDisconnect');
    const statusEl = $('#discordConnectionStatus');

    // Kayıtlı token'ı yükle
    api.store.get('discordToken').then((t: string) => {
      if (t) {
        tokenInput.value = t;
        // Otomatik bağlan
        statusEl.textContent = 'Bağlanıyor...';
        api.discord.gwConnect(t).then((ok: boolean) => {
          statusEl.textContent = ok ? '✓ Bağlı (kapak aktif)' : '✗ Bağlanamadı';
          connectBtn.style.display = ok ? 'none' : 'flex';
          disconnectBtn.style.display = ok ? 'flex' : 'none';
        });
      }
    });

    connectBtn.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) {
        showToast('Discord token girin.', 'warning');
        return;
      }
      statusEl.textContent = 'Bağlanıyor...';
      (connectBtn as HTMLButtonElement).disabled = true;
      try {
        const ok = await api.discord.gwConnect(token);
        if (ok) {
          await api.store.set('discordToken', token);
          statusEl.textContent = '✓ Bağlı (kapak aktif)';
          connectBtn.style.display = 'none';
          disconnectBtn.style.display = 'flex';
          showToast('Discord Gateway bağlandı. Şarkı kapağı artık görünmeli.', 'success');
        } else {
          statusEl.textContent = '✗ Bağlanamadı — token geçersiz veya Discord kapalı';
          showToast('Discord Gateway bağlanamadı.', 'error');
        }
      } catch (e: any) {
        statusEl.textContent = '✗ Hata: ' + (e?.message || String(e));
      }
      (connectBtn as HTMLButtonElement).disabled = false;
    });

    disconnectBtn.addEventListener('click', async () => {
      await api.discord.gwDisconnect();
      await api.store.set('discordToken', '');
      tokenInput.value = '';
      statusEl.textContent = '—';
      connectBtn.style.display = 'flex';
      disconnectBtn.style.display = 'none';
      showToast('Discord Gateway kesildi.', 'info');
    });
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
    setupDiscordGateway();
    setupKeyboardShortcuts();
    setupMediaSession();
    setupLibraryTabs();

    // Check auth state
    await checkAuthState();

    // Load saved liked songs
    const savedLikes: string[] = await api.store.get('likedSongs') || [];
    savedLikes.forEach((id) => state.liked.add(id));

    // Load saved volume
    const savedVol = await api.store.get('volume');
    if (savedVol != null) {
      // Eski format: 0-1 arası (0.8) → yeni format: 0-100 (80)
      state.volume = savedVol <= 1 ? Math.round(savedVol * 100) : savedVol;
      const slider = $('#volumeSlider') as HTMLInputElement;
      slider.value = String(state.volume);
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
})();
