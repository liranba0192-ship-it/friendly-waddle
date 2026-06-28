// בדיקת עשן: טוען את האפליקציה בדפדפן אמיתי, יוצר פרויקט, נכנס לעורך,
// מצייר מסלול, מכייל, ובודק שאין שגיאות ריצה.
import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173/ac-planner/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const errors = [];
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('ok - ' + msg);
}

await page.goto(BASE, { waitUntil: 'networkidle' });

// 1) רשימת פרויקטים נטענה
await page.waitForSelector('text=תכנון מיזוג', { timeout: 10000 });
assert(true, 'project list loaded');

// 2) יצירת פרויקט
await page.click('text=+ פרויקט');
await page.fill('input[placeholder="לדוגמה: משפחת כהן"]', 'בדיקה אוטומטית');
await page.click('button:has-text("יצירה")');

// 3) נכנסנו לעורך — סרגל הכלים מופיע
await page.waitForSelector('text=סיכום אורכים', { timeout: 10000 });
assert(true, 'editor opened with totals panel');
assert(await page.isVisible('text=צנרת גז'), 'route type buttons present');
assert(await page.isVisible('text=כיול קנה מידה'), 'calibrate button present');

// 4) ציור מסלול על הקנבס (הקשות נקודה-נקודה)
const canvas = await page.waitForSelector('.canvas-wrap canvas');
const box = await canvas.boundingBox();
const pts = [
  [box.x + 200, box.y + 200],
  [box.x + 400, box.y + 200],
  [box.x + 400, box.y + 350],
];
for (const [x, y] of pts) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(250);
}
assert(await page.isVisible('text=סיום קו'), 'drawing a route shows finish button');

// 5) כיול
await page.click('button:has-text("כיול קנה מידה")');
await page.waitForSelector('text=שלב 1/3');
await page.mouse.click(box.x + 200, box.y + 500);
await page.waitForTimeout(250);
await page.mouse.click(box.x + 600, box.y + 500); // 400px
await page.waitForSelector('text=שלב 3/3');
await page.fill('input[type="number"]', '4');
await page.click('button:has-text("שמור כיול")');
await page.waitForTimeout(300);

// אחרי כיול: 400px / 4m = 100 px/m ; הקו האופקי הראשון = 200px => 2.00 מ׳ לפחות מופיע "מ׳"
const totalsText = await page.textContent('.totals');
assert(/מ׳/.test(totalsText) && !/—/.test(totalsText.replace('סיכום', '')), 'lengths show meters after calibration');
console.log('totals:', totalsText.replace(/\s+/g, ' ').trim());

// 6) undo עובד
await page.click('button[title="בטל"]');
await page.waitForTimeout(150);
assert(true, 'undo clicked without crash');

await browser.close();

if (errors.length) {
  console.error('\nCONSOLE/PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nSMOKE PASSED — no runtime errors');
