import { describe, expect, it } from 'vitest';
import {
  HOME_CARDS_LIMIT,
  HOME_SONGS_LIMIT,
  HOME_QUEUE_LIMIT,
  RECENT_SONGS_LIMIT,
  HOME_EMPTY_HTML,
  BROWSE_EMPTY_HTML,
  LIKED_EMPTY_HTML,
  LIBRARY_ERROR_HTML,
  LIBRARY_EMPTY_HTML,
  partitionSongs,
  partitionBrowseCards,
  takeFirst,
  shouldInitHomeQueue,
  isStaleContent,
  songCountLabel,
  cardTitleOf,
  buildMediaCard,
  buildCardFor,
  buildDiscoverSection,
  buildSongSection,
  resolveHomeHtml,
  resolveBrowseContainerId,
  resolveBrowseBack,
  buildBrowseHeader,
  buildBrowseSongsBody,
  buildBrowseCardsBody,
  normalizeLibraryTab,
  shouldShowRecentSection,
  shouldShowPlaylistSection,
  shouldShowAlbumSection,
  shouldShowArtistsSection,
  resolveLibraryEmpty,
  resolveLocalLiked,
  buildLikedHtml,
} from './content';

describe('content limits', () => {
  it('exposes app.ts slice limits', () => {
    expect(HOME_CARDS_LIMIT).toBe(8);
    expect(HOME_SONGS_LIMIT).toBe(10);
    expect(HOME_QUEUE_LIMIT).toBe(30);
    expect(RECENT_SONGS_LIMIT).toBe(30);
  });
});

describe('partitionSongs / partitionBrowseCards', () => {
  it('keeps items with id / browseId', () => {
    const items = [{ id: 'a' }, { id: '' }, { browseId: 'b' }, {}];
    expect(partitionSongs(items as never[]).length).toBe(1);
    expect(partitionBrowseCards(items as never[]).length).toBe(1);
  });
  it('handles empty input', () => {
    expect(partitionSongs([])).toEqual([]);
    expect(partitionBrowseCards([])).toEqual([]);
  });
});

describe('takeFirst', () => {
  it('slices to n', () => {
    expect(takeFirst([1, 2, 3, 4], 2)).toEqual([1, 2]);
    expect(takeFirst([1], 8)).toEqual([1]);
  });
});

describe('shouldInitHomeQueue', () => {
  it('requires songs + no current + empty queue', () => {
    expect(shouldInitHomeQueue(5, false, 0)).toBe(true);
    expect(shouldInitHomeQueue(0, false, 0)).toBe(false);
    expect(shouldInitHomeQueue(5, true, 0)).toBe(false);
    expect(shouldInitHomeQueue(5, false, 3)).toBe(false);
  });
});

describe('isStaleContent', () => {
  it('detects generation drift', () => {
    expect(isStaleContent(1, 2)).toBe(true);
    expect(isStaleContent(2, 2)).toBe(false);
  });
});

describe('songCountLabel / cardTitleOf', () => {
  it('labels counts', () => {
    expect(songCountLabel(4)).toBe('4 şarkı');
    expect(songCountLabel(0)).toBe('');
  });
  it('prefers title over name', () => {
    expect(cardTitleOf({ title: 'T', name: 'N' })).toBe('T');
    expect(cardTitleOf({ name: 'N' })).toBe('N');
    expect(cardTitleOf({})).toBe('');
  });
});

describe('buildMediaCard / buildCardFor', () => {
  it('omits sub div when sub is undefined (YT list cards)', () => {
    const html = buildMediaCard('br1', 't.jpg', 'Liste', undefined);
    expect(html).toContain('data-browse="br1"');
    expect(html).not.toContain('card-sub');
  });
  it('keeps sub div for empty artist (home cards) and escapes', () => {
    const html = buildMediaCard('br1', 't.jpg', '<T>', '');
    expect(html).toContain('card-sub');
    expect(html).toContain('&lt;T&gt;');
  });
  it('buildCardFor resolves title + sub', () => {
    const html = buildCardFor({ browseId: 'b', thumbnail: 't', title: 'Hi', artist: 'A' }, 'A');
    expect(html).toContain('Hi');
    expect(html).toContain('card-sub');
  });
});

