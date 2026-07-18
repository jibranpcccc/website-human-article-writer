import { generateContent } from './api.js';
import { checkBridgeHealth } from './bridgeClient.js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Safe localStorage JSON parser with fallback
function safeParseJSON(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (e) {
    console.warn(`Failed to parse localStorage key "${key}", using fallback.`, e);
    return fallback;
  }
}

// HTML escape helper for plain text inserted into the DOM
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// STATE MANAGEMENT
const STATE = {
  theme: localStorage.getItem('theme') || 'dark',
  apiKey: localStorage.getItem('apiKey') || '',
  provider: localStorage.getItem('provider') || 'opencode',
  model: localStorage.getItem('model') || 'big-pickle',
  mode: localStorage.getItem('mode') || 'articleV10',
  keyword: '',
  supportingKeywords: '',
  activeWebsite: localStorage.getItem('activeWebsite') || '',
  history: [],
  activeArticleMarkdown: '',
  activeBlogPromptsMarkdown: '',
  activePinterestPromptsMarkdown: '',
  activeRawBlogPromptsList: [],
  activeRawPinterestPromptsList: [],
  isBatchRunning: false,
  isBatchCancelled: false
};

const VALID_MODES = ['articleV15', 'articleV86', 'articleV10', 'articleV13', 'articleV14', 'listicle', 'quickTest', 'imageOnly'];
if (!VALID_MODES.includes(STATE.mode)) {
  STATE.mode = 'articleV14';
  localStorage.setItem('mode', 'articleV14');
}

// Pre-fill OpenCode key if provider is opencode and no key is stored
if (STATE.provider === 'opencode' && (!STATE.apiKey || STATE.apiKey === 'null' || STATE.apiKey === 'undefined' || STATE.apiKey.trim() === '')) {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_OPENCODE_API_KEY) {
    STATE.apiKey = import.meta.env.VITE_OPENCODE_API_KEY;
  }
}

