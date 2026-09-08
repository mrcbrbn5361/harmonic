// ytmdesktop2 lyrics provider uyarlaması — enable/disable + fetch
import Store from 'electron-store';
const s = new Store<{lyricsEnabled:boolean}>({ name:'harmonic-settings', defaults:{ lyricsEnabled:true }});
export class LyricsProvider {
  isEnabled(){ return s.get('lyricsEnabled')!==false; }
  setEnabled(v:boolean){ s.set('lyricsEnabled', v); }
  async fetch(videoId:string, ytApi:any){
    if(!this.isEnabled()) return null;
    try{ return await ytApi.getLyrics(videoId);}catch{ return null; }
  }
}
export const lyricsProvider = new LyricsProvider();
