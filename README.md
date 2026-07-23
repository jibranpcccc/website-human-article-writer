# 🖊️ BigPickle AI Article Writer

Generate high-quality, human-written articles using **your own ChatGPT account** — no API key needed.

---

## ⚡ Quick Start (3 Steps)

### Step 1 — Download the app
**[⬇️ Click here to Download](https://github.com/jibranpcccc/website-human-article-writer/archive/refs/heads/main.zip)**

Unzip it anywhere on your computer (e.g. your Desktop).

---

### Step 2 — Install Node.js (one time only)
If you don't have Node.js installed:
**[⬇️ Download Node.js here](https://nodejs.org/)** → Install it → Done.

---

### Step 3 — Double-click `run-all.bat`
That's it. The app opens automatically in your browser.

- It will ask you to choose `1` (Visible Chrome) or `2` (Background)
- **Always choose 1** the first time so you can log into ChatGPT
- Log in to ChatGPT in the Chrome window that opens
- The app opens at `http://127.0.0.1:19323`

---

## 🎬 First Time Setup (30 seconds)

1. Double-click `run-all.bat`
2. Press `1` → Enter (Visible Chrome)
3. Press `1` → Enter (Local only)
4. In the Chrome window → log in to **ChatGPT**
5. Go to `http://127.0.0.1:19323` in your browser
6. Select your website → type a keyword → click **Generate Full Output**

---

## ✅ Requirements

| Requirement | Notes |
|-------------|-------|
| Windows 10 or 11 | Required |
| Google Chrome | [Download here](https://www.google.com/chrome/) |
| Node.js (v18+) | [Download here](https://nodejs.org/) |
| ChatGPT account | Free or Plus — log in once |

**No API key needed.** Uses your own ChatGPT browser session.

---

## 🌐 Sharing with Others

When you run `run-all.bat`, it asks:

> **"Do you want a PUBLIC INTERNET link?"**

- Press `1` → Only you can use it (on this PC)
- Press `2` → A public link is generated (e.g. `https://abc123.loca.lt`) — share it with anyone

> ⚠️ The public link only works while your PC is running `run-all.bat`

---

## 🔧 How It Works

```
Your Browser (UI)
      ↓
Vite Server (port 19323)
      ↓
Bridge Server (port 19322)
      ↓
Chrome with ChatGPT (port 19321)
      ↓
ChatGPT generates your article
```

All article generation happens through your own ChatGPT account in Chrome. No third-party API keys required.

---

## 📋 Features

- ✅ Human-written articles (Anti-Skeleton V8.6)
- ✅ No API key needed (uses your ChatGPT)
- ✅ Temporary chat mode (no history saved in ChatGPT)
- ✅ Medium intelligence mode (balanced speed + quality)
- ✅ Blog image prompts (20 prompts per article)
- ✅ Pinterest image prompts (30 prompts per article)
- ✅ SEO meta title + description
- ✅ Word + Markdown download
- ✅ ZIP pack download (article + all prompts)
- ✅ History of all generated articles
- ✅ Batch mode (multiple keywords at once)
- ✅ TressAtlas + TressCrew workspace switcher

---

## ❓ Troubleshooting

**App doesn't open?**
→ Make sure Node.js is installed. Run `run-all.bat` again.

**"ChatGPT login" error?**
→ In the Chrome window, log into ChatGPT, then click Generate again.

**Generate button not working?**
→ Make sure Chrome opened and you are logged into ChatGPT.

**Other users on same WiFi can't connect?**
→ Share `http://YOUR-IP:19323` — your IP shows in the `run-all.bat` window.

---

## 📦 Download

**[⬇️ Download Latest Version (ZIP)](https://github.com/jibranpcccc/website-human-article-writer/archive/refs/heads/main.zip)**

---

*Keep `run-all.bat` window open while using the app. Close it when done.*
