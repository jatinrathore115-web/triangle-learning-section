// Regenerates tools/vo_script.json from the lines in js/screens.js.
// Existing ids are kept (a line keeps its clip); new lines get the next free id.
// Hand-edited "spoken" values are preserved; only new lines get the automatic form.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extract } from './vo_extract.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'tools', 'vo_script.json');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + words(n % 100) : '');
}
const num = (s) => {
  const [a, b] = s.split('.');
  return words(+a) + (b ? ' point ' + [...b].map((d) => ONES[+d]).join(' ') : '');
};

/* written form → spoken form: the voice reads exactly what it is given */
export function speak(line) {
  return line
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/g, (_, n) => `${num(n)} ${n === '1' ? 'centimetre' : 'centimetres'}`)
    .replace(/(\d+)° angle\b/g, (_, n) => `${num(n)}-degree angle`)
    .replace(/(\d+)°/g, (_, n) => `${num(n)} degrees`)
    .replace(/\bthe (\d)0s\b/g, (_, d) => `the ${TENS[+d]}ies`.replace('tyies', 'ties'))
    .replace(/\d+(?:\.\d+)?/g, (n) => num(n))
    .replace(/\s*—\s*/g, ', ')
    .replace(/^…\s*/, '')
    .replace(/…$/, ',')
    .replace(/-angled\b/g, ' angled');
}

export function makeScript() {
  const lines = extract();
  const old = existsSync(SCRIPT) ? JSON.parse(readFileSync(SCRIPT, 'utf8')) : [];
  const byLine = new Map(old.map((r) => [r.line, r]));
  let next = old.reduce((m, r) => Math.max(m, +r.id.slice(2)), 0) + 1;
  const out = lines.map(({ line }) => {
    const prev = byLine.get(line);
    if (prev) return prev;
    return { id: 'vo' + String(next++).padStart(3, '0'), line, spoken: speak(line) };
  });
  writeFileSync(SCRIPT, JSON.stringify(out, null, 1) + '\n');
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = makeScript();
  for (const r of s) if (r.spoken !== r.line) console.log(r.id, '|', r.line, '→', r.spoken);
  console.log('lines:', s.length);
}
