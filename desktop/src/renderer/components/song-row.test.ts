import { describe, it, expect } from 'vitest';
import type { QueueItem, Song } from './state';
import {
  findSongIn,
  buildSongRow,
  isHomeOrSearchContext,
  filterRadioRecs,
  buildPlaybackContext,
} from './song-row';

function mkSong(over: Partial<Song> = {}): Song {
  return {
    id: 's1',
    title: 'Title <b>',
    artist: 'Artist & Co',
    artistId: 'a1',
    thumbnail: 'http://img/x.jpg',
    duration: 125,
    ...over,
  };
}

describe('findSongIn öncelik sırası (app.ts findSong ile birebir)', () => {
  const current = { ...mkSong({ id: 'cur' }), } as QueueItem;
  const reg = { ...mkSong({ id: 'reg', title: 'Reg' }) };
  const q = { ...mkSong({ id: 'q', title: 'Queue' }) } as QueueItem;
  const liked: Song = { ...mkSong({ id: 'liked', title: 'Liked' }) };
  const searched: Song = { ...mkSong({ id: 's', title: 'Search' }) };
  const lookup = {
    currentSong: current,
    registryHas: (id: string) => id === 'reg',
    registryGet: (id: string) => (id === 'reg' ? reg : undefined),
    queue: [q],
    likedMap: { liked },
    lastSearchResults: [searched],
  };

  it('id yoksa undefined döner', () => {
    expect(findSongIn(lookup, undefined)).toBeUndefined();
    expect(findSongIn(lookup, '')).toBeUndefined();
  });

  it('currentSong önceliklidir', () => {
    expect(findSongIn(lookup, 'cur')).toBe(current);
  });

  it('registry → queue → likedMap → lastSearch sırası korunur', () => {
    expect(findSongIn(lookup, 'reg')).toBe(reg);
    expect(findSongIn(lookup, 'q')).toBe(q);
    expect(findSongIn(lookup, 'liked')).toBe(liked);
    expect(findSongIn(lookup, 's')).toBe(searched);
  });

  it('bulunamazsa undefined döner', () => {
    expect(findSongIn(lookup, 'yok')).toBeUndefined();
  });

  it('registry çakışmasında registry kazanır (queue ile aynı id)', () => {
    const both = {
      ...lookup,
      registryHas: () => true,
      registryGet: () => reg,
      queue: [{ ...mkSong({ id: 'reg', title: 'Q' }) } as QueueItem],
    };
    expect(findSongIn(both, 'reg')).toBe(reg);
  });
});

describe('buildSongRow (app.ts songRow HTML ile birebir)', () => {
  it('temel satır: numara, başlık, sanatçı, süre içerir; kaçış uygular', () => {
    const html = buildSongRow(mkSong(), { isPlaying: false, isLiked: false, num: 3 });
    expect(html).toContain('class="song-row"');
    expect(html).toContain('<span class="song-num">3</span>');
    expect(html).toContain('Title &lt;b&gt;');
    expect(html).toContain('Artist &amp; Co');
    expect(html).toContain('2:05');
    expect(html).toContain('data-id="s1"');
    expect(html).not.toContain('playing');
  });

  it('playing/liked dalları class ve fill üretir', () => {
    const html = buildSongRow(mkSong(), { isPlaying: true, isLiked: true });
    expect(html).toContain('song-row playing');
    expect(html).toContain('like-btn active');
    expect(html).toContain('fill="currentColor"');
  });

  it('albüm varsa subtitle "sanatçı · albüm" olur, yoksa yalnız sanatçı', () => {
    const withAlbum = buildSongRow(mkSong({ album: 'Alb <x>' }), { isPlaying: false, isLiked: false });
    expect(withAlbum).toContain('Artist &amp; Co · Alb &lt;x&gt;');
    const withoutAlbum = buildSongRow(mkSong(), { isPlaying: false, isLiked: false });
    expect(withoutAlbum).toContain('<div class="song-artist">Artist &amp; Co</div>');
  });

  it('num verilmezse song-num span çıkmaz', () => {
    expect(buildSongRow(mkSong(), { isPlaying: false, isLiked: false })).not.toContain('song-num');
  });

  it('id/thumbnail kaçışlanır', () => {
    const html = buildSongRow(mkSong({ id: 'a"b', thumbnail: 'x"y' }), { isPlaying: false, isLiked: false });
    expect(html).toContain('data-id="a&quot;b"');
    expect(html).toContain('src="x&quot;y"');
  });
});

describe('isHomeOrSearchContext (radyo yönlendirme kararı)', () => {
  const base = { inSearchResults: false, inHomeContent: false, page: 'library' };
  it('contextType radio ise true', () => {
    expect(isHomeOrSearchContext('radio', base)).toBe(true);
  });
  it('search/home kapsayıcı veya sayfası true üretir', () => {
    expect(isHomeOrSearchContext('playlist', { ...base, inSearchResults: true })).toBe(true);
    expect(isHomeOrSearchContext('playlist', { ...base, inHomeContent: true })).toBe(true);
    expect(isHomeOrSearchContext(undefined, { ...base, page: 'search' })).toBe(true);
    expect(isHomeOrSearchContext(undefined, { ...base, page: 'home' })).toBe(true);
  });
  it('albüm/playlist bağlamında false', () => {
    expect(isHomeOrSearchContext('playlist', base)).toBe(false);
    expect(isHomeOrSearchContext('album', base)).toBe(false);
    expect(isHomeOrSearchContext(undefined, base)).toBe(false);
  });
});

describe('filterRadioRecs', () => {
  it('tıklanan şarkıyı hariç tutar', () => {
    const items = [mkSong({ id: 'a' }), mkSong({ id: 'b' }), mkSong({ id: 'c' })];
    const out = filterRadioRecs(items, 'b');
    expect(out.map((s) => s.id)).toEqual(['a', 'c']);
  });
  it('boş listede boş döner', () => {
    expect(filterRadioRecs([], 'x')).toEqual([]);
  });
});

describe('buildPlaybackContext (normal bağlam kuyruk dilimi)', () => {
  const songs: Record<string, Song> = {
    a: mkSong({ id: 'a' }),
    b: mkSong({ id: 'b' }),
    c: mkSong({ id: 'c' }),
  };
  const find = (id: string | undefined) => (id ? songs[id] : undefined);

  it('tıklanan konumu clickedIdx olarak işaretler', () => {
    const ctx = buildPlaybackContext(['a', 'b', 'c'], find, 'b');
    expect(ctx.songs.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(ctx.clickedIdx).toBe(1);
  });

  it('bulunamayan satırlar atlanır, idx kaymaz', () => {
    const ctx = buildPlaybackContext(['a', 'yok', 'c'], find, 'c');
    expect(ctx.songs.map((s) => s.id)).toEqual(['a', 'c']);
    expect(ctx.clickedIdx).toBe(1);
  });

  it('tıklanan bulunamazsa idx 0 kalır', () => {
    const ctx = buildPlaybackContext(['a', 'b'], find, 'zzz');
    expect(ctx.clickedIdx).toBe(0);
    expect(ctx.songs).toHaveLength(2);
  });
});
