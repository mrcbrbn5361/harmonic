// Merkezi loglama (bk. ANALIZ-RAPORU M-10).
// Üretimde debug gizli, warn/error her zaman görünür.
// Debug'ı açmak: HARMONIC_DEBUG=1 ortam değişkeni veya --debug argümanı.
const DEBUG: boolean = (() => {
  try {
    return process.env.HARMONIC_DEBUG === '1' || process.argv.includes('--debug');
  } catch {
    return false;
  }
})();

export const logger = {
  debug(...args: unknown[]): void {
    if (DEBUG) console.log(...args);
  },
  info(...args: unknown[]): void {
    console.log(...args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  }
};
