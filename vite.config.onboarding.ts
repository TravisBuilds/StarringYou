import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'extension/onboarding',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        onboarding: resolve(__dirname, 'extension-src/onboarding/onboarding.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});