// DOM ELEMENTS
const DOM = {
  themeToggle: document.getElementById('theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),
  providerSelect: document.getElementById('provider-select'),
  modelSelect: document.getElementById('model-select'),
  apiKeyInput: document.getElementById('api-key-input'),
  modeSelect: document.getElementById('mode-select'),
  keywordInput: document.getElementById('keyword-input'),
  supportingKeywordsGroup: document.getElementById('supporting-keywords-group'),
  supportingKeywordsInput: document.getElementById('supporting-keywords-input'),
  generateBtn: document.getElementById('generate-btn'),
  
  progressPanel: document.getElementById('progress-panel'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressStatus: document.getElementById('progress-status'),
  progressLog: document.getElementById('progress-log'),
  
  resultsContainer: document.getElementById('results-container'),
  articleBody: document.getElementById('article-body'),
  
  blogPromptsBody: document.getElementById('blog-prompts-body'),
  pinterestPromptsBody: document.getElementById('pinterest-prompts-body'),
  
  copyArticleBtn: document.getElementById('copy-article-btn'),
  downloadArticleBtn: document.getElementById('download-article-btn'),
  downloadWordBtn: document.getElementById('download-word-btn'),
  
  copyBlogPromptsBtn: document.getElementById('copy-blog-prompts-btn'),
  copyRawBlogPromptsBtn: document.getElementById('copy-raw-blog-prompts-btn'),
  copyPinterestPromptsBtn: document.getElementById('copy-pinterest-prompts-btn'),
  copyRawPinterestPromptsBtn: document.getElementById('copy-raw-pinterest-prompts-btn'),
  
  historyList: document.getElementById('history-list'),
  downloadZipAllBtn: document.getElementById('download-zip-all-btn'),
  downloadSequentialBtn: document.getElementById('download-sequential-btn'),

  // Visual Pipeline & live draft
  liveDraftPreview: document.getElementById('live-draft-preview'),
  liveWordCount: document.getElementById('live-word-count'),
  
  // Results Tabs
  resultsTabs: document.getElementById('results-tabs'),
  articleTabView: document.getElementById('article-tab-view'),
  blogPromptsTabView: document.getElementById('blog-prompts-tab-view'),
  pinterestPromptsTabView: document.getElementById('pinterest-prompts-tab-view'),
  tabArticleBtn: document.getElementById('tab-article-btn'),
  tabBlogPromptsBtn: document.getElementById('tab-blog-prompts-btn'),
  tabPinterestPromptsBtn: document.getElementById('tab-pinterest-prompts-btn'),
  
  // SEO Metadata
  seoTitlePreview: document.getElementById('seo-title-preview'),
  seoDescPreview: document.getElementById('seo-desc-preview'),
  seoMetaCard: document.getElementById('seo-meta-card'),

  // AI Thinking
  thinkingContainer: document.getElementById('thinking-container'),
  thinkingStageTitle: document.getElementById('thinking-stage-title'),
  thinkingPreviewBox: document.getElementById('thinking-preview-box'),

  // Batch Queue Mappings
  cancelBatchBtn: document.getElementById('cancel-batch-btn'),
  batchQueueContainer: document.getElementById('batch-queue-container'),
  batchQueueList: document.getElementById('batch-queue-list'),
  
  // Timer & History Search/Stats elements
  liveTimer: document.getElementById('live-timer'),
  generationTimeValue: document.getElementById('generation-time-value'),
  historySearchInput: document.getElementById('history-search-input'),
  statsTotalArticles: document.getElementById('stats-total-articles'),
  statsTotalWords: document.getElementById('stats-total-words')
};

// MODELS ROTATION BY PROVIDER
const MODELS = {
  gemini: [
    { value: 'gemini-2.5-flash', text: 'Gemini 2.5 Flash (Recommended)' },
    { value: 'gemini-1.5-flash', text: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-pro', text: 'Gemini 1.5 Pro' }
  ],
  openai: [
    { value: 'gpt-4o-mini', text: 'GPT-4o Mini (Fast)' },
    { value: 'gpt-4o', text: 'GPT-4o (High Quality)' }
  ],
  opencode: [
    { value: 'big-pickle', text: 'OpenCode Big Pickle (Reasoning)' }
  ],
  bigPickleBridge: [
    { value: 'chatgpt-browser', text: 'BigPickle → ChatGPT Browser' }
  ]
};
function init() {
  // Check if active website is set. If not, show modal overlay.
  const modal = document.getElementById('website-selector-modal');
  if (!STATE.activeWebsite) {
    if (modal) modal.style.display = 'flex';
  } else {
    if (modal) modal.style.display = 'none';
    loadWebsiteWorkspace(STATE.activeWebsite);
  }

  // 1. Setup Theme
  document.documentElement.setAttribute('data-theme', STATE.theme);
  updateThemeIcon();

  // 2. Setup Inputs from Saved State
  DOM.apiKeyInput.value = STATE.apiKey;
  DOM.providerSelect.value = STATE.provider;
  DOM.modeSelect.value = STATE.mode;
  

  updateModelOptions();
  DOM.modelSelect.value = STATE.model;
  toggleSupportingKeywords();

  // 3. Bind Events
  DOM.themeToggle.addEventListener('click', toggleTheme);
  DOM.providerSelect.addEventListener('change', handleProviderChange);
  DOM.modelSelect.addEventListener('change', (e) => {
    STATE.model = e.target.value;
    localStorage.setItem('model', STATE.model);
  });
  DOM.apiKeyInput.addEventListener('input', (e) => {
    STATE.apiKey = e.target.value;
    localStorage.setItem('apiKey', STATE.apiKey);
  });
  DOM.modeSelect.addEventListener('change', handleModeChange);
  DOM.generateBtn.addEventListener('click', handleGenerate);
  
  DOM.copyArticleBtn.addEventListener('click', copyArticle);
  DOM.downloadArticleBtn.addEventListener('click', downloadArticle);
  DOM.downloadWordBtn.addEventListener('click', downloadWordDoc);
  document.getElementById('download-zip-btn').addEventListener('click', downloadZipPack);
  DOM.copyBlogPromptsBtn.addEventListener('click', () => copyPrompts('blog'));
  DOM.copyRawBlogPromptsBtn.addEventListener('click', () => copyRawPrompts('blog'));
  DOM.copyPinterestPromptsBtn.addEventListener('click', () => copyPrompts('pinterest'));
  DOM.copyRawPinterestPromptsBtn.addEventListener('click', () => copyRawPrompts('pinterest'));
  if (DOM.downloadZipAllBtn) DOM.downloadZipAllBtn.addEventListener('click', downloadAllHistoryAsZip);
  if (DOM.downloadSequentialBtn) DOM.downloadSequentialBtn.addEventListener('click', downloadAllHistorySequential);
  DOM.historySearchInput.addEventListener('input', () => {
    renderHistory();
  });

  DOM.cancelBatchBtn.addEventListener('click', () => {
    STATE.isBatchCancelled = true;
    DOM.cancelBatchBtn.disabled = true;
    DOM.cancelBatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...';
    logProgress('Cancellation request received. Stopping after current item completes...', 'error');
  });
}

// WEBSITE WORKSPACE MANAGERS
window.selectWebsiteFromModal = function(websiteName) {
  STATE.activeWebsite = websiteName;
  localStorage.setItem('activeWebsite', websiteName);
  const modal = document.getElementById('website-selector-modal');
  if (modal) modal.style.display = 'none';
  loadWebsiteWorkspace(websiteName);
};

window.switchWebsite = function(websiteName) {
  if (STATE.isBatchRunning) {
    alert('Cannot switch workspace while a generation batch is running.');
    return;
  }
  loadWebsiteWorkspace(websiteName);
  showCopyToast(`Switched to ${websiteName === 'tressatlas' ? 'TressAtlas' : 'TressCrew'} workspace.`);
};

function loadWebsiteWorkspace(websiteName) {
  STATE.activeWebsite = websiteName;
  localStorage.setItem('activeWebsite', websiteName);
  document.documentElement.setAttribute('data-site', websiteName);

  // Update UI header texts
  const titleEl = document.getElementById('website-active-title');
  const subtitleEl = document.getElementById('website-subtitle');
  if (titleEl) titleEl.textContent = websiteName === 'tressatlas' ? 'TressAtlas Prompt Engine' : 'TressCrew Prompt Engine';
  if (subtitleEl) subtitleEl.textContent = `Managing assets for ${websiteName}.com`;

  // Update switcher pills active styling
  const btnAtlas = document.getElementById('btn-switch-tressatlas');
  const btnCrew = document.getElementById('btn-switch-tresscrew');
  if (btnAtlas && btnCrew) {
    if (websiteName === 'tressatlas') {
      btnAtlas.style.backgroundColor = 'var(--primary)';
      btnAtlas.style.color = 'white';
      btnCrew.style.backgroundColor = 'transparent';
      btnCrew.style.color = 'var(--text-secondary)';
    } else {
      btnCrew.style.backgroundColor = 'var(--primary)';
      btnCrew.style.color = 'white';
      btnAtlas.style.backgroundColor = 'transparent';
      btnAtlas.style.color = 'var(--text-secondary)';
    }
  }

  // Load and render history for this specific site
  STATE.history = safeParseJSON(`generation_history_${websiteName}`, []);
  renderHistory();

  // Clear current result displays to avoid mixing data
  clearCurrentDisplayOnly();
}

function clearCurrentDisplayOnly() {
  DOM.resultsTabs.style.display = 'none';
  DOM.resultsContainer.style.display = 'none';
  STATE.activeArticleMarkdown = '';
  STATE.activeBlogPromptsMarkdown = '';
  STATE.activePinterestPromptsMarkdown = '';
  STATE.activeRawBlogPromptsList = [];
  STATE.activeRawPinterestPromptsList = [];
  document.getElementById('article-body').innerHTML = '';
  document.getElementById('blog-prompts-body').innerHTML = '';
  document.getElementById('pinterest-prompts-body').innerHTML = '';
  document.getElementById('seo-meta-card').style.display = 'none';
}

function downloadZipPack() {
  if (!STATE.activeArticleMarkdown && !STATE.activeBlogPromptsMarkdown && !STATE.activeRawPinterestPromptsList.length) {
    alert('No generated content available to package.');
    return;
  }

  const cleanTitle = getCleanArticleTitle();
  const zip = new JSZip();

  // File 1 & 2: Article (Markdown & Word Document) - only if article markdown exists
  if (STATE.activeArticleMarkdown) {
    zip.file(`${cleanTitle}.md`, STATE.activeArticleMarkdown);

    const htmlContent = DOMPurify.sanitize(marked.parse(STATE.activeArticleMarkdown));
    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${cleanTitle}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; padding: 1in; }
          h1 { font-family: 'Georgia', serif; font-size: 24pt; font-weight: bold; color: #0f172a; margin-bottom: 12pt; }
          h2 { font-family: 'Georgia', serif; font-size: 16pt; font-weight: bold; color: #1e293b; margin-top: 24pt; margin-bottom: 8pt; }
          h3 { font-family: 'Georgia', serif; font-size: 13pt; font-weight: bold; color: #334155; margin-top: 18pt; margin-bottom: 6pt; }
          p { margin-bottom: 10pt; text-align: justify; }
          ul, ol { margin-bottom: 12pt; padding-left: 20pt; }
          li { margin-bottom: 4pt; }
          hr { border: 0; border-top: 1px solid #cbd5e1; margin: 24pt 0; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    zip.file(`${cleanTitle}.doc`, docHtml);
  }

  // File 3: Blog post prompts (Text)
  zip.file(`${cleanTitle} - Blog Post Image Prompts.txt`, STATE.activeBlogPromptsMarkdown);

  // File 4: Pinterest prompts (Text) - strictly 1 prompt per line, no newlines inside each prompt
  const pinterestRawText = STATE.activeRawPinterestPromptsList
    .map(p => p.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim())
    .join('\n');
  zip.file(`${cleanTitle} - Pinterest Image Prompts.txt`, pinterestRawText);

  // File 5: SEO Metadata (Text)
  const seoTitleText = DOM.seoTitlePreview.textContent || STATE.keyword;
  const seoDescText = DOM.seoDescPreview.textContent || '';
  const seoMetaFileContent = `SEO Title: ${seoTitleText}\nMeta Description: ${seoDescText}\n`;
  zip.file(`${cleanTitle} - SEO Meta Details.txt`, seoMetaFileContent);

  zip.generateAsync({ type: 'blob' }).then(function(content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showCopyToast('ZIP pack downloaded successfully!');
  }).catch(err => {
    console.error('ZIP generation failed:', err);
    alert('Failed to generate ZIP file: ' + err.message);
  });
}

// THEME TOGGLE
function toggleTheme() {
  STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', STATE.theme);
  localStorage.setItem('theme', STATE.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  if (STATE.theme === 'dark') {
    DOM.themeIcon.className = 'fas fa-sun';
  } else {
    DOM.themeIcon.className = 'fas fa-moon';
  }
}

// PROVIDER CHANGES
function handleProviderChange(e) {
  const newProvider = e.target.value;
  STATE.provider = newProvider;
  localStorage.setItem('provider', STATE.provider);
  updateModelOptions();
  STATE.model = DOM.modelSelect.value;
  localStorage.setItem('model', STATE.model);
  updateBridgeHealthIndicator();

  if (newProvider === 'opencode') {
    if (!STATE.apiKey || STATE.apiKey.trim() === '') {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_OPENCODE_API_KEY) {
        STATE.apiKey = import.meta.env.VITE_OPENCODE_API_KEY;
        DOM.apiKeyInput.value = STATE.apiKey;
        localStorage.setItem('apiKey', STATE.apiKey);
      }
    }
  } else if (newProvider === 'bigPickleBridge') {
    checkBridgeHealth().then(healthy => setBridgeHealthIndicator(healthy)).catch(() => setBridgeHealthIndicator(false));
  }
}

function updateBridgeHealthIndicator() {
  const existing = document.getElementById('bridge-health-indicator');
  if (existing) existing.remove();
}

function setBridgeHealthIndicator(healthy) {
  // Place the indicator next to the model select
  const afterEl = DOM.modelSelect.parentElement || DOM.modelSelect;
  const existing = document.getElementById('bridge-health-indicator');
  if (existing) existing.remove();

  const dot = document.createElement('span');
  dot.id = 'bridge-health-indicator';
  const color = healthy ? 'var(--success)' : 'var(--error)';
  const title = healthy ? 'BigPickle bridge reachable' : 'BigPickle bridge unreachable';
  dot.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-left:8px;box-shadow:0 0 6px ${color};" title="${title}"></span>`;
  afterEl.appendChild(dot);
}

function updateModelOptions() {
  const options = MODELS[STATE.provider] || [];
  DOM.modelSelect.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('');
}

// MODE CHANGES
function handleModeChange(e) {
  STATE.mode = e.target.value;
  localStorage.setItem('mode', STATE.mode);
  toggleSupportingKeywords();
}

function toggleSupportingKeywords() {
  if (STATE.mode === 'listicle') {
    DOM.supportingKeywordsGroup.style.display = 'flex';
  } else {
    DOM.supportingKeywordsGroup.style.display = 'none';
  }
}

// TIMER HELPERS FOR GENERATION TIME LOGS
let liveTimerInterval = null;
let liveTimerSeconds = 0;

function startLiveTimer() {
  if (DOM.liveTimer) {
    DOM.liveTimer.style.display = 'inline-block';
    DOM.liveTimer.textContent = '00:00';
  }
  liveTimerSeconds = 0;
  clearInterval(liveTimerInterval);
  liveTimerInterval = setInterval(() => {
    liveTimerSeconds++;
    const mins = Math.floor(liveTimerSeconds / 60);
    const secs = liveTimerSeconds % 60;
    const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (DOM.liveTimer) DOM.liveTimer.textContent = formatted;
  }, 1000);
}

function stopLiveTimer() {
  clearInterval(liveTimerInterval);
  if (DOM.liveTimer) DOM.liveTimer.style.display = 'none';
}

function formatDuration(totalSeconds) {
  if (!totalSeconds) return 'N/A';
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

// GENERATION TRIGGER
async function handleGenerate() {
  const rawKeywords = DOM.keywordInput.value || '';
  const keywords = rawKeywords.split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (keywords.length === 0) {
    alert('Please enter at least one target keyword.');
    return;
  }
  if (!STATE.apiKey && STATE.provider !== 'bigPickleBridge') {
    alert('Please enter an API Key in the settings sidebar.');
    return;
  }

  STATE.supportingKeywords = DOM.supportingKeywordsInput.value.trim();

  // Set Batch Running States
  STATE.isBatchRunning = true;
  STATE.isBatchCancelled = false;

  // Toggle UI
  DOM.generateBtn.disabled = true;
  DOM.generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating Batch...';
  DOM.progressPanel.style.display = 'flex';
  
  // Show/Hide Cancel button based on keyword count
  if (keywords.length > 1) {
    DOM.cancelBatchBtn.style.display = 'block';
    DOM.cancelBatchBtn.disabled = false;
    DOM.cancelBatchBtn.innerHTML = '<i class="fas fa-ban"></i> Cancel Batch';
  } else {
    DOM.cancelBatchBtn.style.display = 'none';
  }

  // Set up visual batch queue (escape keyword text for safety)
  DOM.batchQueueList.innerHTML = keywords.map((kw, idx) => {
    const safeKw = escapeHtml(kw);
    return `
    <div id="queue-item-${idx}" style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; background-color: rgba(255,255,255,0.01); border: 1px solid transparent; transition: all 0.2s ease;">
      <span class="queue-status-bullet" id="queue-bullet-${idx}" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--text-muted); display: inline-block;"></span>
      <span class="queue-keyword-name" style="flex-grow: 1; font-weight: 500;">${safeKw}</span>
      <span class="queue-status-text" id="queue-status-text-${idx}" style="font-size: 0.65rem; color: var(--text-muted);">Waiting</span>
    </div>
  `;
  }).join('');
  DOM.batchQueueContainer.style.display = 'flex';

  let successCount = 0;

  // Batch loop
  for (let i = 0; i < keywords.length; i++) {
    if (STATE.isBatchCancelled) {
      logProgress('Batch generation cancelled by user.', 'error');
      break;
    }

    const currentKeyword = keywords[i];
    STATE.keyword = currentKeyword;

    // Update queue list visuals for current active item
    updateQueueItemVisual(i, 'active', 'Generating...');

    // Clear logs and reset pipeline visual cards for the active keyword run
    DOM.progressLog.innerHTML = '';
    logProgress(`Starting batch item ${i + 1} of ${keywords.length}: "${currentKeyword}"`);
    
    // Clear live preview & thinking box
    DOM.liveDraftPreview.textContent = '[Draft content will begin streaming here...]';
    DOM.liveWordCount.textContent = '0 words';
    DOM.thinkingContainer.style.display = 'none';
    DOM.thinkingStageTitle.textContent = 'Preparing...';
    DOM.thinkingPreviewBox.textContent = '[AI will analyze requirements and show reasoning here...]';
    
    // Show a subtle "generating" banner on top of any existing results instead of hiding them
    const existingBanner = document.getElementById('generating-banner');
    if (!existingBanner && DOM.resultsTabs.style.display !== 'none') {
      const banner = document.createElement('div');
      banner.id = 'generating-banner';
      banner.style.cssText = 'background: linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.15)); border: 1px solid rgba(99,102,241,0.4); border-radius: 8px; padding: 10px 16px; font-size: 0.82rem; color: var(--primary); display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
      const bannerIcon = document.createElement('i');
      bannerIcon.className = 'fas fa-spinner fa-spin';
      banner.appendChild(bannerIcon);
      banner.appendChild(document.createTextNode(' New article generating for '));
      const bannerStrong = document.createElement('strong');
      bannerStrong.textContent = `"${escapeHtml(currentKeyword)}"`;
      banner.appendChild(bannerStrong);
      banner.appendChild(document.createTextNode(' — your previous results are still here below'));
      DOM.resultsTabs.parentNode.insertBefore(banner, DOM.resultsTabs);
    }

    startLiveTimer();
    resetPipelineVisuals();
    updateProgress(`Starting generation for "${currentKeyword}"...`, 5);

    try {
      const result = await generateContent({
        provider: STATE.provider,
        apiKey: STATE.apiKey,
        model: STATE.model,
        mode: STATE.mode,
        keyword: currentKeyword,
        supportingKeywords: STATE.supportingKeywords,
        renderProxyUrl: undefined,
        onProgress: (status, percent) => {
          updateProgress(status, percent);
        },
        onDraftUpdate: (draftText) => {
          DOM.liveDraftPreview.textContent = draftText;
          const words = draftText.trim().split(/\s+/).filter(w => w.length > 0).length;
          DOM.liveWordCount.textContent = `${words} words`;
        },
        onReasoning: (reasoningText, stageName) => {
          DOM.thinkingContainer.style.display = 'flex';
          DOM.thinkingStageTitle.textContent = stageName;
          DOM.thinkingPreviewBox.textContent = reasoningText;
          DOM.thinkingPreviewBox.scrollTop = DOM.thinkingPreviewBox.scrollHeight;
        }
      });

      stopLiveTimer();
      const elapsedSeconds = liveTimerSeconds;
      if (DOM.generationTimeValue) DOM.generationTimeValue.textContent = formatDuration(elapsedSeconds);

      // Render results
      renderResults(result);

      // Save to history list with duration
      saveToHistory(result, elapsedSeconds);

      // Update queue item to completed
      updateQueueItemVisual(i, 'completed', 'Done ✓');
      successCount++;

    } catch (err) {
      stopLiveTimer();
      console.error(err);
      logProgress(`Failed to generate "${currentKeyword}": ${err.message}`, 'error');
      updateQueueItemVisual(i, 'failed', 'Failed ✗');
      // Continue loop for other keywords in the batch queue even if one fails
    }
  }

  // Batch loop completed or cancelled
  STATE.isBatchRunning = false;
  DOM.generateBtn.disabled = false;
  DOM.generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate Full Output';
  DOM.cancelBatchBtn.style.display = 'none';

  if (STATE.isBatchCancelled) {
    alert(`Batch generation cancelled. ${successCount} articles completed.`);
  } else {
    alert(`Batch generation complete! ${successCount} of ${keywords.length} articles generated successfully.`);
  }
}

// PROGRESS VIEW UTIL

function updateProgress(message, percentage) {
  DOM.progressBarFill.style.width = `${percentage}%`;
  DOM.progressStatus.textContent = `${percentage}% - ${message}`;
  updatePipelineVisuals(percentage);
  logProgress(message);
}

function resetPipelineVisuals() {
  const stepIds = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'];
  stepIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.className = 'pipeline-step';
      const statusEl = el.querySelector('.step-status');
      if (statusEl) statusEl.textContent = 'Waiting';
    }
  });
}

function updatePipelineVisuals(percent) {
  const steps = [
    { id: 'step-1', min: 10, max: 29 },
    { id: 'step-2', min: 30, max: 49 },
    { id: 'step-3', min: 50, max: 64 },
    { id: 'step-4', min: 65, max: 84 },
    { id: 'step-5', min: 85, max: 99 }
  ];

  steps.forEach((s) => {
    const el = document.getElementById(s.id);
    if (!el) return;
    const statusEl = el.querySelector('.step-status');
    
    if (percent >= 100) {
      el.className = 'pipeline-step completed';
      if (statusEl) statusEl.textContent = 'Done ✓';
    } else if (percent >= s.min && percent <= s.max) {
      el.className = 'pipeline-step active';
      if (statusEl) statusEl.textContent = 'Running...';
    } else if (percent > s.max) {
      el.className = 'pipeline-step completed';
      if (statusEl) statusEl.textContent = 'Done ✓';
    } else {
      el.className = 'pipeline-step';
      if (statusEl) statusEl.textContent = 'Waiting';
    }
  });
}

function logProgress(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const color = type === 'error' ? 'var(--error)' : 'var(--success)';
  const logEl = document.createElement('div');
  const timeSpan = document.createElement('span');
  timeSpan.style.color = 'var(--text-muted)';
  timeSpan.textContent = `[${timestamp}] `;
  const msgSpan = document.createElement('span');
  msgSpan.style.color = color;
  msgSpan.textContent = message;
  logEl.appendChild(timeSpan);
  logEl.appendChild(msgSpan);
  DOM.progressLog.appendChild(logEl);
  DOM.progressLog.scrollTop = DOM.progressLog.scrollHeight;
}

// RENDER GENERATED RESULTS
function renderResults(result) {
  const modelLabel = result.responseModel || (STATE.provider === 'bigPickleBridge' ? 'ChatGPT Browser' : STATE.model);
  // Remove the generating banner if it exists
  const existingBanner = document.getElementById('generating-banner');
  if (existingBanner) existingBanner.remove();

  DOM.resultsContainer.style.display = 'grid';
  DOM.resultsTabs.style.display = 'flex';

  // Always show image tabs
  DOM.tabBlogPromptsBtn.style.display = 'block';
  DOM.tabPinterestPromptsBtn.style.display = 'block';

  // Save raw markdown values in STATE
  STATE.activeArticleMarkdown = result.formattedArticle || '';
  STATE.activeBlogPromptsMarkdown = result.blogImagePrompts || result.imagePrompts || '';
  STATE.activePinterestPromptsMarkdown = result.pinterestImagePrompts || '';

  // Render both prompt sets
  renderImagePrompts(STATE.activeBlogPromptsMarkdown, 'blog');
  renderImagePrompts(STATE.activePinterestPromptsMarkdown, 'pinterest');

  // Parse SEO Title (H1) and Meta Description
  let cleanArticle = result.formattedArticle || '';
  let metaDesc = result.seoMeta || `Explore the best options and ideas for ${STATE.keyword}. Practical tips from a real stylist's perspective.`;
  let seoTitle = `${STATE.keyword}`;

  const titleMatch = cleanArticle.match(/#\s+([^\n]+)/);
  if (titleMatch) seoTitle = titleMatch[1].trim();

  DOM.seoTitlePreview.textContent = seoTitle;
  DOM.seoDescPreview.textContent = metaDesc;

  // Mode-specific layout visibility
  if (result.mode === 'imageOnly') {
    DOM.tabArticleBtn.style.display = 'none';
    DOM.seoMetaCard.style.display = 'none';
    switchResultTab('blog-prompts');
  } else {
    DOM.tabArticleBtn.style.display = 'block';
    DOM.seoMetaCard.style.display = 'flex';
    switchResultTab('article');
  }

  // Render Formatted Article
  DOM.articleBody.innerHTML = cleanArticle ? DOMPurify.sanitize(marked.parse(cleanArticle)) : '';
}


function renderImagePrompts(rawPromptsText, targetType) {
  // Reset visual prompts list for target type
  if (targetType === 'pinterest') {
    STATE.activeRawPinterestPromptsList = [];
  } else {
    STATE.activeRawBlogPromptsList = [];
  }

  // Parse prompts out of the structured output
  const cardsHtml = [];
  
  // Split sections by "prompt [number]:" or "prompt:" or "prompt [Image Number]:"
  const sections = rawPromptsText.split(/(?:^|\n)prompt\s*\[?[^:\n\d]*\d*\]?\s*:\s*/i);
  
  if (sections.length <= 1) {
    // Fallback if formatting was different
    const fallbackHtml = `<div class="image-prompt-card"><div class="image-prompt-body">${escapeHtml(rawPromptsText)}</div></div>`;
    if (targetType === 'pinterest') {
      DOM.pinterestPromptsBody.innerHTML = fallbackHtml;
      STATE.activeRawPinterestPromptsList = [rawPromptsText];
    } else {
      DOM.blogPromptsBody.innerHTML = fallbackHtml;
      STATE.activeRawBlogPromptsList = [rawPromptsText];
    }
    return;
  }

  // Iterate over each parsed image card
  for (let i = 1; i < sections.length; i++) {
    const rawCard = sections[i].trim();
    if (!rawCard) continue;

    // Parse prompt and negative prompt
    const negativeMatch = rawCard.match(/Negative Prompt:\s*([\s\S]+)$/i);
    const prompt = negativeMatch ? rawCard.slice(0, rawCard.indexOf(negativeMatch[0])).trim() : rawCard;
    const negativePrompt = negativeMatch ? negativeMatch[1].trim() : '';

    // Extract exact hairstyle from the prompt content if possible
    let hairstyle = 'Hairstyle Details';
    const hairStyleMatch = prompt.match(/showing a \d+-year-old [^\s]+ woman with ([^,\.]+)/i) || 
                           prompt.match(/showing a [^\s]+ with ([^,\.]+)/i) || 
                           prompt.match(/showing ([^,\.]+)/i);
    if (hairStyleMatch) {
      hairstyle = hairStyleMatch[1].trim();
    }
    if (hairstyle.length > 30) {
      hairstyle = hairstyle.slice(0, 30) + '...';
    }

    if (prompt) {
      if (targetType === 'pinterest') {
        STATE.activeRawPinterestPromptsList.push(prompt);
      } else {
        STATE.activeRawBlogPromptsList.push(prompt);
      }
    }

    const escapedPrompt = encodeURIComponent(prompt).replace(/'/g, '\\\'');

    cardsHtml.push(`
      <div class="image-prompt-card">
        <div class="image-prompt-header">
          <span class="image-prompt-number">Image ${i}</span>
          <span class="badge badge-primary">${escapeHtml(hairstyle)}</span>
        </div>
        <div class="image-prompt-meta" style="font-size: 0.82rem; margin-top: 8px;">
          <div style="margin-bottom: 8px;"><strong>Full Prompt:</strong> <span style="color: var(--text-secondary);">${escapeHtml(prompt)}</span></div>
          <div><strong>Negative Prompt:</strong> <span style="color: var(--text-muted); font-size: 0.78rem;">${escapeHtml(negativePrompt)}</span></div>
        </div>
        <div class="image-prompt-body" id="prompt-text-${targetType}-${i}" style="display: none;">${escapeHtml(prompt)} Negative Prompt: ${escapeHtml(negativePrompt)}</div>
        
        <!-- Live Image Preview Box -->
        <div class="image-preview-container" id="preview-container-${targetType}-${i}" style="display: none; margin-top: 12px; border-radius: var(--radius-sm); overflow: hidden; background-color: var(--bg-primary); border: 1px solid var(--border-color); aspect-ratio: 3/4; position: relative;">
          <img id="preview-img-${targetType}-${i}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s ease;" alt="Hairstyle Preview" />
          <div class="preview-spinner" id="preview-spinner-${targetType}-${i}" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-secondary); font-size: 0.8rem;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primary);"></i>
            <span>Generating realistic photo...</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;">
          <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('prompt-text-${targetType}-${i}').innerText).then(()=>{ const t=document.createElement('div'); t.textContent='✓ Copied!'; t.style='position:fixed;bottom:24px;right:24px;background:#6366f1;color:white;padding:10px 18px;border-radius:8px;z-index:9999;font-weight:600;'; document.body.appendChild(t); setTimeout(()=>t.remove(),2000); })" style="padding: 6px 10px; font-size: 0.75rem; width: auto; margin: 0;">
            <i class="fas fa-copy"></i> Copy Prompt
          </button>
          <button class="btn btn-primary" onclick="window.generateVisualPreview('${targetType}', ${i}, '${escapedPrompt}')" style="padding: 6px 10px; font-size: 0.75rem; width: auto; margin: 0; background: linear-gradient(135deg, var(--primary), var(--secondary)); border: none;">
            <i class="fas fa-eye"></i> View Image
          </button>
        </div>
      </div>
    `);
  }

  if (targetType === 'pinterest') {
    DOM.pinterestPromptsBody.innerHTML = cardsHtml.join('');
  } else {
    DOM.blogPromptsBody.innerHTML = cardsHtml.join('');
  }
}

// COPY UTILITIES
function copyArticle() {
  if (!STATE.activeArticleMarkdown) {
    alert('No article available to copy.');
    return;
  }
  navigator.clipboard.writeText(STATE.activeArticleMarkdown);
  alert('Article copied to clipboard in Markdown format!');
}

function getCleanArticleTitle() {
  let title = '';
  // Try parsing from the SEO Title Preview first
  if (DOM.seoTitlePreview && DOM.seoTitlePreview.textContent) {
    title = DOM.seoTitlePreview.textContent.trim();
  }
  
  // If not available, try parsing the first # line of the markdown
  if (!title && STATE.activeArticleMarkdown) {
    const firstLine = STATE.activeArticleMarkdown.split('\n')[0] || '';
    if (firstLine.startsWith('# ')) {
      title = firstLine.substring(2).trim();
    }
  }
  
  // Fallback to keyword
  if (!title) {
    title = STATE.keyword || 'article';
  }

  // Remove invalid filename characters on Windows/OS: \ / : * ? " < > | [ ]
  return title.replace(/[\\/:*?"<>|\[\]]/g, '').trim();
}

function downloadArticle() {
  if (!STATE.activeArticleMarkdown) {
    alert('No article available to download.');
    return;
  }
  const cleanTitle = getCleanArticleTitle();
  const blob = new Blob([STATE.activeArticleMarkdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanTitle}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadWordDoc() {
  if (!STATE.activeArticleMarkdown) {
    alert('No article available to download.');
    return;
  }
  const cleanTitle = getCleanArticleTitle();
  const htmlContent = DOMPurify.sanitize(marked.parse(STATE.activeArticleMarkdown));
  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>${cleanTitle}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; padding: 1in; }
        h1 { font-family: 'Georgia', serif; font-size: 24pt; font-weight: bold; color: #0f172a; margin-bottom: 12pt; }
        h2 { font-family: 'Georgia', serif; font-size: 16pt; font-weight: bold; color: #1e293b; margin-top: 24pt; margin-bottom: 8pt; }
        h3 { font-family: 'Georgia', serif; font-size: 13pt; font-weight: bold; color: #334155; margin-top: 18pt; margin-bottom: 6pt; }
        p { margin-bottom: 10pt; text-align: justify; }
        ul, ol { margin-bottom: 12pt; padding-left: 20pt; }
        li { margin-bottom: 4pt; }
        hr { border: 0; border-top: 1px solid #cbd5e1; margin: 24pt 0; }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;
  const blob = new Blob([docHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanTitle}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showCopyToast(message) {
  const existing = document.getElementById('copy-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'copy-toast';
  const icon = document.createElement('i');
  icon.className = 'fas fa-check-circle';
  toast.appendChild(icon);
  toast.appendChild(document.createTextNode(` ${message}`));
  toast.style.cssText = `
    position: fixed; bottom: 32px; right: 32px; z-index: 9999;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    color: white; padding: 14px 22px; border-radius: 10px;
    font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 10px;
    box-shadow: 0 8px 24px rgba(99,102,241,0.5);
    animation: fadeIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function copyPrompts(targetType) {
  // Primary: use stored markdown state
  const markdown = targetType === 'pinterest' ? STATE.activePinterestPromptsMarkdown : STATE.activeBlogPromptsMarkdown;
  if (markdown && markdown.trim()) {
    navigator.clipboard.writeText(markdown.trim())
      .then(() => showCopyToast(`All ${targetType === 'pinterest' ? '30 Pinterest' : '20 Blog Post'} image prompts copied!`))
      .catch(() => {
        // Clipboard API failed, use execCommand fallback
        const ta = document.createElement('textarea');
        ta.value = markdown.trim();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopyToast(`All ${targetType === 'pinterest' ? '30 Pinterest' : '20 Blog Post'} image prompts copied!`);
      });
    return;
  }
  // Fallback: collect all visible prompt text elements from the DOM
  const bodyEl = targetType === 'pinterest' ? DOM.pinterestPromptsBody : DOM.blogPromptsBody;
  const allCards = bodyEl ? bodyEl.querySelectorAll('.image-prompt-body') : [];
  if (allCards.length === 0) {
    showCopyToast('No prompts found to copy — generate content first.');
    return;
  }
  const combined = Array.from(allCards).map((el, i) => `--- Image ${i + 1} ---\n${el.innerText}`).join('\n\n');
  navigator.clipboard.writeText(combined)
    .then(() => showCopyToast(`${allCards.length} prompts copied from page!`));
}

function copyRawPrompts(targetType) {
  // Always use the stored Full Prompt list — extracted 'Full Prompt:' field only
  // (no blueprints, no headers, no negative prompts — just the raw image prompt text)
  const list = targetType === 'pinterest'
    ? STATE.activeRawPinterestPromptsList
    : STATE.activeRawBlogPromptsList;

  if (list && list.length > 0) {
    let text;
    if (targetType === 'pinterest') {
      // 1 prompt per line, clean and single-line format
      text = list.map(p => p.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()).join('\n');
    } else {
      // Numbered block style for blog posts
      text = list.map((p, i) => `${i + 1}.\n${p.trim()}`).join('\n\n---\n\n');
    }
    
    navigator.clipboard.writeText(text)
      .then(() => showCopyToast(`✓ ${list.length} clean ${targetType === 'pinterest' ? 'Pinterest (1 per line)' : 'Blog Post'} prompts copied!`))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopyToast(`✓ ${list.length} clean prompts copied!`);
      });
    return;
  }

  showCopyToast('No prompts available — generate content first.');
}



// HISTORY LOGGING
function saveToHistory(result, durationSeconds = 0) {
  const words = result.formattedArticle.split(/\s+/).filter(w => w.length > 0).length;

  const newEntry = {
    id: Date.now(),
    keyword: STATE.keyword,
    mode: result.mode || STATE.mode,
    date: new Date().toLocaleDateString(),
    wordCount: words,
    rawArticle: result.rawArticle || '',
    formattedArticle: result.formattedArticle,
    blogImagePrompts: result.blogImagePrompts || result.imagePrompts || '',
    pinterestImagePrompts: result.pinterestImagePrompts || '',
    seoMeta: result.seoMeta || '',
    duration: durationSeconds
  };

  STATE.history.unshift(newEntry);
  localStorage.setItem(`generation_history_${STATE.activeWebsite}`, JSON.stringify(STATE.history));
  renderHistory();
}

function renderHistory() {
  // Update overall stats based on full history list
  const totalArticles = STATE.history.length;
  const totalWords = STATE.history.reduce((sum, item) => sum + (item.wordCount || 0), 0);
  if (DOM.statsTotalArticles) DOM.statsTotalArticles.textContent = totalArticles;
  if (DOM.statsTotalWords) DOM.statsTotalWords.textContent = totalWords.toLocaleString();

  if (STATE.history.length === 0) {
    if (DOM.downloadZipAllBtn) DOM.downloadZipAllBtn.style.display = 'none';
    if (DOM.downloadSequentialBtn) DOM.downloadSequentialBtn.style.display = 'none';
    DOM.historyList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 16px;">No saved articles yet.</div>';
    return;
  }

  if (DOM.downloadZipAllBtn) DOM.downloadZipAllBtn.style.display = 'block';
  if (DOM.downloadSequentialBtn) DOM.downloadSequentialBtn.style.display = 'block';

  // Apply search query filter
  const searchQuery = (DOM.historySearchInput ? DOM.historySearchInput.value : '').toLowerCase().trim();
  const filteredHistory = STATE.history.filter(item => item.keyword.toLowerCase().includes(searchQuery));

  if (filteredHistory.length === 0) {
    DOM.historyList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 16px;">No matching articles.</div>';
    return;
  }

  DOM.historyList.innerHTML = filteredHistory.map(item => `
    <div class="history-item ${item.mode === 'imageOnly' ? 'image-only-item' : ''}" data-id="${item.id}" title="Click to load this article" style="cursor: pointer;">
      <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
        <div style="flex: 1; min-width: 0;">
          <span class="title" style="display: block; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-weight: 600; font-size: 0.82rem;">${escapeHtml(item.keyword)}</span>
          <div class="meta" style="display: flex; gap: 5px; align-items: center; margin-top: 4px; flex-wrap: wrap;">
            <span class="badge" style="font-size: 0.55rem; padding: 2px 5px; ${
              item.mode === 'quickTest' ? 'background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #93c5fd;' :
              item.mode === 'listicle' ? 'background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); color: #fde047;' :
              item.mode === 'imageOnly' ? 'background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3); color: #c084fc;' :
              'background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7;'
            }">${
              item.mode === 'quickTest' ? '⚡ Test' :
              item.mode === 'listicle' ? '📋 List' :
              item.mode === 'imageOnly' ? '🎨 Images' :
              '✍️ Human'
            }</span>
            <span style="font-size: 0.65rem; color: var(--text-muted);">${item.date}</span>
            ${item.mode === 'imageOnly' ? `
              <span style="font-size: 0.65rem; color: var(--text-muted);">• Prompts Only</span>
            ` : `
              <span style="font-size: 0.65rem; color: var(--text-muted);">• ${item.wordCount ? item.wordCount.toLocaleString() : '0'} words</span>
            `}
            ${item.duration ? `
              <span class="badge" style="font-size: 0.55rem; padding: 2px 5px; background-color: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.2); color: #34d399; font-family: monospace;">
                <i class="far fa-clock"></i> ${formatDuration(item.duration)}
              </span>
            ` : ''}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <span style="color: var(--primary); font-size: 0.7rem; opacity: 0.7;">
            <i class="fas fa-external-link-alt"></i>
          </span>
          <button class="delete-history-btn" data-id="${item.id}" title="Delete this article" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.75rem; padding: 2px 5px; border-radius: 4px; line-height: 1; transition: all 0.15s ease;" onmouseover="this.style.color='#ef4444'; this.style.background='rgba(239,68,68,0.1)';" onmouseout="this.style.color='var(--text-muted)'; this.style.background='none';">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Load click events (skip if delete button was clicked)
  DOM.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-history-btn')) return; // ignore delete clicks
      const id = parseInt(item.getAttribute('data-id'));
      const entry = STATE.history.find(h => h.id === id);
      if (entry) {
        DOM.keywordInput.value = entry.keyword;
        
        // Render results tab
        renderResults({
          rawArticle: entry.rawArticle || '',
          formattedArticle: entry.formattedArticle,
          blogImagePrompts: entry.blogImagePrompts || '',
          pinterestImagePrompts: entry.pinterestImagePrompts || '',
          seoMeta: entry.seoMeta || '',
          mode: entry.mode
        });

        // Set duration stats badge
        const badge = document.getElementById('generation-stats-badge');
        const badgeValue = document.getElementById('generation-time-value');
        if (badge && badgeValue) {
          if (entry.duration) {
            badge.style.display = 'flex';
            badgeValue.textContent = formatDuration(entry.duration);
          } else {
            badge.style.display = 'none';
          }
        }
      }
    });
  });

  // Delete click events
  DOM.historyList.querySelectorAll('.delete-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute('data-id'));
      deleteFromHistory(id);
    });
  });
}

// DELETE SINGLE HISTORY ITEM
function deleteFromHistory(id) {
  STATE.history = STATE.history.filter(h => h.id !== id);
  localStorage.setItem(`generation_history_${STATE.activeWebsite}`, JSON.stringify(STATE.history));
  renderHistory();
  showCopyToast('Article deleted from history.');
}

// CLEAR ALL HISTORY
window.clearAllHistory = function() {
  if (STATE.history.length === 0) {
    showCopyToast('History is already empty.');
    return;
  }
  STATE.history = [];
  localStorage.removeItem(`generation_history_${STATE.activeWebsite}`);
  renderHistory();
  showCopyToast(`All saved articles cleared for ${STATE.activeWebsite === 'tressatlas' ? 'TressAtlas' : 'TressCrew'}.`);
};

// CLEAR CURRENT DISPLAYED RESULTS
window.clearCurrentResults = function() {
  // Hide results area
  DOM.resultsTabs.style.display = 'none';
  DOM.resultsContainer.style.display = 'none';
  // Clear state
  STATE.activeArticleMarkdown = '';
  STATE.activeBlogPromptsMarkdown = '';
  STATE.activePinterestPromptsMarkdown = '';
  STATE.activeRawBlogPromptsList = [];
  STATE.activeRawPinterestPromptsList = [];
  // Clear DOM
  document.getElementById('article-body').innerHTML = '';
  document.getElementById('blog-prompts-body').innerHTML = '';
  document.getElementById('pinterest-prompts-body').innerHTML = '';
  document.getElementById('seo-meta-card').style.display = 'none';
  // Clear keyword input
  DOM.keywordInput.value = '';
  showCopyToast('Current results cleared. Ready for a fresh generation.');
};

// Live Image Preview Generator Function (exposed globally)
window.generateVisualPreview = function(targetType, index, encodedPrompt) {
  const container = document.getElementById(`preview-container-${targetType}-${index}`);
  const img = document.getElementById(`preview-img-${targetType}-${index}`);
  const spinner = document.getElementById(`preview-spinner-${targetType}-${index}`);
  
  if (!container || !img || !spinner) return;
  
  // Show elements
  container.style.display = 'block';
  img.style.opacity = '0';
  spinner.style.display = 'flex';
  
  const seed = Math.floor(Math.random() * 1000000);
  const decodedPrompt = decodeURIComponent(encodedPrompt);
  
  // Clean up markdown formatting characters (*, _, #, `, [, ]) and consolidate extra spaces
  let cleanPrompt = decodedPrompt
    .replace(/[*_#`\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Slice text to keep the prompt length within safe URL bounds for quick and reliable rendering
  if (cleanPrompt.length > 350) {
    cleanPrompt = cleanPrompt.substring(0, 350);
  }
  
  const promptQuery = encodeURIComponent(
    cleanPrompt + ", highly detailed realistic everyday photo, shot on mobile phone, 3:4 aspect ratio"
  );
  
  img.src = `https://image.pollinations.ai/p/${promptQuery}?width=600&height=800&nologo=true&seed=${seed}`;
  
  img.onload = () => {
    spinner.style.display = 'none';
    img.style.opacity = '1';
  };
  
  img.onerror = () => {
    spinner.innerHTML = `
      <i class="fas fa-exclamation-triangle" style="color: var(--error); font-size: 1.5rem; margin-bottom: 6px;"></i>
      <span style="color: var(--error);">Failed to load image. Click again to retry.</span>
    `;
  };
};

window.switchResultTab = function(tabName) {
  DOM.articleTabView.style.display = 'none';
  DOM.blogPromptsTabView.style.display = 'none';
  DOM.pinterestPromptsTabView.style.display = 'none';
  
  DOM.tabArticleBtn.classList.remove('active');
  DOM.tabBlogPromptsBtn.classList.remove('active');
  DOM.tabPinterestPromptsBtn.classList.remove('active');
  
  DOM.tabBlogPromptsBtn.classList.remove('image-only-active');
  DOM.tabPinterestPromptsBtn.classList.remove('image-only-active');

  const isImageOnly = (STATE.activeArticleMarkdown === '' && STATE.activeBlogPromptsMarkdown !== '');
  
  if (tabName === 'article') {
    DOM.tabArticleBtn.classList.add('active');
    DOM.articleTabView.style.display = 'flex';
  } else if (tabName === 'blog-prompts') {
    DOM.tabBlogPromptsBtn.classList.add('active');
    if (isImageOnly) DOM.tabBlogPromptsBtn.classList.add('image-only-active');
    DOM.blogPromptsTabView.style.display = 'flex';
  } else if (tabName === 'pinterest-prompts') {
    DOM.tabPinterestPromptsBtn.classList.add('active');
    if (isImageOnly) DOM.tabPinterestPromptsBtn.classList.add('image-only-active');
    DOM.pinterestPromptsTabView.style.display = 'flex';
  }
};

function getCleanEntryTitle(entry) {
  let title = '';
  if (entry.seoMeta) {
    const titleMatch = entry.seoMeta.match(/SEO Title:\s*([^\n\r]+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
  }
  if (!title && entry.formattedArticle) {
    const firstLine = entry.formattedArticle.split('\n')[0] || '';
    if (firstLine.startsWith('# ')) {
      title = firstLine.substring(2).trim();
    }
  }
  if (!title) {
    title = entry.keyword || 'article';
  }
  return title.replace(/[\\/:*?"<>|\[\]]/g, '').trim();
}

function downloadAllHistoryAsZip() {
  if (STATE.history.length === 0) {
    alert('No articles saved to compile.');
    return;
  }

  const zip = new JSZip();

  STATE.history.forEach(entry => {
    const cleanTitle = getCleanEntryTitle(entry);
    const folder = zip.folder(cleanTitle);

    // File 1: Markdown (.md)
    folder.file(`${cleanTitle}.md`, entry.formattedArticle);

    // File 2: Word Document (.doc) - with CSS styled typography and margins
    const htmlContent = DOMPurify.sanitize(marked.parse(entry.formattedArticle));
    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${cleanTitle}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; padding: 1in; }
          h1 { font-family: 'Georgia', serif; font-size: 24pt; font-weight: bold; color: #0f172a; margin-bottom: 12pt; }
          h2 { font-family: 'Georgia', serif; font-size: 16pt; font-weight: bold; color: #1e293b; margin-top: 24pt; margin-bottom: 8pt; }
          h3 { font-family: 'Georgia', serif; font-size: 13pt; font-weight: bold; color: #334155; margin-top: 18pt; margin-bottom: 6pt; }
          p { margin-bottom: 10pt; text-align: justify; }
          ul, ol { margin-bottom: 12pt; padding-left: 20pt; }
          li { margin-bottom: 4pt; }
          hr { border: 0; border-top: 1px solid #cbd5e1; margin: 24pt 0; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    folder.file(`${cleanTitle}.doc`, docHtml);

    // File 3: Blog post prompts (Text)
    folder.file(`${cleanTitle} - Blog Post Image Prompts.txt`, entry.blogImagePrompts || '');

    // File 4: Pinterest prompts (Text) - strictly 1 prompt per line, no newlines inside each prompt
    let rawPinterestList = [];
    if (entry.pinterestImagePrompts) {
      const sections = entry.pinterestImagePrompts.split(/(?:^|\n)prompt\s*\[?[^:\n\d]*\d*\]?\s*:\s*/i);
      for (let i = 1; i < sections.length; i++) {
        const rawCard = sections[i].trim();
        if (!rawCard) continue;
        const negativeMatch = rawCard.match(/Negative Prompt:\s*([\s\S]+)$/i);
        const prompt = negativeMatch ? rawCard.slice(0, rawCard.indexOf(negativeMatch[0])).trim() : rawCard;
        if (prompt) {
          rawPinterestList.push(prompt);
        }
      }
    }
    const pinterestRawText = rawPinterestList
      .map(p => p.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim())
      .join('\n');
    folder.file(`${cleanTitle} - Pinterest Image Prompts.txt`, pinterestRawText);

    // File 5: SEO Metadata (Text)
    let seoTitleText = entry.keyword;
    let seoDescText = '';
    if (entry.seoMeta) {
      const titleMatch = entry.seoMeta.match(/SEO Title:\s*([^\n\r]+)/i);
      if (titleMatch) seoTitleText = titleMatch[1].trim();
      const descMatch = entry.seoMeta.match(/Meta Description:\s*([\s\S]+)$/i);
      if (descMatch) seoDescText = descMatch[1].trim();
    }
    const seoMetaFileContent = `SEO Title: ${seoTitleText}\nMeta Description: ${seoDescText}\n`;
    folder.file(`${cleanTitle} - SEO Meta Details.txt`, seoMetaFileContent);
  });

  zip.generateAsync({ type: 'blob' }).then(function(content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `All_Articles_Backup_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showCopyToast('All saved articles backup ZIP downloaded successfully!');
  });
}

async function downloadAllHistorySequential() {
  if (STATE.history.length === 0) {
    alert('No articles saved to download.');
    return;
  }

  if (!confirm(`This will trigger ${STATE.history.length} separate ZIP downloads. Please make sure to allow multiple file downloads if prompted by your browser. Do you want to proceed?`)) {
    return;
  }

  for (let idx = 0; idx < STATE.history.length; idx++) {
    const entry = STATE.history[idx];
    const cleanTitle = getCleanEntryTitle(entry);
    
    const zip = new JSZip();

    // File 1: Markdown (.md)
    zip.file(`${cleanTitle}.md`, entry.formattedArticle);

    // File 2: Word Document (.doc) - with CSS styled typography and margins
    const htmlContent = DOMPurify.sanitize(marked.parse(entry.formattedArticle));
    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${cleanTitle}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; padding: 1in; }
          h1 { font-family: 'Georgia', serif; font-size: 24pt; font-weight: bold; color: #0f172a; margin-bottom: 12pt; }
          h2 { font-family: 'Georgia', serif; font-size: 16pt; font-weight: bold; color: #1e293b; margin-top: 24pt; margin-bottom: 8pt; }
          h3 { font-family: 'Georgia', serif; font-size: 13pt; font-weight: bold; color: #334155; margin-top: 18pt; margin-bottom: 6pt; }
          p { margin-bottom: 10pt; text-align: justify; }
          ul, ol { margin-bottom: 12pt; padding-left: 20pt; }
          li { margin-bottom: 4pt; }
          hr { border: 0; border-top: 1px solid #cbd5e1; margin: 24pt 0; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    zip.file(`${cleanTitle}.doc`, docHtml);

    // File 3: Blog post prompts (Text)
    zip.file(`${cleanTitle} - Blog Post Image Prompts.txt`, entry.blogImagePrompts || '');

    // File 4: Pinterest prompts (Text) - strictly 1 prompt per line, no newlines inside each prompt
    let rawPinterestList = [];
    if (entry.pinterestImagePrompts) {
      const sections = entry.pinterestImagePrompts.split(/(?:^|\n)prompt\s*\[?[^:\n\d]*\d*\]?\s*:\s*/i);
      for (let i = 1; i < sections.length; i++) {
        const rawCard = sections[i].trim();
        if (!rawCard) continue;
        const negativeMatch = rawCard.match(/Negative Prompt:\s*([\s\S]+)$/i);
        const prompt = negativeMatch ? rawCard.slice(0, rawCard.indexOf(negativeMatch[0])).trim() : rawCard;
        if (prompt) {
          rawPinterestList.push(prompt);
        }
      }
    }
    const pinterestRawText = rawPinterestList
      .map(p => p.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim())
      .join('\n');
    zip.file(`${cleanTitle} - Pinterest Image Prompts.txt`, pinterestRawText);

    // File 5: SEO Metadata (Text)
    let seoTitleText = entry.keyword;
    let seoDescText = '';
    if (entry.seoMeta) {
      const titleMatch = entry.seoMeta.match(/SEO Title:\s*([^\n\r]+)/i);
      if (titleMatch) seoTitleText = titleMatch[1].trim();
      const descMatch = entry.seoMeta.match(/Meta Description:\s*([\s\S]+)$/i);
      if (descMatch) seoDescText = descMatch[1].trim();
    }
    const seoMetaFileContent = `SEO Title: ${seoTitleText}\nMeta Description: ${seoDescText}\n`;
    zip.file(`${cleanTitle} - SEO Meta Details.txt`, seoMetaFileContent);

    // Generate and trigger download
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Sleep for 350ms to ensure browser starts each download successfully
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  showCopyToast('All individual ZIP packs downloaded sequentially!');
}

function updateQueueItemVisual(index, state, statusText) {
  const bullet = document.getElementById(`queue-bullet-${index}`);
  const status = document.getElementById(`queue-status-text-${index}`);
  const item = document.getElementById(`queue-item-${index}`);
  
  if (!bullet || !status || !item) return;

  if (state === 'active') {
    bullet.style.backgroundColor = 'var(--primary)';
    bullet.style.boxShadow = '0 0 8px var(--primary-glow)';
    status.style.color = 'var(--primary)';
    status.textContent = statusText;
    item.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
    item.style.borderColor = 'rgba(99, 102, 241, 0.3)';
  } else if (state === 'completed') {
    bullet.style.backgroundColor = 'var(--success)';
    bullet.style.boxShadow = 'none';
    status.style.color = 'var(--success)';
    status.textContent = statusText;
    item.style.backgroundColor = 'rgba(16, 185, 129, 0.04)';
    item.style.borderColor = 'rgba(16, 185, 129, 0.2)';
  } else if (state === 'failed') {
    bullet.style.backgroundColor = 'var(--error)';
    bullet.style.boxShadow = 'none';
    status.style.color = 'var(--error)';
    status.textContent = statusText;
    item.style.backgroundColor = 'rgba(239, 68, 68, 0.04)';
    item.style.borderColor = 'rgba(239, 68, 68, 0.2)';
  }
}

// Initialize when page runs
init();