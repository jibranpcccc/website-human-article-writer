// BigPickle ChatGPT Browser Bridge Configuration
// These values are safe defaults; override via environment variables or a .env file.

const bridgeHost = process.env.BRIDGE_HOST || '127.0.0.1';
const cdpPort = process.env.CDP_PORT || '19321';

export const PORT = process.env.BIGPICKLE_PORT || process.env.BRIDGE_PORT || 19322;
export const CHATGPT_URL = process.env.BIGPICKLE_CHATGPT_URL || 'https://chatgpt.com';
export const HEADLESS = process.env.BIGPICKLE_HEADLESS !== 'false';
export const SESSION_DIR = process.env.BIGPICKLE_SESSION_DIR || './server/sessions/chatgpt-profile';
export const DEFAULT_TIMEOUT_MS = parseInt(process.env.BIGPICKLE_TIMEOUT_MS || '300000', 10);
export const RETRY_ATTEMPTS = parseInt(process.env.BIGPICKLE_RETRY_ATTEMPTS || '2', 10);

// CDP connection settings
export const CDP_HOST = process.env.BIGPICKLE_CDP_HOST || `http://${bridgeHost}:${cdpPort}`;

// Root dir helper
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(__dirname, '..');
