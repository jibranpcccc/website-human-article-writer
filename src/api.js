import { HUMAN_WRITER_MASTER_PROMPT } from './bridgePromptTemplate.js';
import { templates } from './templates.js';
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || '';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export async function saveArticleToSupabase({
  keyword,
  title,
  rawArticle,
  formattedArticle,
  blogImagePrompts,
  pinterestImagePrompts,
  seoMeta
}) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('articles')
      .insert([
        {
          keyword,
          title,
          raw_article: rawArticle,
          formatted_article: formattedArticle,
          blog_image_prompts: blogImagePrompts,
          pinterest_image_prompts: pinterestImagePrompts,
          seo_meta: seoMeta
        }
      ]);
    if (error) throw error;
    console.log('Saved to Supabase successfully!', data);
    return data;
  } catch (err) {
    console.error('Failed to save to Supabase:', err);
    return null;
  }
}


// ============================================================
// MISTRAL API KEY ROTATION & FALLBACK CONFIGURATION
// ============================================================
const MISTRAL_KEYS = (getEnvVar('VITE_MISTRAL_KEYS') || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

function getMistralKey(index) {
  if (MISTRAL_KEYS.length === 0) return null;
  return MISTRAL_KEYS[index % MISTRAL_KEYS.length];
}

const hasMistralKeys = MISTRAL_KEYS.length > 0;
const IMAGE_PROMPT_MODEL = 'mimo-v2.5-free'; // Free model guaranteed on OpenCode Zen
const IMAGE_PROMPT_MAX_TOKENS = 6000;

function cleanArticleText(text) {
  if (!text) return '';
  return text
    // Remove standalone part labels (e.g. PART 1, Part 2, [PART 3], **PART 1**, --- PART 2 ---)
    .replace(/^(?:#+\s+|\*\*|---\s*|\[)?\s*PART\s*\d+\s*(?:\s*---|\]|\*\*)?\s*$/gmi, '')
    // Remove other bridge stop markers
    .replace(/\[Stop\.\s*Write Part \d+ next\.\]/gi, '')
    .replace(/\*\*NEXT PART\*\*/gi, '')
    .replace(/---\s*\n*\[PART \d+\]/gi, '')
    .replace(/\[Continue article directly\..*?\]/gi, '')
    .replace(/\[Body text.*?\]/gi, '')
    .replace(/\[META\]:.*?$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractListicleHeadings(content) {
  if (!content) return '';
  const lines = content.split('\n');
  const extracted = [];
  let currentHeading = null;
  let currentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Catch headings (e.g. ## 1. Textured Bob) but ignore blueprint / meta headings
    if (trimmed.startsWith('## ') || (trimmed.startsWith('### ') && !trimmed.includes('Blueprint') && !trimmed.includes('Prompt'))) {
      if (currentHeading) {
        extracted.push(`${currentHeading}\n${currentLines.join('\n').trim()}`);
      }
      currentHeading = trimmed;
      currentLines = [];
    } else if (currentHeading) {
      if (trimmed.startsWith('# ') || trimmed.startsWith('---')) {
        // Skip main title or divider blocks
      } else {
        currentLines.push(line);
      }
    }
  }

  if (currentHeading) {
    extracted.push(`${currentHeading}\n${currentLines.join('\n').trim()}`);
  }

  return extracted.join('\n\n');
}

function buildBridgePrompt({ mode, keyword, supportingKeywords = '' }) {
  if (mode === 'quickTest') {
    return `Write a short, friendly blog-style test for the keyword "${keyword}". Exactly 2-3 sentences are enough. Start with one H1 heading.`;
  }
  if (mode === 'articleV10') {
    return templates.articleV10.replace(/{keyword}/g, keyword);
  }
  if (mode === 'articleV13') {
    return templates.articleV13.replace(/{keyword}/g, keyword);
  }
  if (mode === 'articleV14') {
    return templates.articleV14.replace(/{keyword}/g, keyword);
  }
  if (mode === 'listicle') {
    return templates.listiclePrompt
      .replace(/{keyword}/g, keyword)
      .replace(/{supporting_keywords}/g, supportingKeywords || '');
  }
  // Full anti-skeleton human writer master prompt (3 parts, 1000+ words each)
  return HUMAN_WRITER_MASTER_PROMPT.replace('[INSERT KEYWORD HERE]', keyword);
}

function extractGenderAndAge(keyword) {
  const kw = keyword.toLowerCase();
  let gender = 'women'; // default fallback
  if (kw.includes('men') || kw.includes('man') || kw.includes('boy') || kw.includes('guy') || kw.includes('male')) {
    gender = 'men';
  } else if (kw.includes('women') || kw.includes('woman') || kw.includes('girl') || kw.includes('lady') || kw.includes('female')) {
    gender = 'women';
  }

  let ageRange = 'over 50'; // default fallback
  const ageMatch = kw.match(/over\s*(\d+)/i) || kw.match(/(\d+)\s*\+/);
  if (ageMatch) {
    ageRange = `over ${ageMatch[1]}`;
  } else if (kw.includes('young') || kw.includes('kid')) {
    ageRange = 'young adult';
  } else if (kw.includes('teen')) {
    ageRange = 'teenager';
  } else if (kw.includes('30s') || kw.includes('30')) {
    ageRange = 'in their 30s';
  } else if (kw.includes('40s') || kw.includes('40')) {
    ageRange = 'in their 40s';
  } else if (kw.includes('60s') || kw.includes('60')) {
    ageRange = 'in their 60s';
  } else if (kw.includes('70s') || kw.includes('70')) {
    ageRange = 'in their 70s';
  }

  return { gender, ageRange };
}

export async function generateContent({
  provider,
  apiKey,
  model,
  mode,
  keyword,
  supportingKeywords,
  onProgress,
  onDraftUpdate,
  onReasoning
}) {
  // Normalize model name for OpenCode Big Pickle
  const apiModel = model === 'opencode/big-pickle' ? 'big-pickle' : model;

  // --- BigPickle ChatGPT Browser Bridge mode ---
  // Written content comes from your logged-in ChatGPT browser instead of a direct API.
  let fromBridge = false;
  let finalArticleText = '';
  let seoMeta = '';
  let detectedModel = '';

  if (provider === 'bigPickleBridge' || model === 'chatgpt-browser') {
    fromBridge = true;
    if (mode === 'imageOnly') {
      finalArticleText = '';
      seoMeta = 'Image prompts only (via ChatGPT browser)';
    } else {
      if (onProgress) onProgress('BigPickle Bridge: dispatching prompt to ChatGPT browser...', 5);
      const { dispatchBigPickleJob, waitForBigPickleResult } = await import('./bridgeClient.js');
      const prompt = await buildBridgePrompt({ mode, keyword, supportingKeywords });
      const { jobId } = await dispatchBigPickleJob({ prompt, modelLabel: model || 'chatgpt-browser', mode });
      if (onProgress) onProgress('BigPickle Bridge: waiting for ChatGPT response...', 25);
      const result = await waitForBigPickleResult(jobId, {
        onProgress: (status) => {
          if (onReasoning) onReasoning(status, 'BigPickle → ChatGPT');
        }
      });
      const fullText = typeof result === 'string' ? result : (result?.content || '');
      detectedModel = typeof result === 'object' ? (result?.model || '') : '';
      if (!fullText || fullText.trim() === '') {
        throw new Error('BigPickle Bridge returned empty response from ChatGPT.');
      }
      if (onProgress) onProgress('BigPickle Bridge: response received.', 50);

      let cleanArticle = fullText;
      const metaMatch = cleanArticle.match(/\[META\]:\s*(.+)/i);
      if (metaMatch) {
        seoMeta = metaMatch[1].trim();
      }
      cleanArticle = cleanArticleText(cleanArticle);

      const h1Index = cleanArticle.indexOf('# ');
      if (h1Index !== -1) cleanArticle = cleanArticle.slice(h1Index).trim();

      finalArticleText = cleanArticle;
      if (onDraftUpdate) onDraftUpdate(finalArticleText);
    }
  }

  if (!fromBridge) {
    // If no key was provided for OpenCode, fall back to environment config
    if (!apiKey && provider === 'opencode') {
      apiKey = getEnvVar('VITE_OPENCODE_API_KEY');
    }
    // API Key is required for direct API modes only
    if (!apiKey) {
      throw new Error('API Key is required to run generation.');
    }
  }

  // 1. SELECT API SETTINGS — all routed via Vite local proxy (vite.config.js)
  let baseUrl = '';
  let headers = { 'Content-Type': 'application/json' };

  if (provider === 'gemini') {
    baseUrl = `/api-gemini/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
  } else if (provider === 'openai') {
    baseUrl = '/api-openai/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'opencode') {
    baseUrl = '/api-opencode/zen/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'mistral') {
    baseUrl = '/api-mistral/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Image prompts: always use OpenCode Zen with free Mistral model
  const imageProvider = 'opencode';
  let imageBaseUrl = '/api-opencode/zen/v1/chat/completions';

  function getImageHeaders(keyIndex) {
    // Free OpenCode models don't strictly need auth, but send a key if we have one
    const key = apiKey || (hasMistralKeys ? getMistralKey(keyIndex) : '');
    const h = { 'Content-Type': 'application/json' };
    if (key) h['Authorization'] = `Bearer ${key}`;
    return h;
  }

  // Image prompts use KEYWORD ONLY — completely independent of article content
  const blogTitle = keyword;
  const { gender, ageRange } = extractGenderAndAge(keyword);

  // ── CONCURRENT BACKGROUND IMAGE PROMPT GENERATION ──
  // Start image prompt generation concurrently right as article generation starts!
  // Skip entirely if we have no usable API key (BigPickle mode with no Mistral or direct key)
  const canGenerateImagePrompts = true; // Always try — using free OpenCode model, falls back automatically

  const blogImagePromptsPromise = (async () => {
    if (!canGenerateImagePrompts) {
      console.log('[api] Skipping blog image prompts — no Mistral keys found in .env');
      if (onProgress) onProgress('⚠️ No Mistral keys found — image prompts skipped. Add VITE_MISTRAL_KEYS to .env', 80);
      return '';
    }
    console.log('[api] Starting blog image prompts with', MISTRAL_KEYS.length, 'Mistral keys. First key starts:', MISTRAL_KEYS[0]?.slice(0,6));
    const blogSysInstruction = 'You are an expert blog content image planner and AI image prompt engineer. Follow the Master Image Prompt System v6.0 exactly. Write the FULL Hairstyle Blueprint for every image. Write the FULL negative prompt for every image — never use shortcuts or (Same as above).';
    
    const buildBlogPartRequest = (imageRange, count) => templates.imagePromptSystem
      .replace('{blog_title}', blogTitle)
      .replace('{keyword}', keyword)
      .replace('{main_topic}', keyword)
      .replace('{gender}', gender)
      .replace('{age_range}', ageRange)
      .replace('{content}', `Keyword: ${keyword}\nGenerate image prompts that visually represent this hairstyle keyword. No article content needed — generate based on keyword meaning and hairstyle type only.`)
      .replace('Write Images 1–10 in full using the FULL OUTPUT FORMAT for each.', '')
      .replace('After Image 10, stop. The system will send "NEXT PART."', '')
      .replace('When you receive "NEXT PART", immediately write Images 11–20 in full.', '')
      .replace('Do NOT repeat Image 1–10.', '')
      .replace('Just continue from Image 11 to Image 20 in full format.', '')
      .replace('Input context:', `YOUR TASK:\nGenerate image prompts for ${imageRange} ONLY.\nGenerate exactly ${count} image prompts. Do not go outside your assigned range.\nDo not repeat, re-introduce, or write outside your assigned range.\n\nInput context:`);

    const blogChunksConfig = [
      { range: 'Images 1–5', count: 5, keyIndex: 0 },
      { range: 'Images 6–10', count: 5, keyIndex: 1 },
      { range: 'Images 11–15', count: 5, keyIndex: 2 },
      { range: 'Images 16–20', count: 5, keyIndex: 3 }
    ];

    const blogPartResults = await Promise.all(
      blogChunksConfig.map(chunk =>
        callAPI({
          provider: imageProvider,
          baseUrl: imageBaseUrl,
          headers: getImageHeaders(chunk.keyIndex),
          model: IMAGE_PROMPT_MODEL,
          maxTokens: IMAGE_PROMPT_MAX_TOKENS,
          systemInstruction: blogSysInstruction,
          messages: [{ role: 'user', content: buildBlogPartRequest(chunk.range, chunk.count) }],
          onReasoning: (text) => {
            if (onReasoning) onReasoning(text, `Blog ${chunk.range} [${IMAGE_PROMPT_MODEL}]`);
          }
        })
      )
    );

    return blogPartResults.join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  })();

  const pinterestImagePromptsPromise = (async () => {
    if (!canGenerateImagePrompts) {
      console.log('[api] Skipping pinterest image prompts — no Mistral keys found in .env');
      return '';
    }
    console.log('[api] Starting Pinterest image prompts with', MISTRAL_KEYS.length, 'Mistral keys.');
    const pinterestSysInstruction = 'You are an expert Pinterest image planner and AI image prompt engineer. Generate extremely high-quality, rich, detailed candid portrait image prompts of 75-110 words focusing on the hairstyle. ABSOLUTELY NO SELFIES or references to holding phones/mirror shots. Streamline the output: ONLY output one-line prompts in the requested format. Never include blueprints, content profiles, intro, or outro.';

    const hairstyleTopics = await callAPI({
      provider: imageProvider,
      baseUrl: imageBaseUrl,
      headers: getImageHeaders(0),
      model: IMAGE_PROMPT_MODEL,
      maxTokens: 1000,
      systemInstruction: 'You are a helpful assistant. Output ONLY a clean numbered list of 30 hairstyle names.',
      messages: [{
        role: 'user',
        content: `Give me a clean numbered list of exactly 30 distinct, beautiful, modern hairstyle names for the keyword "${keyword}".
Do NOT write any descriptions, introductions, or other text. Just output the numbered list.`
      }],
      onReasoning: (text) => { if (onReasoning) onReasoning(text, `Pinterest: Generating 30 Hairstyle Names [${IMAGE_PROMPT_MODEL}]`); }
    });

    const buildPartRequest = (imageRange, count) => templates.pinterestImagePromptSystem
      .replace('{blog_title}', blogTitle)
      .replace('{keyword}', keyword)
      .replace('{image_range}', imageRange)
      .replace('Generate exactly 10 image prompts', `Generate exactly ${count} image prompts`)
      .replace('{hairstyle_content}', hairstyleTopics);

    const chunksConfig = [
      { range: 'Images 1–5', count: 5, keyIndex: 4 },
      { range: 'Images 6–10', count: 5, keyIndex: 5 },
      { range: 'Images 11–15', count: 5, keyIndex: 6 },
      { range: 'Images 16–20', count: 5, keyIndex: 7 },
      { range: 'Images 21–25', count: 5, keyIndex: 8 },
      { range: 'Images 26–30', count: 5, keyIndex: 9 }
    ];

    const pinPartResults = await Promise.all(
      chunksConfig.map(chunk =>
        callAPI({
          provider: imageProvider,
          baseUrl: imageBaseUrl,
          headers: getImageHeaders(chunk.keyIndex),
          model: IMAGE_PROMPT_MODEL,
          maxTokens: IMAGE_PROMPT_MAX_TOKENS,
          systemInstruction: pinterestSysInstruction,
          messages: [{ role: 'user', content: buildPartRequest(chunk.range, chunk.count) }],
          onReasoning: (text) => {
            if (onReasoning) onReasoning(text, `Pinterest ${chunk.range} [${IMAGE_PROMPT_MODEL}]`);
          }
        })
      )
    );

    return pinPartResults.join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  })();

  let part1Text = '';
  let part2Text = '';
  let part3Text = '';

  // 2. STAGE 1: ARTICLE GENERATION
  if (fromBridge) {
    onProgress('BigPickle Bridge: article draft retrieved from ChatGPT.', 65);
  } else {
    if (mode === 'imageOnly') {
      onProgress('Image Prompts Mode: Skipping article writing...', 15);
      finalArticleText = '';
      seoMeta = `Image prompts only`;
    } else if (mode === 'quickTest') {
      // ── Quick Test Mode — single call, ~400 words, fast model check ──
      onProgress('Quick Test: Generating 400-word article...', 15);
      const quickPrompt = `Write a 400-word blog article about "${keyword}".

Requirements:
- Natural, conversational tone
- One H1 title at the top
- 2-3 short H2 sections
- No fluff, no filler
- End with a one-sentence conclusion
- Do NOT include any meta tags or notes

Keyword: ${keyword}`;

      finalArticleText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction: 'You are a concise blog writer. Write exactly what is asked.',
        messages: [{ role: 'user', content: quickPrompt }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'Quick Test Article');
        }
      });

      if (onDraftUpdate) onDraftUpdate(finalArticleText);
      onProgress('Quick test article done. Generating image prompts...', 65);

    } else if (mode === 'listicle') {
      onProgress('Generating listicle content...', 15);
      const listiclePrompt = templates.listiclePrompt
        .replace('{keyword}', keyword)
        .replace('{supporting_keywords}', supportingKeywords || '');

      finalArticleText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction: 'You are an expert article writer.',
        messages: [{ role: 'user', content: listiclePrompt }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'Listicle Drafting');
        }
      });

      // Extract META from listicle too
      const listicleMetaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
      seoMeta = listicleMetaMatch ? listicleMetaMatch[1].trim() : '';
      finalArticleText = finalArticleText.replace(/\[META\]:.*?\n/gi, '').trim();

      if (onDraftUpdate) onDraftUpdate(finalArticleText);

    } else if (mode === 'articleV15') {
      // ----------------------------------------------------
      // V15 THREE-STAGE GENERATION PIPELINE
      // ----------------------------------------------------
      
      // Pass 1: V15 Prompt 1 — Draft the Article (No H3s, 2,800–3,200 words, 5–7 H2s)
      onProgress('Generating initial draft (V15 Prompt 1)...', 15);
      const systemInstruction1 = "You are a professional hairstylist writing in a grounded salon editorial voice. Follow your instructions precisely.";
      const prompt1 = templates.articleV15_1.replace(/{keyword}/g, keyword);

      const draftText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction: systemInstruction1,
        messages: [{ role: 'user', content: prompt1 }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V15 Pass 1: Drafting');
        }
      });

      if (onDraftUpdate) onDraftUpdate(draftText);

      // Pass 2: V15 Prompt 2 — Strict Full-Article Repair
      onProgress('Performing strict full-article repair (V15 Prompt 2)...', 45);
      const systemInstruction2 = "You are a meticulous hairstyle editor and working stylist. Repair the article precisely according to instructions.";
      const prompt2 = templates.articleV15_2
        .replace(/{keyword}/g, keyword)
        .replace(/{draft}/g, draftText);

      const repairedText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction: systemInstruction2,
        messages: [{ role: 'user', content: prompt2 }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V15 Pass 2: Repairing');
        }
      });

      if (onDraftUpdate) onDraftUpdate(repairedText);

      // Pass 3: V15 Prompt 3 — Pinterest Formatting Only (Break paragraphs, add H3s to reach 15-20 total headings)
      onProgress('Applying Pinterest formatting and H3 headings (V15 Prompt 3)...', 75);
      const systemInstruction3 = "You are a visual reading layout editor. Improve visual structure without rewriting or changing any words.";
      const prompt3 = templates.articleV15_3.replace(/{article}/g, repairedText);

      finalArticleText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction: systemInstruction3,
        messages: [{ role: 'user', content: prompt3 }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V15 Pass 3: Formatting');
        }
      });

      // Extract SEO META description
      const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
      seoMeta = metaMatch ? metaMatch[1].trim() : '';

      // Strip metadata blocks and any conversational intro by slicing from H1 tag (#)
      const h1Index = finalArticleText.indexOf('# ');
      if (h1Index !== -1) {
        finalArticleText = finalArticleText.slice(h1Index).trim();
      } else {
        finalArticleText = finalArticleText
          .replace(/\[SEO TITLE\]:.*?\n/gi, '')
          .replace(/\[SLUG\]:.*?\n/gi, '')
          .replace(/\[META\]:.*?\n/gi, '')
          .trim();
      }

      if (onDraftUpdate) onDraftUpdate(finalArticleText);
      onProgress('V15 generation complete.', 90);

    } else if (mode === 'articleV10') {
      onProgress('Generating article (V10.0 Master Prompt)...', 15);
      const systemInstruction = "You are a professional hairstylist writing in a grounded salon casual voice. Follow your instructions precisely.";
      const prompt10 = templates.articleV10.replace(/{keyword}/g, keyword);

      finalArticleText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: [{ role: 'user', content: prompt10 }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V10 Drafting');
        }
      });

      // Extract META
      const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
      seoMeta = metaMatch ? metaMatch[1].trim() : '';

      finalArticleText = cleanArticleText(finalArticleText);

      // Strip any intro before the H1 title
      const h1Index = finalArticleText.indexOf('# ');
      if (h1Index !== -1) {
        finalArticleText = finalArticleText.slice(h1Index).trim();
      }

      if (onDraftUpdate) onDraftUpdate(finalArticleText);
      onProgress('V10.0 generation complete.', 90);

    } else if (mode === 'articleV13') {
      onProgress('Generating Part 1 (V13.0 Master Prompt)...', 15);
      const systemInstruction = "You are a professional hairstylist writing in a grounded salon casual voice. Follow your instructions precisely.";
      const prompt13 = templates.articleV13.replace(/{keyword}/g, keyword);

      const chatHistory = [
        { role: 'user', content: prompt13 }
      ];

      part1Text = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: chatHistory,
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V13 Part 1: Outline & Intro');
        }
      });

      chatHistory.push({ role: 'assistant', content: part1Text });
      if (onDraftUpdate) onDraftUpdate(part1Text);
      onProgress('Part 1 Completed. Initializing Part 2...', 35);

      // Call Part 2
      chatHistory.push({ role: 'user', content: 'Next Part. Continue writing the next 2-3 H2 sections of the article, maintaining the high-quality hairstylist voice and writing around 800 words.' });
      part2Text = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: chatHistory,
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V13 Part 2: Body sections');
        }
      });

      chatHistory.push({ role: 'assistant', content: part2Text });
      if (onDraftUpdate) onDraftUpdate(`${part1Text}\n\n${part2Text}`);
      onProgress('Part 2 Completed. Initializing Part 3...', 60);

      // Call Part 3
      chatHistory.push({ role: 'user', content: 'Next Part. Write the final H2 sections of the article, completing it without a conclusion, and append the [META] block at the very end as requested. Write around 700-800 words.' });
      part3Text = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: chatHistory,
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V13 Part 3: Maintenance & Conclusion');
        }
      });

      finalArticleText = `${part1Text}\n\n${part2Text}\n\n${part3Text}`;

      // Extract META
      const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
      seoMeta = metaMatch ? metaMatch[1].trim() : '';

      finalArticleText = cleanArticleText(finalArticleText);

      // Strip any intro before the H1 title
      const h1Index = finalArticleText.indexOf('# ');
      if (h1Index !== -1) {
        finalArticleText = finalArticleText.slice(h1Index).trim();
      }

      if (onDraftUpdate) onDraftUpdate(finalArticleText);
      onProgress('V13.0 generation complete.', 90);

    } else if (mode === 'articleV14') {
      onProgress('Generating article (V14.0 Master Prompt)...', 15);
      const systemInstruction = "You are a professional hairstylist writing in a grounded salon casual voice. Follow your instructions precisely.";
      const prompt14 = templates.articleV14.replace(/{keyword}/g, keyword);

      finalArticleText = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: [{ role: 'user', content: prompt14 }],
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'V14 Drafting');
        }
      });

      // Extract META
      const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
      seoMeta = metaMatch ? metaMatch[1].trim() : '';

      finalArticleText = cleanArticleText(finalArticleText);

      // Strip any intro before the H1 title
      const h1Index = finalArticleText.indexOf('# ');
      if (h1Index !== -1) {
        finalArticleText = finalArticleText.slice(h1Index).trim();
      }

      if (onDraftUpdate) onDraftUpdate(finalArticleText);
      onProgress('V14.0 generation complete.', 90);

    } else {
      // Sequential 3-Part Generation for Anti-Skeleton V8.6
      onProgress('Running Voice Seed Setup & Generating Part 1...', 10);
      const systemInstruction = "You are a professional hairstylist with 15 years experience. You write in a casual, direct, opinionated, and authentic tone. Follow your instructions precisely.";
      
      const part1Prompt = templates.articleV86.replace('{keyword}', keyword);

      // Call Part 1
      const chatHistory = [
        { role: 'user', content: part1Prompt }
      ];

      part1Text = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: chatHistory,
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'Part 1: Voice Setup & Outline');
        }
      });

      chatHistory.push({ role: 'assistant', content: part1Text });
      if (onDraftUpdate) onDraftUpdate(part1Text);
      onProgress('Part 1 Completed. Initializing Part 2...', 30);

      // Call Part 2
      chatHistory.push({ role: 'user', content: 'Next Part.' });
      part2Text = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: chatHistory,
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'Part 2: Core Body Expansion');
        }
      });

      chatHistory.push({ role: 'assistant', content: part2Text });
      if (onDraftUpdate) onDraftUpdate(`${part1Text}\n\n${part2Text}`);
      onProgress('Part 2 Completed. Initializing Part 3...', 50);

      // Call Part 3
      chatHistory.push({ role: 'user', content: 'Next Part.' });
      part3Text = await callAPI({
        provider,
        baseUrl,
        headers,
        model: apiModel,
        systemInstruction,
        messages: chatHistory,
        onReasoning: (text) => {
          if (onReasoning) onReasoning(text, 'Part 3: Conclusion & FAQ');
        }
      });

      finalArticleText = `${part1Text}\n\n${part2Text}\n\n${part3Text}`;
      
      // Extract META description before stripping it
      const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
      seoMeta = metaMatch ? metaMatch[1].trim() : '';
      
      // Strip any AI stop-marker artifacts that should never appear in final output
      finalArticleText = cleanArticleText(finalArticleText);
      
      if (onDraftUpdate) onDraftUpdate(finalArticleText);
      onProgress('Stitching Part 1, 2, and 3...', 65);
    }
  }

  // 3. STAGE 2: HEADING FORMATTER (skipped for quickTest and articleV15 modes)
  let formattedArticle = finalArticleText;

  // Stage 2A: For bridge-generated articles (V86/V13), use OpenCode Zen + free Mistral for heading formatting
  const canFormatHeadings = hasMistralKeys || (!!apiKey && apiKey.trim().length > 10);
  if (fromBridge && (mode === 'articleV86' || mode === 'articleV13') && canFormatHeadings) {
    onProgress('Format & SEO: Adding H2/H3 headings (Mistral free via OpenCode)...', 75);
    try {
      const formattingPrompt = templates.headingFormatter.replace('{article_content}', finalArticleText);
      const formatterKey = hasMistralKeys ? getMistralKey(0) : apiKey;
      let rawFormatted = await callAPI({
        provider: 'opencode',
        baseUrl: '/api-opencode/zen/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${formatterKey}` },
        model: 'mimo-v2.5-free',
        systemInstruction: 'You are an expert content formatting editor. Follow the rules exactly. Output ONLY the formatted article text. Do NOT add any introductory text, concluding remarks, or markdown horizontal rules before/after the content.',
        messages: [{ role: 'user', content: formattingPrompt }],
        onReasoning: (text) => { if (onReasoning) onReasoning(text, 'Format & SEO: H2/H3 Headings'); }
      });
      if (rawFormatted) {
        rawFormatted = rawFormatted.replace(/^(?:Here's|Here is|Below is|Sure|Certainly)[^\n]*\n+/i, '').replace(/^---+\n+/i, '').trim();
        formattedArticle = rawFormatted;
      }
    } catch (err) {
      console.warn('[api] Heading formatter failed (non-fatal):', err.message);
      if (onProgress) onProgress(`⚠️ Heading formatter error: ${err.message}`, 78);
      formattedArticle = finalArticleText;
    }
  }

  // Stage 2B: For direct API articles (non-bridge), use same provider for heading formatting
  if (!fromBridge &&
      mode !== 'quickTest' &&
      mode !== 'articleV15' &&
      mode !== 'imageOnly' &&
      mode !== 'articleV10' &&
      mode !== 'articleV13' &&
      mode !== 'articleV14' &&
      mode !== 'articleV86') {
    onProgress('Reformatting article structure (Applying Heading Making System)...', 75);
    const formattingPrompt = templates.headingFormatter.replace('{article_content}', finalArticleText);
    let rawFormatted = await callAPI({
      provider,
      baseUrl,
      headers,
      model: apiModel,
      systemInstruction: 'You are an expert content formatting editor. Follow the rules exactly. Output ONLY the formatted article text. Do NOT add any introductory text, concluding remarks, or markdown horizontal rules before/after the content.',
      messages: [{ role: 'user', content: formattingPrompt }],
      onReasoning: (text) => {
        if (onReasoning) onReasoning(text, 'Pinterest Mobile Formatting');
      }
    });

    if (rawFormatted) {
      rawFormatted = rawFormatted.replace(/^(?:Here's|Here is|Below is|Sure|Certainly)[^\n]*\n+/i, '').replace(/^---+\n+/i, '').trim();
      formattedArticle = rawFormatted;
    }
  }

  // Wait for background image generations to complete
  onProgress('Awaiting parallel image prompts completion...', 85);
  const [blogImagePrompts, pinterestImagePrompts] = await Promise.all([
    blogImagePromptsPromise.catch(err => {
      console.warn('[api] Blog image prompts failed:', err.message);
      if (onProgress) onProgress(`⚠️ Blog image prompts error: ${err.message}`, 87);
      return '';
    }),
    pinterestImagePromptsPromise.catch(err => {
      console.warn('[api] Pinterest image prompts failed:', err.message);
      if (onProgress) onProgress(`⚠️ Pinterest image prompts error: ${err.message}`, 89);
      return '';
    })
  ]);

  const result = {
    rawArticle: finalArticleText,
    formattedArticle: formattedArticle,
    blogImagePrompts: blogImagePrompts,
    pinterestImagePrompts: pinterestImagePrompts,
    seoMeta: seoMeta,
    mode: mode,
    responseModel: detectedModel
  };

  if (supabase) {
    onProgress('Saving article data to Supabase database...', 98);
    await saveArticleToSupabase({
      keyword: keyword,
      title: blogTitle,
      rawArticle: result.rawArticle,
      formattedArticle: result.formattedArticle,
      blogImagePrompts: result.blogImagePrompts,
      pinterestImagePrompts: result.pinterestImagePrompts,
      seoMeta: result.seoMeta
    });
  }

  onProgress('All stages completed successfully!', 100);

  return result;
}

const FREE_MODEL_FALLBACKS = [
  'mimo-v2.5-free',
  'nemotron-3-ultra-free',
  'deepseek-v4-flash-free'
];

async function callAPI({ provider, baseUrl, headers, model, systemInstruction, messages, onReasoning, maxTokens, timeout }) {
  const modelsToTry = [model];
  if (provider === 'opencode' && FREE_MODEL_FALLBACKS.includes(model)) {
    // Append other free models as fallbacks if the primary fails
    FREE_MODEL_FALLBACKS.forEach(m => {
      if (m !== model) {
        modelsToTry.push(m);
      }
    });
  }

  let lastError = null;

  for (let currentModelIndex = 0; currentModelIndex < modelsToTry.length; currentModelIndex++) {
    const currentModel = modelsToTry[currentModelIndex];
    // For the primary model, we allow 2 attempts. For fallbacks, we try once to keep it fast.
    const maxAttempts = currentModelIndex === 0 ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isFreeModel = FREE_MODEL_FALLBACKS.includes(currentModel);
      try {
        let body = {};

        if (provider === 'gemini') {
          // Map roles: user -> user, assistant -> model
          const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          }));

          body = {
            contents,
            systemInstruction: systemInstruction ? {
              parts: [{ text: systemInstruction }]
            } : undefined,
            generationConfig: {
              maxOutputTokens: maxTokens || 8192,
              temperature: 0.8
            }
          };
        } else if (provider === 'openai' || provider === 'opencode' || provider === 'mistral') {
          const chatMessages = [];
          if (systemInstruction) {
            chatMessages.push({ role: 'system', content: systemInstruction });
          }
          chatMessages.push(...messages);

          // On retry, add a nudge to force actual content output
          if (attempt > 1) {
            chatMessages.push({
              role: 'user',
              content: 'Please write the content now. Do not leave the response empty. Output the full text directly.'
            });
          }

          body = {
            model: currentModel,
            messages: chatMessages,
            temperature: 0.8,
            ...(maxTokens ? { max_tokens: maxTokens } : {})
          };
        }

        // Determine request timeout: 180 seconds for free models, 900 seconds for reasoning/paid models (like big-pickle)
        const timeoutMs = timeout || (isFreeModel ? 180000 : 900000);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        let response;
        try {
          const requestHeaders = { ...headers };
          if (provider === 'mistral' && MISTRAL_KEYS.length > 0) {
            const randomIndex = Math.floor(Math.random() * MISTRAL_KEYS.length);
            const key = MISTRAL_KEYS[randomIndex];
            requestHeaders['Authorization'] = `Bearer ${key}`;
          }

          response = await fetch(baseUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            throw new Error(`API call timed out after ${timeoutMs / 1000} seconds.`);
          }
          throw fetchErr;
        }

        if (!response.ok) {
          const errorText = await response.text();
          let parsedError;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            parsedError = errorText;
          }
          throw new Error(`Status ${response.status} - ${JSON.stringify(parsedError.error?.message || parsedError)}`);
        }

        const data = await response.json();

        if (provider === 'gemini') {
          if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error(`Invalid Gemini response format: ${JSON.stringify(data)}`);
          }
          return data.candidates[0].content.parts[0].text;

        } else if (provider === 'openai' || provider === 'opencode' || provider === 'mistral') {
          const msg = data.choices?.[0]?.message;

          // Handle reasoning content (for thinking models)
          const reasoning = msg?.reasoning_content || '';
          if (reasoning && onReasoning) {
            onReasoning(reasoning);
          }

          const content = msg?.content || '';

          if (!content || content.trim() === '') {
            throw new Error('The AI model returned empty content.');
          }

          return content;
        }

      } catch (err) {
        lastError = err;
        console.warn(`[API Attempt Failure] Model: ${currentModel} | Attempt: ${attempt}/${maxAttempts} | Error: ${err.message}`);
        
        // For free models, if there is ANY error (timeout, 500, 503, etc.), skip retries and switch immediately to the next fallback
        if (isFreeModel && modelsToTry.length > 1 && currentModelIndex < modelsToTry.length - 1) {
          console.warn(`Model ${currentModel} failed. Switching immediately to next fallback...`);
          break; // Break attempts loop to move to next model in the outer loop
        }

        if (attempt < maxAttempts) {
          // Wait 2 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  throw new Error(`API call failed for all attempted models. Last error: ${lastError?.message}`);
}



