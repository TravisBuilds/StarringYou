import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'extension/dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'extension/offscreen/offscreen.js'),
      name: 'offscreen',
      fileName: 'offscreen',
      formats: ['es']
    },
    rollupOptions: {
      output: {
        entryFileNames: 'offscreen.js'
      }
    }
  }
});
