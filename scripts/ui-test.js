
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:19321');
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR', err.message));

  await page.goto('http://127.0.0.1:19323/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Hook alert capture
  await page.evaluate(() => {
    const orig = window.alert;
    window.alert = (...args) => { window.__lastAlert = args.join(' '); orig(...args); };
  });

  await page.selectOption('#providerSelect', 'bigPickleBridge');
  await page.waitForTimeout(500);
  await page.selectOption('#modelSelect', 'chatgpt-browser');
  await page.waitForTimeout(500);

  await page.fill('#keywordInput', 'test hairstyle for BigPickle');
  await page.click('#generateBtn');

  let lastAlert = '';
  const start = Date.now();
  while (Date.now() - start < 120000 && !lastAlert) {
    await page.waitForTimeout(2000);
    lastAlert = await page.evaluate(() => window.__lastAlert || '');
    const width = await page.evaluate(() => { const p = document.getElementById('progressBarFill'); return p ? p.style.width : 'N/A'; });
    const logTail = await page.evaluate(() => { const l = document.getElementById('progressLog'); return l ? l.innerText.slice(-300) : ''; });
    console.log(`Progress ${width} | log: ${logTail.replace(/\n/g, ' | ')}`);
  }
  console.log('ALERT:', lastAlert);

  const result = await page.evaluate(() => { const r = document.getElementById('resultContent'); return r ? r.innerText.slice(0,800) : 'NO resultContent'; });
  console.log('RESULT PREVIEW:', result);

  const html = await page.content();
  console.log('HTML size', html.length);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
