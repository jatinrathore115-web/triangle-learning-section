// Lists every line the narration card can show, straight from js/screens.js
// (the game's source of truth). Prints JSON: [{ line, phrases }] in first-heard order.
// Keys are the exact plain text shown: markup "[kind|text]" stripped, characters kept.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js', 'screens.js'), 'utf8');

const STR = String.raw`'(?:[^'\\\n]|\\.)*'`;
const ARR = new RegExp(String.raw`\[\s*${STR}(?:\s*,\s*${STR})*\s*\]`, 'g');
// narration calls, titles voiced in place, and answer choices (quiz(ctx, [...]) / group('…', [...]))
const CALL = /ctx\.(say|sayFree|append|hint|voiceInto)\(|\bsay: \[|\bquiz\(ctx, |\bgroup\('[^']*', /g;

export const plain = (s) => s.replace(/\[(\w+)\|([^\]]+)\]/g, '$2');
const unq = (s) => s.slice(1, -1).replace(/\\'/g, "'");

export function extract() {
  const out = [], seen = new Set();
  let m;
  while ((m = CALL.exec(src))) {
    const lineEnd = src.indexOf('\n', m.index);
    const stmt = src.slice(m.index, lineEnd < 0 ? undefined : lineEnd);
    const found = [];
    if (m[1] === 'append' || m[1] === 'hint') {
      const s = stmt.match(new RegExp(String.raw`\(\s*(${STR})`));
      if (s) found.push([unq(s[1])]);
    } else if (m[1] === 'voiceInto') {
      const s = stmt.match(new RegExp(String.raw`,\s*(${STR})\s*\)`));
      if (s) found.push([unq(s[1])]);
    } else if (!m[1] && !m[0].startsWith('say')) {
      // answer choices: each one is read aloud on its own
      const a = stmt.slice(m[0].length).match(ARR);
      if (a) for (const s of a[0].match(new RegExp(STR, 'g'))) found.push([unq(s)]);
    } else {
      for (const a of stmt.match(ARR) || []) found.push(a.match(new RegExp(STR, 'g')).map(unq));
    }
    for (const phrases of found) {
      const line = phrases.map(plain).join(' ');
      if (!seen.has(line)) { seen.add(line); out.push({ line, phrases, kind: m[1] || (m[0].startsWith('say') ? 'say' : 'choice') }); }
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(extract(), null, 1));
}
