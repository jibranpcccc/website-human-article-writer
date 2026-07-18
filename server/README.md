# Server Bridge — Production Dev Setup

This folder contains the production-dev bridge for the website-article-writer-agent-v3 app.

- `index.js` — Express API server.
- `bigPickleBridge.js` — Bridge logic to ChatGPT via Playwright CDP.
- `chatgptDriver.js` — Low-level ChatGPT automation driver.
- `config.js` — Server configuration.
- `sessions/chrome-cdp/` — Persistent Chrome profile for CDP sessions.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Launch Chrome with remote debugging**
   Double-click or run:
   ```bash
   scripts\launch-chrome-cdp.bat
   ```
   This starts Chrome at `http://127.0.0.1:{BRIDGE_PORT}` with a persistent profile under `server/sessions/chrome-cdp`.

3. **Log in to ChatGPT once**
   In the Chrome window that opens, go to https://chat.openai.com and sign in. The session is saved in the persistent profile, so you only need to do this once per environment.

4. **Start the API server**
   ```bash
   npm run server
   ```

5. **Run the full dev stack (server + Vite UI)**
   ```bash
   npm run dev:all
   ```

## Verifying Syntax

```bash
node --check server/index.js
node --check server/bigPickleBridge.js
node --check server/chatgptDriver.js
node --check server/config.js
```
