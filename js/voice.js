/* Voice-over player — one reused <audio>, looked up by the exact line shown.
   Text is revealed word by word against the clip's real clock (audio.currentTime),
   so words appear as they are said. Lines without a clip reveal silently at a
   natural reading pace. ?vo=0 turns narration audio off; ?vospeed=2 speeds it up. */
(function () {
  const TL = (window.TL = window.TL || {});
  const params = new URLSearchParams(location.search);
  const audio = new Audio();
  audio.preload = 'auto';

  const canOpus = !!audio.canPlayType && audio.canPlayType('audio/ogg; codecs="opus"') !== '';
  const rate = Math.max(0.5, Math.min(4, parseFloat(params.get('vospeed')) || 1));
  const SILENT_WORD = 0.3;   // seconds per word when a line has no clip
  const LEAD = 0.04;         // show a word a hair before it is heard

  /* ---- word timing ---- */
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  // weight a shown word by how long it takes to say ("90°" is "ninety degrees")
  function spokenLen(w) {
    let s = w.replace(/[^\w°.]/g, '');
    s = s.replace(/(\d+)°/g, (_, n) => (+n >= 20 ? 'ninetyish' : ONES[+n] || 'twelve') + ' degrees')
      .replace(/^cm$/, 'centimetres')
      .replace(/\d+(\.\d+)?/g, (n) => (n.includes('.') ? 'seven point one' : +n <= 10 ? ONES[+n] : 'ninety'));
    return Math.max(2, s.length);
  }
  const pauseAfter = (w) => (/[.!?…]$/.test(w) ? 6 : /[,:;—]$/.test(w) ? 3 : 0);

  /* returns seconds at which each word should appear */
  function wordTimes(words, clip) {
    const weights = words.map(spokenLen);
    if (!clip) {
      let t = 0.12;
      return words.map((w) => { const at = t; t += SILENT_WORD + pauseAfter(w) * 0.05; return at; });
    }
    const [, seconds, segs] = clip;
    const spans = segs && segs.length ? segs : [[0.25, Math.max(0.5, seconds - 0.3)]];
    // groups of words separated by punctuation usually map onto the speech segments
    const groups = [];
    words.forEach((w, i) => {
      if (!groups.length || /[,.!?…:;—]$/.test(words[i - 1] || '')) groups.push([]);
      groups[groups.length - 1].push(i);
    });
    const out = new Array(words.length);
    const spread = (idx, a, b) => {
      const tot = idx.reduce((s, i) => s + weights[i], 0) || 1;
      let acc = 0;
      for (const i of idx) { out[i] = a + (acc / tot) * (b - a); acc += weights[i]; }
    };
    if (groups.length === spans.length) groups.forEach((g, k) => spread(g, spans[k][0], spans[k][1]));
    else spread(words.map((_, i) => i), spans[0][0], spans[spans.length - 1][1]);
    return out.map((t) => Math.max(0, t - LEAD));
  }

  /* ---- playback ---- */
  let current = null;   // { done: Promise, finish(), startedAt, clip }
  let unlocked = false;
  const listeners = new Set();
  const emit = (on) => listeners.forEach((fn) => fn(on));

  const VO = {
    enabled: canOpus && params.get('vo') !== '0',
    rate,
    lines: () => TL.VO_LINES || {},
    clipFor(text) { return this.enabled ? this.lines()[text] || null : null; },
    onSpeaking(fn) { listeners.add(fn); },
    wordTimes,

    /* call from the first user gesture: tablets refuse audio until then */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      if (!this.enabled) return;
      const first = Object.values(this.lines())[0];
      if (!first) return;
      audio.muted = true;
      audio.src = `assets/vo/${first[0]}.ogg`;
      audio.play().then(() => { audio.pause(); audio.muted = false; }).catch(() => { audio.muted = false; });
      setTimeout(() => this.prefetch(), 400);
    },

    /* quietly fetch every clip, one at a time */
    async prefetch() {
      // audio elements (not fetch) so this also works when the page is opened from disk
      for (const [id] of Object.values(this.lines())) {
        await new Promise((res) => {
          const a = new Audio();
          a.preload = 'auto';
          const done = () => { a.oncanplaythrough = a.onerror = null; res(); };
          a.oncanplaythrough = done; a.onerror = done;
          setTimeout(done, 4000);
          a.src = `assets/vo/${id}.ogg`;
        });
      }
    },

    /* speak a line; returns a handle whose clock drives the word reveal */
    speak(text) {
      this.stop();
      const clip = this.clipFor(text);
      let resolve;
      const done = new Promise((r) => (resolve = r));
      const handle = {
        clip, done, playing: false,
        finish: () => { if (handle.ended) return; handle.ended = true; clearTimeout(handle.safety); handle.playing = false; emit(false); resolve(); },
      };
      const t0 = performance.now();
      // Clock in clip seconds. Locked to the voice while audio is really moving; if the
      // voice is late to start or stalls, words carry on with wall time so text never freezes.
      let lastAt = 0, lastMove = t0, retried = false;
      handle.time = () => {
        const now = performance.now(), wall = ((now - t0) / 1000) * (clip ? rate : 1);
        if (!clip) return wall;
        const at = audio.currentTime;
        if (at > lastAt + 0.001) { lastAt = at; lastMove = now; }
        const moving = handle.playing && !audio.paused && now - lastMove < 450 && at > 0;
        if (moving) return at;
        if (handle.playing && !retried && now - t0 > 1200 && at === 0) { retried = true; audio.play().catch(() => {}); }
        return now - t0 < 600 && at === 0 ? 0 : Math.max(at, wall - 0.25);
      };
      if (!clip) {
        handle.duration = null;
        current = handle;
        return handle;
      }
      handle.duration = clip[1];
      const len = (clip[1] / rate) * 1000;
      handle.safety = setTimeout(handle.finish, len + 600); // a stalled clip never locks the game
      audio.onended = () => { if (current === handle) handle.finish(); };
      audio.onerror = () => { if (current === handle) { handle.playing = false; } };
      try {
        audio.src = `assets/vo/${clip[0]}.ogg`;
        audio.playbackRate = rate;
        audio.currentTime = 0;
        const p = audio.play();
        handle.playing = true;
        emit(true);
        if (p && p.catch) p.catch(() => { handle.playing = false; }); // blocked or missing: words keep the wall clock
      } catch { handle.playing = false; }
      current = handle;
      return handle;
    },

    stop() {
      if (current) { const c = current; current = null; if (c.clip) { try { audio.pause(); } catch { /* ignore */ } } c.finish(); }
    },
    get speaking() { return !!(current && current.playing && !audio.paused); },
    audio, // exposed for tests and debugging
  };

  TL.VO = VO;
})();