describe('sections', () => {
  it('wraps discover grid', () => {
    expect(buildDiscoverSection('<x/>')).toContain('Keşfet');
  });
  it('builds both song section variants', () => {
    const home = buildSongSection('Önerilen Şarkılar', '<r/>');
    expect(home).toContain('<h2');
    expect(home).toContain('<r/>');
    const lib = buildSongSection('Son Çalınanlar', '<r/>');
    expect(lib).toContain('<h3');
    expect(lib).toContain('margin-bottom:24px');
  });
  it('falls back on empty home html', () => {
    expect(resolveHomeHtml('<div/>')).toBe('<div/>');
    expect(resolveHomeHtml('')).toBe(HOME_EMPTY_HTML);
    expect(BROWSE_EMPTY_HTML).toContain('İçerik bulunamadı');
  });
});

describe('browse navigation', () => {
  it('resolves container ids', () => {
    expect(resolveBrowseContainerId('search')).toBe('searchResults');
    expect(resolveBrowseContainerId('library')).toBe('libraryContent');
    expect(resolveBrowseContainerId('home')).toBe('homeContent');
    expect(resolveBrowseContainerId('other')).toBe('homeContent');
  });
  it('resolves back action', () => {
    expect(resolveBrowseBack(true, 'search')).toBe('callback');
    expect(resolveBrowseBack(false, 'search')).toBe('search');
    expect(resolveBrowseBack(false, 'library')).toBe('library');
    expect(resolveBrowseBack(false, 'home')).toBe('home');
  });
  it('builds header with and without thumb', () => {
    const withThumb = buildBrowseHeader('Liste', 'img.jpg', 3);
    expect(withThumb).toContain('btnBrowseBack');
    expect(withThumb).toContain('3 şarkı');
    expect(withThumb).toContain('img.jpg');
    const without = buildBrowseHeader('Liste', '', 0);
    expect(without).not.toContain('<img');
    expect(buildBrowseSongsBody('<r/>')).toContain('song-list');
    expect(buildBrowseCardsBody('<c/>')).toContain('card-grid');
  });
});

describe('library tabs', () => {
  it('normalizes tabs', () => {
    expect(normalizeLibraryTab('recent')).toBe('recent');
    expect(normalizeLibraryTab('songs')).toBe('songs');
    expect(normalizeLibraryTab('playlists')).toBe('playlists');
    expect(normalizeLibraryTab('albums')).toBe('albums');
    expect(normalizeLibraryTab('bogus')).toBe('recent');
    expect(normalizeLibraryTab(undefined)).toBe('recent');
  });
  it('gates sections', () => {
    expect(shouldShowRecentSection('recent')).toBe(true);
    expect(shouldShowRecentSection('songs')).toBe(true);
    expect(shouldShowRecentSection('playlists')).toBe(false);
    expect(shouldShowPlaylistSection('playlists')).toBe(true);
    expect(shouldShowPlaylistSection('recent')).toBe(false);
    expect(shouldShowAlbumSection('albums')).toBe(true);
    expect(shouldShowAlbumSection('recent')).toBe(false);
    expect(shouldShowArtistsSection(2, 'albums')).toBe(true);
    expect(shouldShowArtistsSection(0, 'albums')).toBe(false);
    expect(shouldShowArtistsSection(2, 'playlists')).toBe(false);
  });
  it('resolves empty kind', () => {
    expect(resolveLibraryEmpty(true, false, false)).toBe('content');
    expect(resolveLibraryEmpty(false, true, true)).toBe('error');
    expect(resolveLibraryEmpty(false, true, false)).toBe('empty');
    expect(resolveLibraryEmpty(false, false, false)).toBe('empty');
    expect(LIBRARY_ERROR_HTML).toContain('Kütüphane yüklenemedi');
    expect(LIBRARY_EMPTY_HTML).toContain('henüz içerik yok');
  });
});

describe('liked', () => {
  it('resolves local likes skipping misses', () => {
    const out = resolveLocalLiked(['a', 'b'], (id) => (id === 'a' ? { id } : undefined));
    expect(out).toEqual([{ id: 'a' }]);
    expect(resolveLocalLiked([], () => undefined)).toEqual([]);
  });
  it('combines sections or falls back', () => {
    const both = buildLikedHtml('<y/>', '<l/>');
    expect(both).toContain('YouTube Music Beğenilenler');
    expect(both).toContain('Yerel Beğeniler');
    expect(buildLikedHtml('<y/>', '')).toContain('YouTube Music Beğenilenler');
    expect(buildLikedHtml('', '<l/>')).toContain('Yerel Beğeniler');
    expect(buildLikedHtml('', '')).toBe(LIKED_EMPTY_HTML);
  });
});
