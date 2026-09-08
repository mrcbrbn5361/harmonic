// ytmdesktop2 volumeRatio uyarlaması — Harmonic: loudness normalization toggle
import Store from 'electron-store';
const s = new Store<{volumeRatioEnabled:boolean}>({ name:'harmonic-settings', defaults:{ volumeRatioEnabled:false }});
export class VolumeRatioProvider {
  isEnabled(){ return !!s.get('volumeRatioEnabled'); }
  setEnabled(v:boolean){ s.set('volumeRatioEnabled', v); }
  // YTM webview'de gain node ile normalize — stream-resolver üzerinden komut
  apply(win: Electron.BrowserWindow, enabled:boolean){
    const script = enabled ? `try{window.__harmonicGain=1.2}catch{}` : `try{window.__harmonicGain=1}catch{}`;
    win.webContents.executeJavaScript(script).catch(()=>{});
  }
}
export const volumeRatioProvider = new VolumeRatioProvider();
