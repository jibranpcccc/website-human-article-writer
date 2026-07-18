import { defineConfig } from 'vite';

const bridgePort = process.env.BRIDGE_PORT || process.env.BIGPICKLE_PORT || 19322;
const bridgeHost = process.env.BRIDGE_HOST || '127.0.0.1';
const vitePort = parseInt(process.env.VITE_PORT || '19323', 10);
const viteHost = process.env.VITE_HOST || '127.0.0.1';

export default defineConfig({
  server: {
    host: viteHost,
    port: vitePort,
    strictPort: true,
    open: false,
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
      },
      '/api/bigpickle': {
        target: `http://${bridgeHost}:${bridgePort}`,
        changeOrigin: true
      },
      '/health': {
        target: `http://${bridgeHost}:${bridgePort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});
