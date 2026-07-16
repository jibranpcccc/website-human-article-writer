import { templates } from './templates.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
const MISTRAL_KEYS = (import.meta.env.VITE_MISTRAL_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

function getMistralKey(index) {
  if (MISTRAL_KEYS.length === 0) return null;
  return MISTRAL_KEYS[index % MISTRAL_KEYS.length];
}

const hasMistralKeys = MISTRAL_KEYS.length > 0;
const IMAGE_PROMPT_MODEL = hasMistralKeys ? 'mistral-large-latest' : 'mimo-v2.5-free';
const IMAGE_PROMPT_MAX_TOKENS = 6000; // Optimal limit for chunked prompts to prevent cutoff

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
  if (!apiKey) {
    throw new Error('API Key is required to run generation.');
  }

  // Normalize model name for OpenCode Big Pickle
  const apiModel = model === 'opencode/big-pickle' ? 'big-pickle' : model;

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

  // Dynamic Image Prompt API Selection — via Vite proxy
  const imageProvider = hasMistralKeys ? 'mistral' : 'opencode';
  let imageBaseUrl = hasMistralKeys ? '/api-mistral/v1/chat/completions' : '/api-opencode/zen/v1/chat/completions';

  function getImageHeaders(keyIndex) {
    const key = hasMistralKeys ? getMistralKey(keyIndex) : apiKey;
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    };
  }

  // Image prompts use KEYWORD ONLY — completely independent of article content
  const blogTitle = keyword;
  const { gender, ageRange } = extractGenderAndAge(keyword);

  // ── CONCURRENT BACKGROUND IMAGE PROMPT GENERATION ──
  // Start image prompt generation concurrently right as article generation starts!
  const blogImagePromptsPromise = (async () => {
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

  let finalArticleText = '';
  let part1Text = '';
  let part2Text = '';
  let part3Text = '';
  let seoMeta = '';

  // 2. STAGE 1: ARTICLE GENERATION
  if (mode === 'quickTest') {
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

  } else if (mode === 'articleV10') {
    onProgress('Generating human article in one go (Version 10.0)...', 15);
    const systemInstruction = "You are a professional hairstylist with 15 years experience. You write in a casual, direct, opinionated, and authentic tone. Follow your instructions precisely.";
    
    const v10Prompt = templates.articleV10.replace('{keyword}', keyword);

    finalArticleText = await callAPI({
      provider,
      baseUrl,
      headers,
      model: apiModel,
      systemInstruction,
      messages: [{ role: 'user', content: v10Prompt }],
      onReasoning: (text) => {
        if (onReasoning) onReasoning(text, 'Human Article V10 Drafting');
      }
    });

    // Extract META description
    const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
    seoMeta = metaMatch ? metaMatch[1].trim() : '';
    finalArticleText = finalArticleText.replace(/\[META\]:.*?\n/gi, '').trim();

    if (onDraftUpdate) onDraftUpdate(finalArticleText);
    onProgress('Draft completed. Preparing for heading formatter...', 65);

  } else if (mode === 'articleV106') {
    onProgress('Generating human article in one go (Version 10.6)...', 15);
    const systemInstruction = "You are a professional hairstylist with 15 years experience. You write in a casual, direct, opinionated, and authentic tone. Follow your instructions precisely.";
    
    const v106Prompt = templates.articleV106.replace('{keyword}', keyword);

    finalArticleText = await callAPI({
      provider,
      baseUrl,
      headers,
      model: apiModel,
      systemInstruction,
      messages: [{ role: 'user', content: v106Prompt }],
      onReasoning: (text) => {
        if (onReasoning) onReasoning(text, 'Human Article V10.6 Drafting');
      }
    });

    // Extract META description
    const metaMatch = finalArticleText.match(/\[META\]:\s*(.+)/i);
    seoMeta = metaMatch ? metaMatch[1].trim() : '';
    finalArticleText = finalArticleText.replace(/\[META\]:.*?\n/gi, '').trim();

    if (onDraftUpdate) onDraftUpdate(finalArticleText);
    onProgress('Draft completed. Preparing for heading formatter...', 65);

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
    finalArticleText = finalArticleText
      .replace(/\[Stop\.\s*Write Part \d+ next\.\]/gi, '')
      .replace(/\*\*NEXT PART\*\*/gi, '')
      .replace(/---\s*\n*\[PART \d+\]/gi, '')
      .replace(/\[Continue article directly\..*?\]/gi, '')
      .replace(/\[Body text.*?\]/gi, '')
      .replace(/\[META\]:.*?\n/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (onDraftUpdate) onDraftUpdate(finalArticleText);
    onProgress('Stitching Part 1, 2, and 3...', 65);
  }

  // 3. STAGE 2: HEADING FORMATTER (skipped for quickTest mode)
  let formattedArticle = finalArticleText;
  if (mode !== 'quickTest') {
    onProgress('Reformatting article structure (Applying Heading Making System)...', 75);
    const formattingPrompt = templates.headingFormatter.replace('{article_content}', finalArticleText);
    formattedArticle = await callAPI({
      provider,
      baseUrl,
      headers,
      model: apiModel,
      systemInstruction: 'You are an expert content formatting editor. Follow the rules exactly.',
      messages: [{ role: 'user', content: formattingPrompt }],
      onReasoning: (text) => {
        if (onReasoning) onReasoning(text, 'Pinterest Mobile Formatting');
      }
    });
  }

  // Wait for background image generations to complete
  onProgress('Awaiting parallel image prompts completion...', 85);
  const [blogImagePrompts, pinterestImagePrompts] = await Promise.all([
    blogImagePromptsPromise,
    pinterestImagePromptsPromise
  ]);

  const result = {
    rawArticle: finalArticleText,
    formattedArticle: formattedArticle,
    blogImagePrompts: blogImagePrompts,
    pinterestImagePrompts: pinterestImagePrompts,
    seoMeta: seoMeta,
    mode: mode
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

        // Determine request timeout: 180 seconds for free models, 300 seconds for reasoning/paid models (like big-pickle)
        const timeoutMs = timeout || (isFreeModel ? 180000 : 300000);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        let response;
        try {
          response = await fetch(baseUrl, {
            method: 'POST',
            headers,
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



