import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'extension/onboarding',
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'extension-src/onboarding/onboarding.html'),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});
