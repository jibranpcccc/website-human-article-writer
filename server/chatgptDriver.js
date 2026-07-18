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
    await page.goto(CHATGPT_URL, { waitUntil: 'networkidle' });
  }
  return page;
}

export function isLoginPage(page) {
  const url = page.url();
  return url.includes('/auth/login') || url.includes('/auth/');
}

async function waitForPromptArea(page, timeout = 10000) {
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
        const txt = el.innerText.replace(/\\s+/g, ' ').trim();
        if (txt && txt.length < 80) return txt;
      }
    }
    return 'ChatGPT';
  });
}

/**
 * Try to enable temporary chat mode.
 * First try URL parameter, then attempt to click the temporary toggle if present.
 */
async function enableTemporaryChat(page) {
  const url = page.url();
  if (!url.includes('temporary-chat=true')) {
    const newUrl = new URL(url);
    newUrl.searchParams.set('temporary-chat', 'true');
    await page.goto(newUrl.toString(), { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  }

  // Try clicking the temporary chat toggle if visible
  try {
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('div, span, button, a'));
      const temp = labels.find(el => /temporary chat/i.test(el.innerText || el.textContent || ''));
      if (temp) {
        // click the closest switch/button/label
        let clickable = temp.closest('button, a, [role="switch"]') || temp;
        clickable.click();
      }
    });
  } catch (e) {
    // ignore toggle errors; URL param is the main mechanism
  }
}


async function clearEditor(editor, page) {
  await editor.evaluate((el) => {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false);
  });
  await page.waitForTimeout(200);
}

async function clickSendOrPressEnter(page, editor) {
  const sendClicked = await page.evaluate(() => {
    const send = Array.from(document.querySelectorAll('button')).find(
      b =>
        (b.getAttribute('aria-label') || '').toLowerCase().includes('send') ||
        b.getAttribute('data-testid') === 'send-button'
    );
    if (send && !send.disabled) {
      send.click();
      return true;
    }
    return false;
  });
  if (!sendClicked) {
    await editor.press('Enter');
  }
}

async function sendConversationTurn(page, text, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const editor = await waitForPromptArea(page, 30000);
  await clearEditor(editor, page);

  try {
    await editor.fill(text);
  } catch (fillErr) {
    console.log('[driver] editor.fill failed, falling back to DOM paste:', fillErr.message);
    await page.evaluate((t) => {
      const el = document.activeElement;
      if (el && el.isContentEditable) {
        el.innerText = t;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, text);
  }

  await page.waitForTimeout(300);
  await clickSendOrPressEnter(page, editor);
  await waitForResponseComplete(page, timeoutMs);
  return getLastResponse(page);
}

function stripDuplicateH1AndMeta(text) {
  // Remove [META] lines and any H1 that appears (to avoid duplicates when concatenating)
  return text
    .replace(/^\s*\[META\]:.*$/gim, '')
    .replace(/^\s*#\s+.+$/gim, '')
    .trim();
}

async function selectMediumIntelligence(page) {
  try {
    console.log('[driver] checking intelligence selector...');
    // Find the toggle button (it might say "High", "Medium", "Instant", or "GPT-5.6")
    const selectorButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => {
        const text = (b.innerText || b.textContent || '').trim();
        return /^(High|Medium|Instant|GPT-5\.\d+|GPT-\d\.\d+)/i.test(text);
      });
    });

    if (selectorButton && await selectorButton.asElement()) {
      const buttonText = await selectorButton.evaluate(el => el.innerText || el.textContent);
      console.log('[driver] found intelligence selector button, current value:', buttonText.trim());

      // If it's already "Medium", do nothing!
      if (/Medium/i.test(buttonText)) {
        console.log('[driver] intelligence is already set to Medium.');
        return;
      }

      // Click the button to open the dropdown menu
      await selectorButton.click();
      await page.waitForTimeout(500);

      // Now click on the "Medium" option in the dropdown list
      const mediumOptionClicked = await page.evaluate(() => {
        // Look for any elements with text "Medium" inside menu items/dropdown
        const elements = Array.from(document.querySelectorAll('div, span, button, li, a'));
        const medium = elements.find(el => {
          const text = (el.innerText || el.textContent || '').trim();
          return text === 'Medium';
        });
        if (medium) {
          medium.click();
          return true;
        }
        return false;
      });

      if (mediumOptionClicked) {
        console.log('[driver] successfully switched intelligence selector to Medium.');
        await page.waitForTimeout(500);
      } else {
        console.log('[driver] warning: "Medium" option not found in intelligence menu.');
        // close the dropdown by clicking the button again
        await selectorButton.click();
      }
    } else {
      console.log('[driver] intelligence selector button not found.');
    }
  } catch (err) {
    console.log('[driver] error selecting Medium intelligence:', err.message);
  }
}

async function prepareChatSession(page) {
  // 1. Refresh ChatGPT page with temporary-chat enabled
  console.log('[driver] navigating to fresh temporary chat to refresh page...');
  await page.goto('https://chatgpt.com/?temporary-chat=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 2. Ensure temporary chat is fully enabled
  await enableTemporaryChat(page);

  // 3. Try to select "Medium" intelligence for faster response
  await selectMediumIntelligence(page);

  // 4. Detect the active model
  detectedModel = await detectActiveModel(page);
  console.log('[driver] active model:', detectedModel);
}

export async function sendThreePartPrompt(page, { prompt, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  await prepareChatSession(page);

  // Part 1: send full master prompt with keyword
  const part1 = await sendConversationTurn(page, prompt, timeoutMs);
  // Part 2
  const part2 = await sendConversationTurn(page, 'Next Part.', timeoutMs);
  // Part 3
  const part3 = await sendConversationTurn(page, 'Next Part.', timeoutMs);

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

  const editor = await waitForPromptArea(page, 15000);

  // Paste-style fill: clear and set the whole prompt at once
  await editor.evaluate((el) => {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false);
  });
  await page.waitForTimeout(200);

  // Use Playwright fill if it works on the contenteditable; otherwise clipboard-style
  try {
    await editor.fill(prompt);
  } catch (fillErr) {
    console.log('[driver] editor.fill failed, falling back to clipboard paste', fillErr.message);
    await page.evaluate((text) => {
      const el = document.activeElement;
      if (el && el.isContentEditable) {
        el.innerText = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, prompt);
  }

  await page.waitForTimeout(300);

  // Try clicking send button; fall back to Enter key
  const sendClicked = await page.evaluate(() => {
    const send = Array.from(document.querySelectorAll('button')).find(
      b =>
        (b.getAttribute('aria-label') || '').toLowerCase().includes('send') ||
        b.getAttribute('data-testid') === 'send-button'
    );
    if (send && !send.disabled) {
      send.click();
      return true;
    }
    return false;
  });

  if (!sendClicked) {
    await editor.press('Enter');
  }

  await waitForResponseComplete(page, timeoutMs);
  const responseText = await getLastResponse(page);
  return { content: responseText, model: detectedModel };
}

export async function waitForResponseComplete(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = Date.now();
  let lastLength = 0;
  let stable = 0;

  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(1500);
    const current = await getLastResponse(page);
    if (current.length > 0 && current.length === lastLength) {
      stable++;
      if (stable >= 3) return;
    } else {
      stable = 0;
      lastLength = current.length;
    }
  }
  // timeout but still return whatever we have
}

export async function getLastResponse(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (!nodes.length) return '';
    const last = nodes[nodes.length - 1];
    return last.innerText || '';
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
