import { chromium } from 'playwright';
import { CHATGPT_URL, HEADLESS, SESSION_DIR, DEFAULT_TIMEOUT_MS, CDP_HOST } from './config.js';

/**
 * BigPickle ChatGPT Driver
 *
 * Uses Playwright with a persistent context to keep the user logged in,
 * or connects to an existing Chrome via CDP if BIGPICKLE_CDP_HOST is reachable.
 */

let context = null;
let page = null;
let browser = null;
let detectedModel = 'ChatGPT';

export async function getPage() {
  if (page && !page.isClosed()) return page;

  // Prefer connecting to user's existing Chrome with remote debugging
  try {
    const resp = await fetch(`${CDP_HOST}/json/version`);
    if (resp.ok) {
      browser = await chromium.connectOverCDP(CDP_HOST);
      const existing = browser.contexts()[0];
      context = existing || await browser.newContext();
      page = context.pages()[0] || await context.newPage();
      console.log('[driver] connected to existing Chrome via CDP at', CDP_HOST);
    }
  } catch (err) {
    console.log('[driver] no CDP browser found, launching persistent context:', err.message);
  }

  if (!browser) {
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: HEADLESS,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ],
      viewport: { width: 1280, height: 800 }
    });
    context = browser;
    page = browser.pages()[0] || await browser.newPage();
  }

  if (!page.url().includes('chatgpt.com')) {
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
  return page;
}

export function isLoginPage(page) {
  const url = page.url();
  return url.includes('/auth/login') || url.includes('/auth/');
}

async function waitForPromptArea(page, timeout = 15000) {
  const selectors = [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'div[contenteditable="true"]'
  ];
  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, { timeout });
      if (el) return el;
    } catch {}
  }
  throw new Error('ChatGPT prompt textarea not found. Are you logged in?');
}

/**
 * Read the active ChatGPT model name from the UI.
 */
async function detectActiveModel(page) {
  return page.evaluate(() => {
    const patterns = [
      'button[aria-haspopup="menu"]',
      '[data-testid="model-selector"]',
      '[data-testid="model-switcher"]',
      'button[aria-label*="model" i]',
      'button[aria-label*="Select model" i]',
      'div[class*="model"] button'
    ];
    for (const sel of patterns) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        const txt = el.innerText.replace(/\s+/g, ' ').trim();
        if (txt && txt.length < 80) return txt;
      }
    }
    return 'ChatGPT';
  });
}

/**
 * Try to enable temporary chat mode.
 */
async function enableTemporaryChat(page) {
  const url = page.url();
  if (!url.includes('temporary-chat=true')) {
    const newUrl = new URL(url);
    newUrl.searchParams.set('temporary-chat', 'true');
    await page.goto(newUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
  }

  try {
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('div, span, button, a'));
      const temp = labels.find(el => /temporary chat/i.test(el.innerText || el.textContent || ''));
      if (temp) {
        let clickable = temp.closest('button, a, [role="switch"]') || temp;
        clickable.click();
      }
    });
  } catch (e) {
    // ignore toggle errors; URL param is the main mechanism
  }
}

async function clickSendOrPressEnter(page) {
  await page.waitForTimeout(400);

  // Try finding and clicking enabled send button
  const sendBtnLocator = page.locator('button[data-testid="send-button"], button[aria-label*="Send" i]').first();
  const sendCount = await sendBtnLocator.count();

  if (sendCount > 0) {
    const isDisabled = await sendBtnLocator.isDisabled().catch(() => false);
    if (!isDisabled) {
      console.log('[driver] clicking send button...');
      await sendBtnLocator.click({ force: true });
      return;
    }
  }

  // Fallback to keyboard press
  console.log('[driver] send button disabled or not found, pressing Enter...');
  await page.keyboard.press('Enter');
}

