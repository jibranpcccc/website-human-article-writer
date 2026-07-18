# Integration Test Plan — website-article-writer-agent-v3

## Scope
Verify that the browser app (`npm run dev`) and the Big Pickle bridge server (`npm run server`) are wired together correctly: Vite proxy, `api.js` routing, template references, and the bridge client.

---

## Pre-test checklist
1. Repo root: `/c/HermesWork/projects/website-article-writer-agent-v3`
2. `npm install` has been run (dependencies include `vite`, `express`, `concurrently`, `marked`, `@supabase/supabase-js`).
3. If you want to test the **bridge**, the ChatGPT browser automation extension must be running on `127.0.0.1:19322` and reachable.

---

## Step-by-step test flow

### 1. Start both services
```bash
npm run dev:all
```
Expected:
- Vite dev server starts on `http://127.0.0.1:{BRIDGE_PORT}`
- Bridge server starts on `http://127.0.0.1:{BRIDGE_PORT}`
- Browser opens automatically at the Vite URL

### 2. Verify proxy wiring (Vite → Bridge)
With both servers running, open the browser tab and check:
```bash
curl http://127.0.0.1:{BRIDGE_PORT}/health
```
Expected: returns the bridge health payload (`{"status":"ok"}` or similar from `server/index.js`).

Alternative in-browser devtools:
```js
fetch('/health').then(r => r.json()).then(console.log)
```
Expected: resolves to bridge health object, no 404.

### 3. Verify frontend provider/model configuration
In the app sidebar:
- Set **Provider**: `OpenCode`
- Set **Model**: `big-pickle`
- This forces `generateContent()` in `src/api.js` to take the non-bridge OpenCode path (`baseUrl = '/api-opencode/zen/v1/chat/completions`).

### 4. Verify bridge-triggering configuration
In the app sidebar:
- Set **Provider**: the value matching `bigPickleBridge` logic, OR select a model value `chatgpt-browser`.
- `src/api.js` line 153 enters this branch:
  ```js
  if (provider === 'bigPickleBridge' || model === 'chatgpt-browser') { ... }
  ```
- It dynamically imports `src/bridgeClient.js` and builds the prompt via `buildBridgePrompt()`.

### 5. Confirm template reference works
When the bridge branch runs for modes other than `quickTest`/`listicle`/`imageOnly`, `buildBridgePrompt()` uses:
```js
const basePrompt = templates.articleV15_1 || templates.articleV86;
return basePrompt.replace(/{keyword}/g, keyword);
```
Expected:
- `src/templates.js` defines `articleV15_1` (confirmed — line 632).
- Article is drafted using the V15 three-stage prompt, not V8.6.

### 6. Run an end-to-end OpenCode generation (no bridge required)
1. Enter a keyword, e.g. `textured bob for women over 50`.
2. Set Provider = `OpenCode`, Model = `big-pickle`.
3. Paste an OpenCode API key.
4. Click **Generate Full Output**.
Expected:
- Network request visible in devtools goes to `/api-opencode/zen/v1/chat/completions`.
- Progress bar and live draft update through Pass 1/2/3.
- Article tab, Blog image prompts tab, and Pinterest image prompts tab populate.
- SEO title/meta card renders.

### 7. Run a bridge generation (bridge server + extension required)
1. Ensure bridge server is running (`npm run server`) and extension is listening on `127.0.0.1:19322`.
2. In the app, select Provider/Model that triggers the bridge branch (`model === 'chatgpt-browser'` is safest). 
   > Currently the `<select>` in `index.html` may not expose `chatgpt-browser`; you can toggle it by setting `localStorage.setItem('model','chatgpt-browser')` and reloading, or add the option.
3. Click **Generate Full Output**.
Expected:
- `src/bridgeClient.js` posts to `/api/bigpickle` (proxied to `127.0.0.1:{BRIDGE_PORT}`).
- Frontend shows `BigPickle Bridge: dispatching prompt to ChatGPT browser...`.
- Job status polls `/api/bigpickle/${jobId}` until `complete`.
- Final article renders in the Article tab.

### 8. Verify image-prompt generation path
Regardless of bridge vs. direct API, image prompts are generated via the proxy targets configured in `vite.config.js`:
- `api-mistral` → `https://api.mistral.ai`
- `api-opencode` → `https://opencode.ai`

If `VITE_MISTRAL_KEYS` is set, Mistral is used; otherwise OpenCode is used with the user-provided API key.

Expected in devtools:
- Concurrent POSTs to `/api-mistral/v1/chat/completions` or `/api-opencode/zen/v1/chat/completions`.
- Blog and Pinterest tabs populate after all promises resolve.

### 9. Verify exports / downloads
After a successful generation:
- Click **Copy Article**.
- Click **Download Article**.
- Click **Download ZIP Pack**.
Expected: clipboard receives markdown, `.md` file downloads, and ZIP contains article + Word doc + blog prompts + Pinterest prompts + SEO meta.

### 10. Edge cases to confirm
- Leave the keyword input blank and click Generate → alert `Please enter at least one target keyword.`
- Clear API Key and use a non-bridge provider → alert `Please enter an API Key...`
- Batch mode: enter keywords on separate lines, start generation, then click **Cancel Batch** → run stops after current keyword.

---

## Known integration notes
- `package.json` defines the correct dual-start script: `"dev:all": "concurrently \"npm run server\" \"npm run dev\"`.
- `vite.config.js` proxies `/api/bigpickle` and `/health` to port `19322`.
- `src/bridgeClient.js` base URL defaults to `http://127.0.0.1:{BRIDGE_PORT}` but can be overridden by `VITE_BIGPICKLE_BRIDGE`.
- `buildBridgePrompt()` defaults to `templates.articleV15_1`, which exists.
- The only caveat: **the UI `<select>` must expose a way to pick `chatgpt-browser`** for the bridge path to be reachable by normal users. If it doesn't, add an `<option value="chatgpt-browser">ChatGPT Browser Bridge</option>` to `index.html`.

---

## Result: PASS / FAIL
Run each step above and record the actual outcome.
