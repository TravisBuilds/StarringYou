import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages base path
  base: '/StarringYou/',
  
  build: {
    // Ensure assets are referenced relatively
    assetsDir: 'assets',
    
    // Output to dist/
    outDir: 'dist',
    
    // Generate source maps for debugging
    sourcemap: false,
    
    // Optimize chunks
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@mediapipe/tasks-vision')) {
            return 'mediapipe';
          }
          if (id.includes('jszip')) {
            return 'jszip';
          }
        }
      }
    }
  },
  
  server: {
    port: 43123,
    strictPort: true
  }
});
