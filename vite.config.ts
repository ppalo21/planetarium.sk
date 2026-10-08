import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base './' = appka funguje v akomkoľvek podpriečinku (GitHub Pages /planetarium.sk/)
// basicSsl = lokálny vývoj cez https, aby WebXR fungovalo aj z PC v sieti (npm run dev)
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, assetsDir: 'js' },
  server: { host: true }
});
