import { describe, it, expect } from 'vitest';
import type { Song } from './state';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_SUGGEST_LEN,
  SEARCH_MIN_DIRECT_LEN,
  normalizeQuery,
  isEmptyQuery,
  shouldSuggestSearch,
  shouldDirectSearch,
  shouldClearOnEmpty,
  nextSearchId,
  isStaleSearch,
  buildSearchCache,
  hasAnyResults,
  isSearchSectionVisible,
  normalizeSearchFilter,
  resolveNavLoader,
  nextNavGeneration,
  buildSuggestionListHtml,
  buildSearchEmptyHtml,
  buildSearchLoadingHtml,
  buildSearchNoResultsHtml,
  buildSearchErrorHtml,
  buildAlbumCardHtml,
  buildArtistCardHtml,
  buildAlbumsSectionHtml,
  buildArtistsSectionHtml,
  resolveSearchSections,
} from './search-nav';

function mkSong(id: string): Song {
  return {
    id,
    title: `T-${id}`,
    artist: 'A',
    artistId: 'a1',
    thumbnail: 'http://img/x.jpg',
    duration: 200,
  };
}

describe('search sabitleri (setupSearch debounce ile birebir)', () => {
  it('200ms debounce, 1/2 karakter eşikleri', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(200);
    expect(SEARCH_MIN_SUGGEST_LEN).toBe(1);
    expect(SEARCH_MIN_DIRECT_LEN).toBe(2);
  });
});

describe('normalizeQuery / isEmptyQuery', () => {
  it('trim uygular', () => {
    expect(normalizeQuery('  hello  ')).toBe('hello');
    expect(normalizeQuery('x')).toBe('x');
  });
  it('boş ve boşluk sorguyu yakalar', () => {
    expect(isEmptyQuery('')).toBe(true);
    expect(isEmptyQuery('   ')).toBe(true);
    expect(isEmptyQuery('  x ')).toBe(false);
  });
});

describe('shouldSuggestSearch / shouldDirectSearch / shouldClearOnEmpty', () => {
  it('1+ karakter öneri, 2+ karakter doğrudan arama', () => {
    expect(shouldSuggestSearch('')).toBe(false);
    expect(shouldSuggestSearch('a')).toBe(true);
    expect(shouldDirectSearch('a')).toBe(false);
    expect(shouldDirectSearch('ab')).toBe(true);
    expect(shouldDirectSearch('')).toBe(false);
  });
  it('yalnızca tamamen boşken temizler', () => {
    expect(shouldClearOnEmpty('')).toBe(true);
    expect(shouldClearOnEmpty('a')).toBe(false);
  });
});

describe('nextSearchId / isStaleSearch (doSearch yarış guard)', () => {
  it('sayacı bir artırır', () => {
    expect(nextSearchId(0)).toBe(1);
    expect(nextSearchId(41)).toBe(42);
  });
  it('eşleşmeyen id stale sayılır', () => {
    expect(isStaleSearch(1, 1)).toBe(false);
    expect(isStaleSearch(1, 2)).toBe(true);
  });
});

describe('buildSearchCache (tıklama önbelleği)', () => {
  it('songs + videos birleşir, albums katılmaz', () => {
    const s1 = mkSong('s1');
    const v1 = mkSong('v1');
    expect(buildSearchCache({ songs: [s1], videos: [v1], albums: [{ id: 'a1' }] })).toEqual([s1, v1]);
  });
  it('eksik alanlar boş diziye düşer', () => {
    expect(buildSearchCache({})).toEqual([]);
    expect(buildSearchCache({ songs: [mkSong('s1')] })).toHaveLength(1);
  });
});

describe('hasAnyResults (boş-sonuç guard)', () => {
  it('songs/videos/albums varsa true', () => {
    expect(hasAnyResults({ songs: [mkSong('s1')] })).toBe(true);
    expect(hasAnyResults({ videos: [mkSong('v1')] })).toBe(true);
    expect(hasAnyResults({ albums: [{ id: 'a' }] })).toBe(true);
  });
  it('boş veya yalnızca artists varsa false (app.ts ile birebir)', () => {
    expect(hasAnyResults({})).toBe(false);
    expect(hasAnyResults({ songs: [], videos: [], albums: [] })).toBe(false);
    expect(hasAnyResults({ artists: [{ id: 'x' }] })).toBe(false);
  });
});

