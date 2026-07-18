import { chromium } from 'playwright';
import { CDP_HOST } from './config.js';

async function diagnose() {
  console.log('=== BigPickle Bridge Diagnosis ===\n');
  console.log('CDP_HOST:', CDP_HOST);

  // 1. Check CDP endpoint
  try {
    const resp = await fetch(`${CDP_HOST}/json/version`);
    const text = await resp.text();
    console.log('CDP /json/version reachable:', resp.ok);
    console.log('Version info:', text.slice(0, 200));
  } catch (err) {
    console.error('CDP /json/version FAILED:', err.message);
    process.exit(1);
  }

  // 2. Connect over CDP
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_HOST);
    console.log('Playwright connected over CDP:', browser.isConnected());
    const contexts = browser.contexts();
    console.log('Contexts count:', contexts.length);
    const context = contexts[0];
    const pages = context.pages();
    console.log('Pages count:', pages.length);
    const page = pages[0] || await context.newPage();
    console.log('Target page URL:', page.url());
    console.log('Target page title:', await page.title());

    // 3. Detect login
    const url = page.url();
    const isLogin = url.includes('/auth/') || url.includes('/auth/login');
    console.log('Is login page:', isLogin);

    // 4. Screenshot
    const shotPath = 'C:/HermesWork/projects/website-article-writer-agent-v3/server/diagnose-screenshot.png';
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log('Screenshot saved:', shotPath);

    // 5. Find prompt textarea
    const selectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'div[contenteditable="true"]'
    ];
    let foundSelector = null;
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        foundSelector = sel;
        break;
      }
    }
    console.log('Prompt textarea selector found:', foundSelector || 'NONE');

    await browser.close();
    console.log('\n=== Diagnosis complete ===');
  } catch (err) {
    console.error('Playwright CDP connection FAILED:', err.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
}

diagnose().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
