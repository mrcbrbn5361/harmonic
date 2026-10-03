// Tek kaynak: istemci kimlikleri (bk. ANALIZ-RAPORU M-12).
// YouTube tarafı eski istemcileri düşürdüğünde SADECE burası güncellenir.
import { app } from 'electron';

export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const YT_CLIENT_VERSION = '1.20241001.00.00';

export function appVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return '1.0.2';
  }
}

export function lrclibUA(): string {
  return `Harmonic/${appVersion()} (https://github.com/mrcbrbn5361/harmonic)`;
}
