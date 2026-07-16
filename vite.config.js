import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    open: true,
    proxy: {
      '/api-opencode': {
        target: 'https://opencode.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-opencode/, '')
      },
      '/api-gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-gemini/, '')
      },
      '/api-openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-openai/, '')
      },
      '/api-mistral': {
        target: 'https://api.mistral.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-mistral/, '')
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});
