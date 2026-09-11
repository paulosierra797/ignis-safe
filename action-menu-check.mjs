import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 1440]) {
    await page.setViewport({width, height: 820});
    await page.goto('http://127.0.0.1:5173/action-menu-check.html');
    await page.waitForSelector('[aria-label="Request actions"]');
    await page.click('[aria-label="Request actions"]');
    await page.waitForSelector('[role="menu"]');
    assert.equal(await page.evaluate(()=>document.activeElement.textContent), 'Review');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.textContent), 'Reject');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('[role="menu"]'), null);
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')), 'Request actions');
    await page.click('[aria-label="Request actions"]');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('output', element=>element.textContent), 'Review');
    await page.click('[aria-label="Announcement actions"]');
    assert.equal(await page.$$eval('[role="menuitem"]', elements=>elements.length), 2);
    const dimensions = await page.$eval('[role="menu"]', element=>{
      const rect = element.getBoundingClientRect();
      return {left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom};
    });
    assert.ok(dimensions.left >= 0 && dimensions.top >= 0 && dimensions.right <= width && dimensions.bottom <= 820);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('output', element=>element.textContent), 'Archive');
    await page.click('[aria-label="Request actions"]');
    await page.screenshot({path:`C:/Users/Andrei/AppData/Local/Temp/record-actions-${width}.png`});
    await page.click('h2');
    assert.equal(await page.$('[role="menu"]'), null);
    console.log(`${width}px: menu placement, focus, keyboard, disabled item, archive callback, and outside close passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
