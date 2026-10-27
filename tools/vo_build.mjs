// Builds the shipped voice-over from studio zips. Safe to run again.
//   node tools/vo_build.mjs <voiceovers_batch.zip> [more.zip …]
//   node tools/vo_build.mjs            (no zips: just regenerate js/vo_lines.js)
// For every voNNN.mp3 in the zips:
//   decode → mono 48 kHz → Opus 32 kbps (WebCodecs in headless Chrome) → Ogg Opus (muxed here)
//   measure duration + speech segments (pauses) for word-by-word sync
// Then regenerates js/vo_lines.js from tools/vo_script.json and lists lines without a clip.
// Requires playwright-core (cd tools && npm install) and Google Chrome. No ffmpeg needed.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(here, 'package.json'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VO_DIR = join(root, 'assets', 'vo');
const META = join(here, 'vo_meta.json');
const MAP = join(root, 'js', 'vo_lines.js');

/* ---------- zip reading ---------- */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lstart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(lstart, lstart + csize);
    files[name] = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

/* ---------- Ogg Opus muxing (RFC 7845) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    t[i] = r >>> 0;
  }
  return t;
})();
const oggCrc = (b) => { let c = 0; for (const x of b) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ x) & 255]) >>> 0; return c; };

function oggPage(packets, { granule, serial, seq, flags }) {
  const lacing = [];
  for (const p of packets) { let l = p.length; while (l >= 255) { lacing.push(255); l -= 255; } lacing.push(l); }
  const h = Buffer.alloc(27 + lacing.length);
  h.write('OggS', 0); h[4] = 0; h[5] = flags;
  h.writeBigInt64LE(BigInt(granule), 6); h.writeUInt32LE(serial, 14); h.writeUInt32LE(seq, 18);
  h[26] = lacing.length; lacing.forEach((v, i) => (h[27 + i] = v));
  const page = Buffer.concat([h, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}
function muxOggOpus(packets, { preSkip, totalSamples, inputRate }) {
  const serial = 0x54524931; // 'TRI1'
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0); head[8] = 1; head[9] = 1;
  head.writeUInt16LE(preSkip, 10); head.writeUInt32LE(inputRate, 12); head.writeInt16LE(0, 16); head[18] = 0;
  const vendor = Buffer.from('triangle-lab vo_build (WebCodecs)');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0); tags.writeUInt32LE(vendor.length, 8); vendor.copy(tags, 12); tags.writeUInt32LE(0, 12 + vendor.length);
  const pages = [oggPage([head], { granule: 0, serial, seq: 0, flags: 0x02 }), oggPage([tags], { granule: 0, serial, seq: 1, flags: 0 })];
  let seq = 2, samples = 0;
  const PER_PAGE = 50; // 1 s of 20 ms packets
  for (let i = 0; i < packets.length; i += PER_PAGE) {
    const group = packets.slice(i, i + PER_PAGE);
    samples += group.reduce((s, p) => s + p.samples, 0);
    const last = i + PER_PAGE >= packets.length;
    // granules count at 48 kHz and include pre-skip; the last page trims encoder padding
    const granule = last ? preSkip + totalSamples : preSkip + samples;
    pages.push(oggPage(group.map((p) => p.data), { granule, serial, seq: seq++, flags: last ? 0x04 : 0 }));
  }
  return Buffer.concat(pages);
}

/* ---------- encode + analyse in Chrome ---------- */
async function encodeAll(mp3s) {
  const { chromium } = require(process.env.PW_PATH || 'playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  // WebCodecs needs a secure context: serve an empty page on an https origin locally
  await page.route('https://vo-build.local/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>vo</title>' }));
  await page.goto('https://vo-build.local/');
  const out = {};
  for (const [id, buf] of Object.entries(mp3s)) {
    out[id] = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const ctx = new OfflineAudioContext(1, 1, 48000);
      const audio = await ctx.decodeAudioData(bytes.buffer);
      // mix down to mono at 48 kHz
      const n = audio.length, pcm = new Float32Array(n);
      for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) pcm[i] += d[i] / audio.numberOfChannels; }
      // speech segments from a 10 ms RMS envelope (gaps ≥ 140 ms split segments)
      const hop = 480, env = [];
      for (let i = 0; i < n; i += hop) { let s = 0; const e = Math.min(n, i + hop); for (let j = i; j < e; j++) s += pcm[j] * pcm[j]; env.push(Math.sqrt(s / (e - i))); }
      const peak = Math.max(...env), thr = Math.max(0.012, peak * 0.06);
      const segs = []; let start = -1, quiet = 0;
      env.forEach((v, k) => {
        if (v > thr) { if (start < 0) start = k; quiet = 0; }
        else if (start >= 0 && ++quiet >= 14) { segs.push([start, k - quiet + 1]); start = -1; quiet = 0; }
      });
      if (start >= 0) segs.push([start, env.length]);
      const segSec = segs.filter(([a, b]) => b - a >= 4).map(([a, b]) => [+(a * 0.01).toFixed(3), +(b * 0.01).toFixed(3)]);
      // Opus 32 kbps mono
      const packets = []; let desc = null, err = null;
      const enc = new AudioEncoder({
        output: (chunk, md) => {
          const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
          packets.push({ data: btoa(String.fromCharCode(...d)), samples: Math.round((chunk.duration || 20000) * 48 / 1000) });
          if (md && md.decoderConfig && md.decoderConfig.description) desc = new Uint8Array(md.decoderConfig.description);
        },
        error: (e) => { err = String(e); },
      });
      enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 });
      const F = 4800;
      for (let i = 0; i < n; i += F) {
        const len = Math.min(F, n - i);
        enc.encode(new AudioData({ format: 'f32', sampleRate: 48000, numberOfFrames: len, numberOfChannels: 1, timestamp: Math.round((i / 48000) * 1e6), data: pcm.slice(i, i + len) }));
      }
      await enc.flush(); enc.close();
      let preSkip = 312;
      if (desc && desc.length >= 12 && String.fromCharCode(...desc.slice(0, 8)) === 'OpusHead') preSkip = desc[10] | (desc[11] << 8);
      return { err, packets, preSkip, totalSamples: n, inputRate: audio.sampleRate === 48000 ? 24000 : audio.sampleRate, seconds: n / 48000, segs: segSec };
    }, buf.toString('base64'));
    if (out[id].err) throw new Error(`${id}: ${out[id].err}`);
  }
  // verify every produced Ogg decodes
  const verify = async (oggs) => page.evaluate(async (list) => {
    const res = {};
    for (const [id, b64] of list) {
      try { const a = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer); res[id] = a.duration; }
      catch (e) { res[id] = 'ERR ' + e; }
    }
    return res;
  }, oggs);
  return { out, verify, close: () => browser.close() };
}

