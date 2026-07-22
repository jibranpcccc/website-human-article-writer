import { spawn } from 'child_process';
import fileURLToPath from 'url';

console.log('============================================================');
console.log(' Starting BigPickle Bridge & Vite UI Servers...');
console.log('============================================================\n');

// 1. Start Bridge Server
const bridge = spawn('node', ['server/index.js'], { stdio: 'inherit', shell: true });
bridge.on('error', (err) => console.error('[Bridge Error]:', err.message));

// 2. Start Vite UI Server
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '19323', '--strictPort'], { stdio: 'inherit', shell: true });
vite.on('error', (err) => console.error('[Vite Error]:', err.message));

// Handle process shutdown
const cleanup = () => {
  try { bridge.kill(); } catch {}
  try { vite.kill(); } catch {}
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
