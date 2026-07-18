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
  await page.fill('#keyword-input', 'BigPickle UI end-to-end test keyword');
  await page.click('#generate-btn');
  let alert = '';
  const start = Date.now();
  while (Date.now() - start < 120000 && !alert) {
    await page.waitForTimeout(2000);
    alert = await page.evaluate(() => window.__lastAlert || '');
    const width = await page.evaluate(() => { const p = document.getElementById('progress-bar-fill'); return p ? p.style.width : 'N/A'; });
    const logTail = await page.evaluate(() => { const l = document.getElementById('progress-log'); return l ? l.innerText.slice(-400) : ''; });
    console.log(`[${Math.round((Date.now()-start)/1000)}s] progress=${width} logTail=${logTail.replace(/\n/g, ' | ')}`);
  }
  const result = await page.evaluate(() => { const r = document.getElementById('result-content'); return r ? r.innerText.slice(0,1200) : 'NO result-content'; });
  console.log('FINAL ALERT:', alert);
  console.log('RESULT:', result);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
