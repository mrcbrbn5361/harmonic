// ytmdesktop2 volumeRatio uyarlaması — Harmonic: loudness normalization toggle
import Store from 'electron-store';
const s = new Store<{volumeRatioEnabled:boolean}>({ name:'harmonic-settings', defaults:{ volumeRatioEnabled:false }});
export class VolumeRatioProvider {
  isEnabled(){ return !!s.get('volumeRatioEnabled'); }
  setEnabled(v:boolean){ s.set('volumeRatioEnabled', v); }
  // NOT: ses eğrisi stream-resolver.setVolume içindeki pow(effective, 0.85) ile uygulanır.
  // Eski apply() (window.__harmonicGain yazan ölü gain-node denemesi) P3-01 ile silindi.
}
export const volumeRatioProvider = new VolumeRatioProvider();
