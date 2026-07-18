# AI Article Writer — BigPickle ChatGPT Browser Bridge

A local article generator with a new **BigPickle → ChatGPT browser bridge**. The app still supports direct API calls to OpenCode/Gemini/OpenAI, but it can now route prompts to ChatGPT inside your real Chrome browser and capture the reply.

## What is new

- **Browser automation bridge** (`server/`) — uses Playwright + Chrome CDP.
- **Front-end provider: BigPickle → ChatGPT Browser**
- **No API key needed** when using the bridge.
- **Security fixes** vs. the previous version:
  - No hardcoded API key fallback.
  - Removed bundled `.env`/secrets from this working copy.
  - `localStorage` reads are guarded.
  - Markdown/HTML output is sanitized with DOMPurify.
  - Dynamic text inserted into progress/banner/history is escaped.

## Project structure

```
.
├── index.html                 # Main UI (added BigPickle provider option)
├── package.json               # Added server + DOMPurify deps
├── vite.config.js             # Added proxy for bridge
├── src/
│   ├── main.js                # Added bridge provider/model/status
│   ├── api.js                 # Routes bigPickleBridge provider to bridge
│   ├── bridgeClient.js        # Front-end bridge client
│   ├── templates.js           # Existing prompts
│   └── style.css              # Existing styling
├── server/
│   ├── index.js               # Express bridge server
│   ├── bigPickleBridge.js     # Job queue
│   ├── chatgptDriver.js       # Playwright/CDP ChatGPT driver
│   ├── config.js              # Bridge config
│   └── README.md              # Server setup details
├── scripts/
│   └── launch-chrome-cdp.bat  # Windows CDP launcher
└── TEST_PLAN.md               # Step-by-step test plan
```

## Quick start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Launch Chrome with remote debugging** (persistent profile for session)
   ```bash
   scripts\launch-chrome-cdp.bat
   ```

3. **Log in to ChatGPT once** in the Chrome window that opens.

4. **Run the app + bridge together**
   ```bash
   npm run dev:all
   ```
   - Vite UI: `http://127.0.0.1:{BRIDGE_PORT}`
   - Bridge server: `http://127.0.0.1:{BRIDGE_PORT}`

5. In the app sidebar, select **Provider: BigPickle → ChatGPT Browser**, enter a keyword, and click **Generate Full Output**.

## Environment variables

Create a `.env` file from `.env.example` if you still want to use the old direct API modes (optional).

```bash
VITE_MISTRAL_KEYS=""
VITE_SUPABASE_URL=""
VITE_SUPABASE_ANON_KEY=""
```

For the bridge:

```bash
BIGPICKLE_PORT=19322
BIGPICKLE_HEADLESS=false
BIGPICKLE_CDP_HOST=http://127.0.0.1:{BRIDGE_PORT}
```

## Running bridge without the UI

```bash
npm run server
```

## Security notes

- Do **not** commit `.env` files.
- Rotate exposed API keys if they were in the previous repo/git history.
- The bridge runs only locally; it is not deployable to a static host.

## License

Private / project-specific.
