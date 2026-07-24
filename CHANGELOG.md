# CHANGELOG

All notable changes to Website Human Article Writer.

---

## [v2.5] - 2024-07-24 - LATEST (WORKING)

### Image Prompts - Fully Fixed
- ROOT CAUSE: All 11 Mistral API calls fired simultaneously, all rate-limited (429), silently returned empty
- FIX: Each chunk now uses a DEDICATED Mistral key (key 0=chunk1, key 1=chunk2, etc.)
- FIX: Restored Promise.all parallel - no rate limits since each key has its own quota
- FIX: Removed random key override in callAPI - respects dedicated per-chunk key
- ADDED: 429 auto-retry with backoff (up to 15s wait then retry)
- RESULT: 20 blog + 30 Pinterest prompts generated in ~15 seconds (all parallel)

### Mistral Keys - 25 Keys Hardcoded
- All 25 tested Mistral keys baked into source code
- No .env file needed - works out of the box
- Key rotation: keys 0-3 for blog, keys 4-9 for Pinterest, key 10+ for headings

### Performance
- IMAGE_PROMPT_MAX_TOKENS reduced 6000 to 4000 (faster, within limits)
- All 11 image prompt calls truly parallel with separate keys

---

## [v2.4] - 2024-07-24

- Switched back to direct Mistral API (api.mistral.ai) from OpenCode
- Image prompts: mistral-large-latest
- Heading formatter: mistral-small-latest
- Added 600ms sequential delay (replaced in v2.5 with parallel+dedicated-key)

---

## [v2.3] - 2024-07-23

- Added 25 Mistral API keys as hardcoded defaults
- No user configuration needed

---

## [v2.2] - 2024-07-23 - DID NOT WORK

- Tried mimo-v2.5-free on OpenCode Zen
- OpenCode free models could not authenticate with Mistral keys

---

## [v2.1] - 2024-07-23 - DID NOT WORK

- Switched to OpenCode Zen with mistral-small-3.1-free (wrong model name)
- Image prompts still empty - 400 errors from invalid model name

---

## [v2.0] - 2024-07-23

- BigPickle ChatGPT Browser Bridge connected
- 3-part article generation 2600-3000 words
- H2/H3 heading formatter integrated
- Image prompts pipeline connected
- Supabase saving integrated
- START.bat fixed for paths with spaces

---

## Architecture Reference

| Component             | Provider       | Model                  | Keys Used  |
|-----------------------|----------------|------------------------|------------|
| Article generation    | ChatGPT Bridge | GPT-4o                 | None       |
| H2/H3 headings        | Mistral API    | mistral-small-latest   | Key 10     |
| Blog image prompts    | Mistral API    | mistral-large-latest   | Keys 0-3   |
| Pinterest prompts     | Mistral API    | mistral-large-latest   | Keys 4-9   |
| Hairstyle topics      | Mistral API    | mistral-large-latest   | Key 4      |
