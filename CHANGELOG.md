# CHANGELOG

All notable changes to the Website Human Article Writer project are documented in this file.

## [v2.1.5] - 2026-07-23

### 🐛 Critical Bug Fixes
- **ChatGPT Prompt Input & Send Submission Fix**:
  - Replaced DOM `execCommand` with Playwright native `page.keyboard.insertText()` to properly trigger ChatGPT ProseMirror/React input state handlers.
  - Ensures the Send button (`[data-testid="send-button"]`) becomes **ENABLED** automatically upon text insertion.
  - Replaced fallback Enter keys with explicit locator clicks on enabled Send buttons.
- **Infinite Waiting Loop Resolution**:
  - Fixed `waitForResponseComplete()` logic to detect non-generating states immediately and prevent 5-minute hanging loops when responses are empty.
  - Added auto-retriggering and explicit user error reporting if ChatGPT fails to start generating within 15 seconds.
- **Canvas vs. Prompt Textarea Selector Disambiguation**:
  - Excluded `#prompt-textarea` from `.ProseMirror` selector queries in `getLastResponse()` to prevent reading empty prompt boxes as assistant responses.

---

## [v2.1.0] - 2026-07-22

### 🚀 New Features & Enhancements
- **Fast Single-Turn Generation (`sendPrompt`)**:
  - Replaced multi-turn 3-part stitching with fast single-turn dispatch via `sendPrompt`.
  - Articles generate in a single output stream in ~1–2 minutes instead of 5+ minutes.

- **Strict Word Count Capping (2,800 – 3,100 Words Max)**:
  - Updated Anti-Skeleton V8.6 Master Prompt and template instructions to target **2,800 to 3,100 words max**.
  - Prevents word count overshooting (previously 6,000+ words).

- **Stage 2 Mistral Heading Formatter**:
  - Connected Mistral API (`mistral-small-latest`) to Stage 2 heading and SEO layout optimization.
  - Automatically formats `##` (H2) and `###` (H3) subheadings and mobile-friendly paragraph breaks while keeping 100% of original words untouched.
  - Added automatic regex cleaner to strip out conversational AI preambles (e.g., *"Here is your formatted version..."*).

- **Playwright CDP Native Locators for Medium Intelligence**:
  - Replaced synthetic `element.click()` in `selectMediumIntelligence()` with native Playwright locator clicks.
  - Guarantees reliable selection of **Medium** reasoning mode on ChatGPT dropdown pills without getting stuck or defaulting to High.

- **Canvas & ProseMirror Multi-Selector Text Extraction**:
  - Upgraded `getLastResponse()` in `server/chatgptDriver.js` to extract generated article text across ChatGPT's new Canvas, ProseMirror, `.markdown`, `.prose`, and `.agent-turn` DOM containers.

- **Pure Node.js Concurrent Server Launcher (`server/startAll.js`)**:
  - Added `server/startAll.js` to spawn both the BigPickle Bridge server (`server/index.js`) and Vite UI (`npx vite`) concurrently without depending on external CLI packages (`concurrently`).

- **Disk Space Optimization (Saved ~4.0 GB)**:
  - Added `--disable-features=OptimizationGuideModelDownloading,OptimizationHintsFetching` to `run-all.bat`.
  - Permanently prevents Google Chrome from automatically downloading its 4GB internal AI model store (`OptGuideOnDeviceModel`) into browser profile folders.

- **Bulletproof Cross-Platform `run-all.bat`**:
  - Replaced raw parentheses in `echo` statements and `choice` commands to prevent instant syntax crashes on Windows Command Prompt.
  - Added Node.js installation check and automatic `npm install` dependency installer for first-time user setups on any laptop.
  - Added a 6-second boot delay to prevent "Unable to connect" Firefox errors on slower machines.

---

## [v2.0.0] - 2026-07-18
- Initial release of Anti-Skeleton V8.6 Human Article Writer with BigPickle ChatGPT CDP Browser Bridge.
