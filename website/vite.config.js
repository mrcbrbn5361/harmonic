import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ozellikler: resolve(__dirname, 'ozellikler.html'),
        indir: resolve(__dirname, 'indir.html'),
        sss: resolve(__dirname, 'sss.html')
      }
    }
  },
  server: {
    port: 3000,
    strictPort: true
  }
});
