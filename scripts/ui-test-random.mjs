
import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:19321');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  page.on('console', msg => console.log(`CONSOLE ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.log('PAGEERROR: ' + err.message));

  await page.goto('http://127.0.0.1:19323/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  try { await page.click('text=TressAtlas', { timeout: 3000 }); } catch(e) {}
  await page.waitForTimeout(500);
  await page.evaluate(() => { const orig = window.alert; window.alert = (...args) => { window.__lastAlert = args.join(' '); orig(...args); }; });

  await page.selectOption('#provider-select', 'bigPickleBridge'); await page.waitForTimeout(800);
  await page.selectOption('#model-select', 'chatgpt-browser'); await page.waitForTimeout(800);
  await page.fill('#keyword-input', 'modern pixie haircut ideas for women over 50');
  await page.click('#generate-btn');

  let alert = '';
  const start = Date.now();
  while (Date.now() - start < 150000 && !alert) {
    await page.waitForTimeout(2000);
    alert = await page.evaluate(() => window.__lastAlert || '');
    const width = await page.evaluate(() => { const p = document.getElementById('progress-bar-fill'); return p ? p.style.width : 'N/A'; });
    const logTail = await page.evaluate(() => { const l = document.getElementById('progress-log'); return l ? l.innerText.slice(-400) : ''; });
    console.log(`[${Math.round((Date.now()-start)/1000)}s] progress=${width} log=${logTail.replace(/\n/g, ' | ')}`);
  }

  const resultText = await page.evaluate(() => { const r = document.getElementById('result-content'); return r ? r.innerText.slice(0,3000) : 'NO result-content'; });
  const modelBadge = await page.evaluate(() => { const b = document.querySelector('.model-badge'); return b ? b.innerText : 'NO model badge'; });
  console.log('FINAL ALERT:', alert);
  console.log('MODEL BADGE:', modelBadge);
  console.log('RESULT:', resultText);
  await page.screenshot({ path: 'scripts/ui-test-result.png', fullPage: true });
  console.log('SCREENSHOT saved to scripts/ui-test-result.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
