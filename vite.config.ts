import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// base './' = appka funguje v akomkoľvek podpriečinku (GitHub Pages /planetarium.sk/)
// basicSsl = lokálny vývoj cez https, aby WebXR fungovalo aj z PC v sieti (npm run dev)
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, assetsDir: 'js' },
  server: { host: true }
});
