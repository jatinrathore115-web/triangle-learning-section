// Drives the "Ai Wala Human By Aamir" TTS studio (Batch Generation) for a set of clip ids.
//   node tools/vo_generate.mjs --ids vo001,vo002,vo003 --out <dir>   (explicit ids)
//   node tools/vo_generate.mjs --from vo004 --count 45 --out <dir>    (a chunk)
//   node tools/vo_generate.mjs --probe --out <dir>                    (upload only, dump controls)
// Writes <out>/batch_<tag>.xlsx, <out>/voiceovers_<tag>.zip and <out>/log_<tag>.json.
// Requires playwright-core (cd tools && npm install) and Google Chrome.
// Respects the studio's rate limit: 100 requests / 15 min / IP, 2 requests per line.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, 'package.json'));
const { chromium } = require(process.env.PW_PATH || 'playwright-core');

export const STUDIO = 'https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app';
const SETTINGS = { language: 'hi', format: 'mp3', voice: 'Female Teacher (Standard)', concurrency: '3 (Recommended)' };
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* ---------- minimal .xlsx (stored zip, inlineStr cells) ---------- */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function zipStore(files) {
  const local = [], central = [];
  let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8'), nm = Buffer.from(name, 'utf8'), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    local.push(h, nm, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28);
    c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, e]);
}
export function xlsx(rows) {
  const cell = (ref, v) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const all = [['filename', 'text'], ...rows];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((r, i) => `<row r="${i + 1}">${cell('A' + (i + 1), r[0])}${cell('B' + (i + 1), r[1])}</row>`).join('')}</sheetData></worksheet>`;
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

/* ---------- rate limit ---------- */
export async function quota(request) {
  const r = await request.get(`${STUDIO}/gemini-api-proxy/v1beta/models?__applet_proxy=true`);
  const h = r.headers();
  return { status: r.status(), limit: +h['ratelimit-limit'], remaining: +h['ratelimit-remaining'], reset: +h['ratelimit-reset'] };
}

/* ---------- one batch run ---------- */
export async function runBatch(rows, { out, tag, probe = false }) {
  mkdirSync(out, { recursive: true });
  const xfile = join(out, `batch_${tag}.xlsx`);
  writeFileSync(xfile, xlsx(rows));
  const log = { tag, rows: rows.map((r) => r[0]), started: new Date().toISOString(), calls: [], script: {} };

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  // do what the blocked service worker would: send Gemini calls to the studio's proxy
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const proxied = `${STUDIO}/gemini-api-proxy${u.pathname}${u.search ? u.search + '&' : '?'}__applet_proxy=true`;
    const headers = {};
    for (const k of ['content-type', 'accept']) if (req.headers()[k]) headers[k] = req.headers()[k];
    try {
      const resp = await route.fetch({ url: proxied, method: req.method(), headers, postData: req.postDataBuffer() || undefined, timeout: 180000 });
      const status = resp.status();
      const entry = { t: Date.now(), path: u.pathname, status, remaining: resp.headers()['ratelimit-remaining'] };
      if (u.pathname.includes('flash-preview:') && !u.pathname.includes('tts')) {
        try {
          const body = JSON.parse((await resp.body()).toString('utf8'));
          entry.text = body.candidates?.[0]?.content?.parts?.[0]?.text;
          const sent = req.postData() || '';
          entry.request = sent;
        } catch { /* not JSON */ }
      }
      if (status !== 200) entry.body = (await resp.body()).toString('utf8').slice(0, 500);
      log.calls.push(entry);
      await route.fulfill({ response: resp });
    } catch (e) {
      log.calls.push({ t: Date.now(), path: u.pathname, error: String(e) });
      await route.abort();
    }
  });

  const page = await ctx.newPage();
  await page.goto(STUDIO + '/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('button', { name: 'Batch Generation' }).click();
  await page.setInputFiles('input[type=file]', xfile);
  await page.waitForTimeout(1500);

  const controls = await page.evaluate(() => ({
    selects: [...document.querySelectorAll('select')].map((s, i) => ({ i, options: [...s.options].map((o) => [o.value, o.text]) })),
    inputs: [...document.querySelectorAll('input:not([type=file])')].map((el, i) => ({ i, type: el.type, value: el.value, label: (el.closest('label, div')?.innerText || '').trim().split('\n')[0] })),
    buttons: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
  }));
  log.controls = controls;
  if (probe) { writeFileSync(join(out, `log_${tag}.json`), JSON.stringify(log, null, 1)); await browser.close(); return { log }; }

  // set every select by its options
  const sel = page.locator('select');
  let colIndex = 0;
  for (const s of controls.selects) {
    const vals = s.options.map((o) => o[0]), texts = s.options.map((o) => o[1]);
    const pick = (want) => s.options.find((o) => o[0] === want || o[1] === want);
    let choice = null;
    if (pick(SETTINGS.language) && vals.includes('en')) choice = pick(SETTINGS.language);
    else if (texts.some((t) => /mp3/i.test(t))) choice = s.options.find((o) => /mp3/i.test(o[0] + o[1]));
    else if (pick(SETTINGS.voice)) choice = pick(SETTINGS.voice);
    else if (pick(SETTINGS.concurrency)) choice = pick(SETTINGS.concurrency);
    else if (pick('text') && pick('filename')) {
      // column pickers come in the studio's order: Text Column, then Filename Column
      choice = pick(colIndex++ === 0 ? 'text' : 'filename');
    }
    if (choice) await sel.nth(s.i).selectOption(choice[0]);
  }
  // Start Row / Quantity
  const inputs = page.locator('input:not([type=file])');
  for (const inp of controls.inputs) {
    const l = inp.label.toLowerCase();
    if (l.includes('start')) await inputs.nth(inp.i).fill('1');
    else if (l.includes('quantity')) await inputs.nth(inp.i).fill(String(rows.length));
  }
  await page.waitForTimeout(500);
  log.settings = await page.evaluate(() => [...document.querySelectorAll('select')].map((s) => s.options[s.selectedIndex]?.text));
  const gen = page.locator('button', { hasText: 'GENERATE (' });
  log.generateLabel = await gen.innerText();
  await gen.click();

  // wait for the run (and retries) to finish
  const busy = () => page.getByText('Processing...', { exact: false }).count();
  for (let attempt = 0; attempt <= 3; attempt++) {
    await page.waitForTimeout(4000);
    const t0 = Date.now();
    while ((await busy()) > 0 && Date.now() - t0 < 20 * 60000) await page.waitForTimeout(3000);
    const failed = await page.getByText('Failed', { exact: true }).count();
    log['failed_' + attempt] = failed;
    if (!failed || attempt === 3) break;
    const q = await quota(page.request);
    if (q.remaining < failed * 2 + 2) break;
    const retry = page.locator('button', { hasText: /retry/i });
    if (!(await retry.count())) break;
    await retry.first().click();
  }
  const dl = page.locator('button', { hasText: 'DOWNLOAD ALL' });
  const zipPath = join(out, `voiceovers_${tag}.zip`);
  if (await dl.count()) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), dl.first().click()]);
    await download.saveAs(zipPath);
    log.zip = zipPath;
  }
  log.finished = new Date().toISOString();
  writeFileSync(join(out, `log_${tag}.json`), JSON.stringify(log, null, 1));
  await browser.close();
  return { log, zipPath };
}

/* ---------- CLI ---------- */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
  const script = JSON.parse(readFileSync(join(here, 'vo_script.json'), 'utf8'));
  const out = resolve(arg('out') || join(here, '..', '.vo_work'));
  let rows;
  if (arg('ids')) { const ids = arg('ids').split(','); rows = script.filter((r) => ids.includes(r.id)); }
  else {
    const from = script.findIndex((r) => r.id === (arg('from') || script[0].id));
    rows = script.slice(from, from + (+arg('count') || script.length));
  }
  rows = rows.map((r) => [r.id, r.spoken]);
  const tag = arg('tag') || `${rows[0][0]}-${rows[rows.length - 1][0]}`;
  const { log } = await runBatch(rows, { out, tag, probe: process.argv.includes('--probe') });
  console.log(JSON.stringify({ tag, controls: process.argv.includes('--probe') ? log.controls : undefined, settings: log.settings, generate: log.generateLabel, calls: log.calls.length, statuses: log.calls.map((c) => c.status).join(','), zip: log.zip }, null, 1));
}