async function setPromptTextInstantly(page, text) {
  const promptArea = page.locator('#prompt-textarea, [data-testid="prompt-textarea"], div[contenteditable="true"]').first();
  await promptArea.waitFor({ timeout: 15000 });
  await promptArea.click();
  await page.waitForTimeout(200);

  // Clear existing text natively
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  // Insert text via keyboard.insertText (triggers all ProseMirror/React state handlers)
  await page.keyboard.insertText(text);
  await page.waitForTimeout(300);

  // Fallback check: if text was not inserted, evaluate DOM insert
  const hasText = await page.evaluate(() => {
    const el = document.querySelector('#prompt-textarea') || 
               document.querySelector('[data-testid="prompt-textarea"]') ||
               document.querySelector('div[contenteditable="true"]');
    return el && (el.innerText || el.textContent || '').trim().length > 5;
  });

  if (!hasText) {
    await page.evaluate((t) => {
      const el = document.querySelector('#prompt-textarea') || 
                 document.querySelector('[data-testid="prompt-textarea"]') ||
                 document.querySelector('div[contenteditable="true"]');
      if (el) {
        el.focus();
        const success = document.execCommand('insertText', false, t);
        if (!success || !el.innerText || el.innerText.length < 5) {
          el.innerText = t;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, text);
  }

  return promptArea;
}

async function sendConversationTurn(page, text, timeoutMs = DEFAULT_TIMEOUT_MS) {
  await setPromptTextInstantly(page, text);
  await clickSendOrPressEnter(page);
  await waitForResponseComplete(page, timeoutMs);
  return getLastResponse(page);
}

function stripDuplicateH1AndMeta(text) {
  return text
    .replace(/^\s*\[META\]:.*$/gim, '')
    .replace(/^\s*#\s+.+$/gim, '')
    .trim();
}

export async function selectMediumIntelligence(page) {
  try {
    console.log('[driver] checking intelligence selector...');

    const pill = page.locator('button, [class*="composer-pill"]').filter({
      hasText: /^(High|Instant|Low|Standard|Auto)$/i
    });

    const count = await pill.count();
    if (count === 0) {
      const isMedium = await page.locator('button, [class*="composer-pill"]').filter({ hasText: /^Medium$/i }).count();
      if (isMedium > 0) {
        console.log('[driver] intelligence is already set to Medium.');
      } else {
        console.log('[driver] intelligence selector button not found.');
      }
      return;
    }

    const currentVal = (await pill.first().innerText().catch(() => '')).trim();
    console.log('[driver] found intelligence selector button, current value:', currentVal);

    await pill.first().click();
    await page.waitForTimeout(600);

    const mediumItem = page.locator('[role="menuitem"], [role="menuitemradio"], [role="option"], div, span, button').filter({
      hasText: /^Medium$/i
    }).last();

    if (await mediumItem.count() > 0) {
      await mediumItem.click({ force: true });
      console.log('[driver] successfully switched intelligence selector to Medium.');
      await page.waitForTimeout(500);
    } else {
      console.log('[driver] warning: "Medium" option not found in intelligence menu.');
      await page.keyboard.press('Escape').catch(() => {});
    }
  } catch (err) {
    console.log('[driver] error selecting Medium intelligence:', err.message);
  }
}

async function prepareChatSession(page) {
  if (!page.url().includes('chatgpt.com')) {
    console.log('[driver] navigating to ChatGPT...');
    await page.goto('https://chatgpt.com/?temporary-chat=true', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  } else {
    const newChatClicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="create-new-chat-button"]') ||
                  Array.from(document.querySelectorAll('a, button')).find(b => (b.innerText || '').trim() === 'New chat');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!newChatClicked) {
      await page.goto('https://chatgpt.com/?temporary-chat=true', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(500);
  }

  await enableTemporaryChat(page);
  await waitForPromptArea(page, 15000);
  await selectMediumIntelligence(page);
  detectedModel = await detectActiveModel(page);
  console.log('[driver] active model:', detectedModel);
}

export async function sendThreePartPrompt(page, { prompt, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  await prepareChatSession(page);

  const part1 = await sendConversationTurn(page, prompt, timeoutMs);
  const part2 = await sendConversationTurn(page, 'Next Part. Write Part 2 now (~950 words, maximum 1000 words).', timeoutMs);
  const part3 = await sendConversationTurn(page, 'Next Part. Write Part 3 now (~950 words, maximum 1000 words, completing the ~3000-word article).', timeoutMs);

  const cleanPart2 = stripDuplicateH1AndMeta(part2);
  const cleanPart3 = stripDuplicateH1AndMeta(part3);
  const combined = `${part1.trim()}\n\n${cleanPart2}\n\n${cleanPart3}`.trim();

  return { content: combined, model: detectedModel };
}

export async function sendPrompt(page, { prompt, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (isLoginPage(page)) {
    throw new Error('ChatGPT is showing the login page. Please log in and try again.');
  }

  await prepareChatSession(page);

  await setPromptTextInstantly(page, prompt);
  await clickSendOrPressEnter(page);

  await waitForResponseComplete(page, timeoutMs);
  const responseText = await getLastResponse(page);
  return { content: responseText, model: detectedModel };
}

export async function waitForResponseComplete(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = Date.now();
  await page.waitForTimeout(2000);

  let lastLength = 0;
  let stable = 0;
  let emptyCheckCount = 0;

  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(1500);

    const isGenerating = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const testId = (b.getAttribute('data-testid') || '').toLowerCase();
        return label.includes('stop') || testId.includes('stop');
      });
    });

    if (isGenerating) {
      stable = 0;
      emptyCheckCount = 0;
      continue;
    }

    const current = await getLastResponse(page);

    if (current.length === 0) {
      emptyCheckCount++;
      if (emptyCheckCount === 5) {
        console.log('[driver] response empty, re-triggering send via Enter key...');
        await page.keyboard.press('Enter').catch(() => {});
      }
      if (emptyCheckCount > 15) {
        throw new Error('ChatGPT failed to start generating a response. Please verify you are logged into ChatGPT in Chrome.');
      }
      continue;
    }

    if (current.length === lastLength) {
      stable++;
      if (stable >= 2) return;
    } else {
      stable = 0;
      lastLength = current.length;
    }
  }

  console.log('[driver] warning: response completion wait reached timeout.');
}

export async function getLastResponse(page) {
  return page.evaluate(() => {
    // 1. Check Canvas mode / fullscreen editor (exclude #prompt-textarea)
    const canvasEditors = Array.from(document.querySelectorAll('[data-writing-block-fullscreen-editor-region="true"], [class*="writing-block-editor"]'));
    if (canvasEditors.length) {
      const text = (canvasEditors[canvasEditors.length - 1].innerText || canvasEditors[canvasEditors.length - 1].textContent || '').trim();
      if (text.length > 50) return text;
    }

    // 2. Check assistant message role elements
    const assistantNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    if (assistantNodes.length) {
      const lastNode = assistantNodes[assistantNodes.length - 1];
      const markdownInside = lastNode.querySelector('.markdown, .prose');
      const text = ((markdownInside || lastNode).innerText || (markdownInside || lastNode).textContent || '').trim();
      if (text.length > 0) return text;
    }

    // 3. Check markdown / prose containers outside #prompt-textarea
    const markdowns = Array.from(document.querySelectorAll('.markdown, [class*="markdown"], .prose')).filter(el => !el.closest('#prompt-textarea'));
    if (markdowns.length) {
      const text = (markdowns[markdowns.length - 1].innerText || markdowns[markdowns.length - 1].textContent || '').trim();
      if (text.length > 0) return text;
    }

    // 4. Fallback to agent-turn containers
    const agentTurns = Array.from(document.querySelectorAll('.agent-turn, [class*="agent-turn"]'));
    if (agentTurns.length) {
      const lastTurn = agentTurns[agentTurns.length - 1];
      return (lastTurn.innerText || lastTurn.textContent || '').trim();
    }

    return '';
  });
}

export async function close() {
  try {
    if (browser) await browser.close();
  } catch {}
  browser = null;
  context = null;
  page = null;
}