/* ---------- map ---------- */
function writeMap(meta) {
  const script = JSON.parse(readFileSync(join(here, 'vo_script.json'), 'utf8'));
  const lines = {}, missing = [];
  for (const r of script) {
    const m = meta[r.id];
    if (m && existsSync(join(VO_DIR, r.id + '.ogg'))) lines[r.line] = [r.id, m.seconds, m.segs];
    else missing.push(r.id + '  ' + r.line);
  }
  const body = `/* GENERATED by tools/vo_build.mjs from tools/vo_script.json — do not edit by hand.
   line as shown → [clip id, seconds, speech segments [[start, end] …] in seconds] */
(function () {
  const TL = (window.TL = window.TL || {});
  TL.VO_LINES = ${JSON.stringify(lines, null, 1)};
})();
`;
  writeFileSync(MAP, body);
  // remove clips no line uses
  const used = new Set(Object.values(lines).map((v) => v[0]));
  if (existsSync(VO_DIR)) for (const f of readdirSync(VO_DIR)) if (f.endsWith('.ogg') && !used.has(basename(f, '.ogg'))) unlinkSync(join(VO_DIR, f));
  return { voiced: Object.keys(lines).length, total: script.length, missing };
}

/* ---------- CLI ---------- */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(VO_DIR, { recursive: true });
  const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
  const mp3s = {};
  for (const z of process.argv.slice(2)) {
    for (const [name, data] of Object.entries(unzip(readFileSync(z)))) {
      const m = name.match(/(vo\d{3})\.mp3$/);
      if (m) mp3s[m[1]] = data;
    }
  }
  if (Object.keys(mp3s).length) {
    const { out, verify, close } = await encodeAll(mp3s);
    const oggs = [];
    for (const [id, r] of Object.entries(out)) {
      const packets = r.packets.map((p) => ({ data: Buffer.from(p.data, 'base64'), samples: p.samples }));
      const ogg = muxOggOpus(packets, r);
      writeFileSync(join(VO_DIR, id + '.ogg'), ogg);
      meta[id] = { seconds: +r.seconds.toFixed(3), segs: r.segs, mp3Bytes: mp3s[id].length, oggBytes: ogg.length };
      oggs.push([id, ogg.toString('base64')]);
    }
    const ok = await verify(oggs);
    await close();
    for (const [id, d] of Object.entries(ok)) {
      if (typeof d !== 'number' || Math.abs(d - meta[id].seconds) > 0.08) console.log('VERIFY FAIL', id, d, meta[id].seconds);
    }
    writeFileSync(META, JSON.stringify(meta, null, 1) + '\n');
    console.log('encoded', Object.keys(out).length, 'clips');
  }
  const r = writeMap(meta);
  const size = existsSync(VO_DIR) ? readdirSync(VO_DIR).reduce((s, f) => s + statSync(join(VO_DIR, f)).size, 0) : 0;
  console.log(`voiced ${r.voiced}/${r.total} lines · assets/vo ${(size / 1024).toFixed(0)} KB`);
  if (r.missing.length) console.log('no clip yet:\n  ' + r.missing.join('\n  '));
}