describe('isSearchSectionVisible / normalizeSearchFilter (chip filtresi)', () => {
  it('all her bölümü açar, diğerleri yalnızca eşleşeni', () => {
    expect(isSearchSectionVisible('all', 'songs')).toBe(true);
    expect(isSearchSectionVisible('songs', 'songs')).toBe(true);
    expect(isSearchSectionVisible('songs', 'videos')).toBe(false);
    expect(isSearchSectionVisible('albums', 'artists')).toBe(false);
  });
  it('geçerli filtre aynen, boş/bilinmeyen all olur', () => {
    expect(normalizeSearchFilter('songs')).toBe('songs');
    expect(normalizeSearchFilter('videos')).toBe('videos');
    expect(normalizeSearchFilter('albums')).toBe('albums');
    expect(normalizeSearchFilter('artists')).toBe('artists');
    expect(normalizeSearchFilter('all')).toBe('all');
    expect(normalizeSearchFilter(null)).toBe('all');
    expect(normalizeSearchFilter(undefined)).toBe('all');
    expect(normalizeSearchFilter('')).toBe('all');
    expect(normalizeSearchFilter('bogus')).toBe('all');
  });
});

describe('resolveNavLoader / nextNavGeneration (navigateTo)', () => {
  it('bilinen sayfayı yükleyiciye çözer', () => {
    expect(resolveNavLoader('home')).toBe('home');
    expect(resolveNavLoader('library')).toBe('library');
    expect(resolveNavLoader('liked')).toBe('liked');
  });
  it('bilinmeyen sayfada yükleme yok', () => {
    expect(resolveNavLoader('search')).toBeNull();
    expect(resolveNavLoader('')).toBeNull();
  });
  it('nesil sayacı bir artar', () => {
    expect(nextNavGeneration(0)).toBe(1);
    expect(nextNavGeneration(7)).toBe(8);
  });
});

describe('G3 builders (setupSearch/doSearch HTML, app.ts ile birebir)', () => {
  it('öneri listesi escape uygular ve data-q taşır', () => {
    const html = buildSuggestionListHtml(['hello', '<b>x</b>']);
    expect(html).toContain('data-q="hello"');
    expect(html).toContain('<span>hello</span>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(buildSuggestionListHtml([])).toBe('');
  });
  it('boş/yükleniyor/sonuç-yok/hata HTML sabitleri app.ts ile birebir', () => {
    expect(buildSearchEmptyHtml()).toContain('Müzik aramaya başlayın');
    expect(buildSearchEmptyHtml()).toContain('Sanatçı, şarkı veya albüm adı yazın');
    expect(buildSearchLoadingHtml()).toContain('Aranıyor...');
    expect(buildSearchNoResultsHtml()).toContain('Sonuç bulunamadı');
    expect(buildSearchErrorHtml()).toContain('Tekrar Dene');
    expect(buildSearchErrorHtml()).toContain('btn-retry');
  });
  it('albüm kartı escape uygular, boş artist güvenli', () => {
    const html = buildAlbumCardHtml({ browseId: 'br1', title: 'T<1>', thumbnail: 'http://img/a.jpg', artist: 'Art&Co' });
    expect(html).toContain('data-browse="br1"');
    expect(html).toContain('T&lt;1&gt;');
    expect(html).toContain('Art&amp;Co');
    expect(buildAlbumCardHtml({ browseId: 'b', title: 't', thumbnail: 'u' })).toContain('card-sub');
  });
  it('sanatçı kartı name alanını kullanır', () => {
    const html = buildArtistCardHtml({ browseId: 'ar1', name: 'N<ame>', thumbnail: 'http://img/n.jpg' });
    expect(html).toContain('data-browse="ar1"');
    expect(html).toContain('N&lt;ame&gt;');
  });
  it('bölüm sarmalayıcılar başlık + grid içerir', () => {
    const al = buildAlbumsSectionHtml([{ browseId: 'b1', title: 'A', thumbnail: 't' }]);
    expect(al).toContain('Albümler');
    expect(al).toContain('card-grid');
    expect(al).toContain('data-browse="b1"');
    expect(buildAlbumsSectionHtml([])).toContain('Albümler');
    const ar = buildArtistsSectionHtml([{ browseId: 's1', name: 'S', thumbnail: 't' }]);
    expect(ar).toContain('Sanatçılar');
    expect(ar).toContain('data-browse="s1"');
  });
});

describe('resolveSearchSections (doSearch bölüm dalları)', () => {
  it('sonuç + all filtresi tüm bölümleri açar', () => {
    const r = resolveSearchSections(
      { songs: [mkSong('s1')], videos: [mkSong('v1')], albums: [{ id: 'a' }], artists: [{ id: 'x' }] },
      'all',
    );
    expect(r).toEqual({ songs: true, videos: true, albums: true, artists: true });
  });
  it('filtre eşleşmeyeni kapatır, boş sonuç kapatır', () => {
    const r = resolveSearchSections({ songs: [mkSong('s1')], videos: [mkSong('v1')] }, 'songs');
    expect(r.songs).toBe(true);
    expect(r.videos).toBe(false);
    expect(r.albums).toBe(false);
    expect(resolveSearchSections({}, 'all')).toEqual({ songs: false, videos: false, albums: false, artists: false });
  });
});
