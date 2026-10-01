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
