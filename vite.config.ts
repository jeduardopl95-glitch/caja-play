import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), {
      name: 'caja-play-offline',
      apply: 'build',
      generateBundle(_options, bundle) {
        const assets = ['/index.html', '/caja-play.svg', ...Object.keys(bundle).filter(name => name.startsWith('assets/')).map(name => '/' + name)];
        const worker = readFileSync('src/offline.js', 'utf8');
        const version = createHash('sha256').update(JSON.stringify(assets)).update(worker)
          .update(readFileSync('index.html')).update(readFileSync('public/caja-play.svg')).digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'offline.js', source:
          `const version = ${JSON.stringify(version)};\nconst assets = ${JSON.stringify(assets)};\n${worker}` });
      },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
