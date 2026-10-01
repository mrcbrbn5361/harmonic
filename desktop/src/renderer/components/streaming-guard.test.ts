import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/* B3: streaming-only grep-gate.
   Fonksiyonel download/offline/ytdlp kodu yasak; tek izinli eşleşme
   scope-header yorumu ("kapsam ...") içindeki kelimelerdir. */

const COMPONENTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN =
  /ytdlp|yt-dlp|downloadTrack|offline-cache|offlineCache|offline\s+download|download\s+queue/i;
const DOWNLOAD_WORD = /download/i;
const ALLOW = /kapsam/i;

function componentSources(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(dir, f));
}

describe('streaming-only guard (B3)', () => {
  it('fonksiyonel download/offline/ytdlp kodu yok (scope-header hariç)', () => {
    const files = componentSources(COMPONENTS_DIR);
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (ALLOW.test(line)) return;
        if (FORBIDDEN.test(line) || DOWNLOAD_WORD.test(line)) {
          violations.push(`${path.basename(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
