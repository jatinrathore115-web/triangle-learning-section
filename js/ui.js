/* UI layer — narration strip, concept badges, quiz options, buttons,
   progress header, small VFX and static mini triangles for cards. */
(function () {
  const TL = (window.TL = window.TL || {});
  const { Geo, Anim, Sfx, C, svgEl } = TL;
  const { v, sub, add, mul, dot, norm, perp, lerpP, dist } = Geo;

  const h = (tag, cls, parent, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  };
  TL.h = h;

  /* "[side|three straight sides]" → highlighted term */
  const markup = (s) => s.replace(/\[(\w+)\|([^\]]+)\]/g, '<span class="hl hl-$1">$2</span>');
  const plain = (s) => s.replace(/\[(\w+)\|([^\]]+)\]/g, '$2');

  /* "[eq|two sides] were equal" → [{ text, cls, p }] one entry per word */
  function toWords(phrases) {
    const out = [];
    phrases.forEach((ph, p) => {
      const re = /\[(\w+)\|([^\]]+)\]|([^[]+)/g;
      let m, prevEndsSpace = true;
      while ((m = re.exec(ph))) {
        const cls = m[1] ? `hl hl-${m[1]}` : '';
        const chunk = m[2] || m[3];
        // text that touches the previous word with no space ("sides." after a highlight) stays glued to it
        const glued = !prevEndsSpace && !/^\s/.test(chunk);
        prevEndsSpace = /\s$/.test(chunk);
        chunk.split(/\s+/).filter(Boolean).forEach((w, k) => out.push({ text: w, cls, p, glue: glued && k === 0 }));
      }
    });
    return out;
  }
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ---------------- Narration ----------------
     One card at the top of the stage. Every line is voiced (TL.VO) and revealed
     word by word on the voice's own clock; the word being spoken is softly marked. */
  class Narration {
    constructor(root) {
      this.el = h('div', 'nar', root);
      this.el.setAttribute('role', 'status');
      this.el.setAttribute('aria-live', 'polite');
      this.inner = h('div', 'nar-inner', this.el);
      this.subEl = h('div', 'nar-sub', this.el);
      this.gen = 0; this.subGen = 0;
      this.active = new Set();          // voice handles still speaking
      // a tap on the card shows the whole line at once; the voice carries on
      this.el.addEventListener('pointerdown', () => { this.skip = true; });
    }
    place(x, y) {
      this.y = y; this.x = x;
      this.el.style.left = x + 'px';
      this.el.style.top = y + 'px';
    }

    /* voice `text` and reveal `spans` in step with it; resolves when every word is visible */
    _voice(text, spans, words, isCurrent, onPhrase) {
      const handle = TL.VO.speak(text);
      const times = TL.VO.wordTimes(words.map((w) => w.text), handle.clip);
      this.active.add(handle);
      handle.done.then(() => this.active.delete(handle));
      this.skip = false;
      let shown = 0, lastPhrase = -1;
      const textDone = new Promise((resolve) => {
        const tick = () => {
          if (!isCurrent()) { spans.forEach((s) => s.classList.add('in')); resolve(); return; }
          const t = handle.ended || this.skip ? Infinity : handle.time();
          while (shown < spans.length && times[shown] <= t) {
            if (shown) spans[shown - 1].classList.remove('now');
            spans[shown].classList.add('in', 'now');
            if (words[shown].p !== lastPhrase) { lastPhrase = words[shown].p; if (onPhrase) onPhrase(lastPhrase); }
            shown++;
          }
          if (shown >= spans.length) {
            const last = spans[spans.length - 1];
            // keep the follow-along mark on the last word until the voice stops
            handle.done.then(() => last && last.classList.remove('now'));
            if (!handle.clip) setTimeout(handle.finish, 450); // silent line: settle, then done
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { handle, textDone };
    }

    _render(container, words, append) {
      const html = words.map((w, i) => (i && !w.glue ? ' ' : '') + `<span class="w ${w.cls}">${escHtml(w.text)}</span>`).join('');
      if (append) container.insertAdjacentHTML('beforeend', ' ' + html);
      else container.innerHTML = html;
      const all = [...container.querySelectorAll('.w')];
      return all.slice(all.length - words.length);
    }

    async say(phrases, o = {}) {
      if (typeof phrases === 'string') phrases = [phrases];
      const gen = ++this.gen;
      TL.VO.stop();
      if (o.x != null) this.place(o.x, o.y);
      this.el.classList.remove('dim', 'warn', 'good');
      if (o.tone) this.el.classList.add(o.tone);
      if (this.el.classList.contains('show')) {
        this.inner.classList.add('swap');
        await TL.sleep(170);
        if (gen !== this.gen) return;
      }
      this.inner.classList.remove('swap');
      const words = toWords(phrases);
      const spans = this._render(this.inner, words);
      this.el.classList.remove('show'); void this.el.offsetWidth; this.el.classList.add('show');
      const { handle, textDone } = this._voice(phrases.map(plain).join(' '), spans, words, () => gen === this.gen, o.onPhrase);
      await textDone;
      if (o.noHold || gen !== this.gen) return;
      await handle.done;
      if (gen === this.gen) await TL.sleep(o.hold != null ? o.hold : 300);
    }

    /* add another phrase to the current line (used for "…and right-angled.") */
    async append(phrase, o = {}) {
      const gen = this.gen;
      const words = toWords([phrase]);
      const spans = this._render(this.inner, words, true);
      const { handle, textDone } = this._voice(plain(phrase), spans, words, () => gen === this.gen);
      await textDone;
      if (o.noHold || gen !== this.gen) return;
      await handle.done;
      if (gen === this.gen) await TL.sleep(o.hold != null ? o.hold : 300);
    }

    /* secondary instruction line inside the same card, voiced after the main line */
    async sub(text, warm) {
      const g = ++this.subGen;
      this.subEl.innerHTML = '';
      this.subEl.classList.toggle('warm', !!warm);
      this.el.classList.toggle('has-sub', !!text);
      if (!text) return;
      const words = toWords([text]);
      const spans = this._render(this.subEl, words);
      const t0 = performance.now();
      while (this.active.size && performance.now() - t0 < 12000) await Promise.race([...this.active].map((x) => x.done));
      if (g !== this.subGen) return;
      await this._voice(text, spans, words, () => g === this.subGen).textDone;
    }

    /* voice text that lives outside the card (titles), revealed word by word in `el` */
    async voiceInto(el, text) {
      const gen = this.gen;
      const words = toWords([text]);
      const spans = this._render(el, words);
      el.classList.add('voiced');
      const { handle, textDone } = this._voice(text, spans, words, () => gen === this.gen);
      await textDone;
      await handle.done;
    }

    /* read answer choices aloud one by one, softly marking the one being read;
       stops as soon as the learner answers */
    async readChoices(items, stopped) {
      const gen = this.gen;
      for (const [el, text] of items) {
        if (gen !== this.gen || stopped()) return;
        el.classList.add('reading');
        const handle = TL.VO.speak(text);
        this.active.add(handle);
        handle.done.then(() => this.active.delete(handle));
        if (!handle.clip) setTimeout(handle.finish, 700);
        await handle.done;
        el.classList.remove('reading');
        await TL.sleep(140);
      }
    }

    /* resolves once nothing is being said (safety-capped) */
    async idle(cap = 15000) {
      const t0 = performance.now();
      await TL.sleep(30);
      while (this.active.size && performance.now() - t0 < cap) await Promise.race([...this.active].map((x) => x.done));
    }

    dim(on) { this.el.classList.toggle('dim', !!on); }
    hide() { this.gen++; this.subGen++; TL.VO.stop(); this.el.classList.remove('show'); this.sub(''); }
  }

  /* ---------------- Concept badge ---------------- */
  const BADGE = {
    scalene: { col: C.side[0], label: 'SCALENE' },
    isosceles: { col: C.equal, label: 'ISOSCELES' },
    equilateral: { col: '#2A8CF0', label: 'EQUILATERAL' },
    acute: { col: C.acute, label: 'ACUTE-ANGLED' },
    right: { col: C.right, label: 'RIGHT-ANGLED' },
    obtuse: { col: C.obtuse, label: 'OBTUSE-ANGLED' },
  };
  TL.BADGE = BADGE;
  function badge(root, kind, x, y, o = {}) {
    const b = BADGE[kind];
    const n = h('div', 'badge' + (o.small ? ' small' : ''), root,
      `<svg viewBox="0 0 24 24" class="b-ico"><path d="M12 3.5 21 19.5H3Z" fill="${b.col}" stroke="${b.col}" stroke-width="2.5" stroke-linejoin="round"/></svg><span>${b.label}</span>`);
    n.style.setProperty('--bc', b.col);
    n.style.left = x + 'px'; n.style.top = y + 'px';
    requestAnimationFrame(() => n.classList.add('in'));
    if (o.sound !== false) Sfx.shimmer();
    n.pulse = () => { n.classList.remove('pulse'); void n.offsetWidth; n.classList.add('pulse'); };
    return n;
  }

  /* ---------------- Buttons ---------------- */
  function button(root, label, x, y, o = {}) {
    const b = h('button', 'btn ' + (o.variant || 'primary'), root, `<span>${label}</span>${o.arrow === false ? '' : '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'}`);
    b.style.left = x + 'px'; b.style.top = y + 'px';
    requestAnimationFrame(() => b.classList.add('in'));
    return b;
  }

  /* ---------------- Quiz options ---------------- */
  function optionList(root, items, o = {}) {
    const box = h('div', 'opts', root);
    box.style.left = o.x + 'px'; box.style.top = o.y + 'px'; box.style.width = (o.w || 380) + 'px';
    if (o.title) h('div', 'opts-title', box, o.title);
    const btns = items.map((it, i) => {
      const b = h('button', 'opt', box, `<span class="opt-key">${'ABCD'[i]}</span><span class="opt-label">${it}</span>`);
      b.style.transitionDelay = '0ms';
      setTimeout(() => b.classList.add('in'), (o.delay || 0) + i * 150 * Anim.speed);
      return b;
    });
    return { box, btns };
  }

  /* ---------------- VFX ---------------- */
  function sparkle(root, x, y, n = 5, spread = 90) {
    if (Anim.reduced) return;
    for (let i = 0; i < n; i++) {
      const s = h('div', 'spark', root);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const r = spread * (0.6 + Math.random() * 0.5);
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(a) * r + 'px');
      s.style.setProperty('--dy', Math.sin(a) * r - 20 + 'px');
      s.style.animationDelay = i * 40 + 'ms';
      setTimeout(() => s.remove(), 1400);
    }
  }
  function wave(root, x, y, color = C.correct, size = 900) {
    const w = h('div', 'wave', root);
    w.style.left = x + 'px'; w.style.top = y + 'px';
    w.style.setProperty('--wc', color); w.style.setProperty('--ws', size + 'px');
    setTimeout(() => w.remove(), 1400);
  }
  function glow(root, x, y, color = '#FFE7A3', size = 760) {
    const w = h('div', 'radial', root);
    w.style.left = x + 'px'; w.style.top = y + 'px';
    w.style.setProperty('--gc', color); w.style.setProperty('--gs', size + 'px');
    setTimeout(() => w.remove(), 2600);
  }

  /* ---------------- Mini triangle for cards ---------------- */
  function miniTriangle(Vcm, o = {}) {
    const W = o.w || 200, H = o.h || 150, pad = o.pad || 30;
    const P0 = Vcm.map((p) => v(p.x, -p.y));
    const b = Geo.bbox(P0);
    const k = o.k || Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h);
    const V = P0.map((p) => v((p.x - b.cx) * k + W / 2, (p.y - b.cy) * k + H / 2 + (o.dy || 0)));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'mini' });
    svgEl('ellipse', { cx: W / 2, cy: Geo.bbox(V).y1 + 10, rx: Geo.bbox(V).w * 0.42, ry: 7, fill: 'url(#triShadow)' }, svg);
    svgEl('polygon', { points: V.map((p) => `${p.x},${p.y}`).join(' '), fill: 'url(#triFill)' }, svg);
    svgEl('polygon', { points: V.map((p) => `${p.x},${p.y}`).join(' '), fill: 'url(#triSheen)', opacity: 0.7 }, svg);
    const angs = Geo.angles(V);
    const degs = o.angleText || Geo.displayAngles(V).deg.map((d) => d + '°');
    const refs = { sides: [], angles: [], angleLabels: [], sideLabels: [], V };
    if (o.angles) {
      for (let i = 0; i < 3; i++) {
        const P = V[i], u1 = norm(sub(V[(i + 1) % 3], P)), u2 = norm(sub(V[(i + 2) % 3], P));
        const isR = Math.abs(angs[i] - 90) < 0.3;
        const col = isR ? C.right : angs[i] > 90 ? C.obtuse : C.acute;
        let d;
        const R = 18;
        if (isR) {
          const s = 12, A = add(P, mul(u1, s)), B = add(A, mul(u2, s)), D = add(P, mul(u2, s));
          d = `M${P.x} ${P.y} L${A.x} ${A.y} L${B.x} ${B.y} L${D.x} ${D.y} Z`;
        } else {
          const A = add(P, mul(u1, R)), D = add(P, mul(u2, R));
          const sw = u1.x * u2.y - u1.y * u2.x > 0 ? 1 : 0;
          d = `M${P.x} ${P.y} L${A.x} ${A.y} A${R} ${R} 0 0 ${sw} ${D.x} ${D.y} Z`;
        }
        const rgb = TL.hexToRgb(col).map((x) => x + (255 - x) * 0.5);
        refs.angles.push(svgEl('path', { d, fill: TL.rgbStr(rgb), 'fill-opacity': 0.9, stroke: col, 'stroke-width': 2.4 }, svg));
      }
    }
    for (let i = 0; i < 3; i++) {
      const A = V[i], B = V[(i + 1) % 3];
      const col = (o.sideCols && o.sideCols[i]) || C.outline;
      refs.sides.push(svgEl('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: col, 'stroke-width': o.stroke || 5.5, 'stroke-linecap': 'round' }, svg));
      if (o.ticks && o.ticks[i]) {
        const M = lerpP(A, B, 0.5), n = perp(norm(sub(B, A)));
        svgEl('line', { x1: M.x - n.x * 7, y1: M.y - n.y * 7, x2: M.x + n.x * 7, y2: M.y + n.y * 7, stroke: C.equal, 'stroke-width': 3.2, 'stroke-linecap': 'round' }, svg);
      }
    }
    for (let i = 0; i < 3; i++) svgEl('circle', { cx: V[i].x, cy: V[i].y, r: 4, fill: '#fff', stroke: C.outlineDeep, 'stroke-width': 2.5 }, svg);
    const pill = (x, y, str, fs) => {
      const g = svgEl('g', { transform: `translate(${x} ${y})`, class: 'mini-lbl' }, svg);
      const w = str.length * fs * 0.58 + 12;
      svgEl('rect', { x: -w / 2, y: -fs * 0.8, width: w, height: fs * 1.6, rx: fs * 0.8, fill: '#fff', 'fill-opacity': 0.95, stroke: 'transparent', 'stroke-width': 2 }, g);
      const tx = svgEl('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, fill: C.navy, class: 'lbl-text' }, g);
      tx.textContent = str;
      return g;
    };
    if (o.sideText) {
      const fs = o.fs || 13;
      for (let i = 0; i < 3; i++) {
        const A = V[i], B = V[(i + 1) % 3], O = V[(i + 2) % 3], M = lerpP(A, B, 0.5);
        let n = perp(norm(sub(B, A)));
        if (dot(n, sub(O, M)) > 0) n = mul(n, -1);
        const w = o.sideText[i].length * fs * 0.58 + 12;
        const off = 6 + Math.abs(n.x) * w / 2 + Math.abs(n.y) * fs * 0.8;
        refs.sideLabels.push(pill(M.x + n.x * off, M.y + n.y * off, o.sideText[i], fs));
      }
    }
    if (o.angleLabels) {
      const fs = o.fs || 12;
      const I = Geo.incenter(V);
      for (let i = 0; i < 3; i++) {
        const P = V[i];
        const bis = norm(add(norm(sub(V[(i + 1) % 3], P)), norm(sub(V[(i + 2) % 3], P))));
        const half = (angs[i] * Math.PI) / 360;
        const dIn = Math.max(30, 17 / Math.sin(half));
        const pos = angs[i] < 89.5 && dIn < dist(P, I) * 1.3 ? add(P, mul(bis, dIn)) : add(P, mul(bis, -22));
        refs.angleLabels.push(pill(pos.x, pos.y, degs[i], fs));
      }
    }
    svg.refs = refs;
    return svg;
  }

  /* ---------------- Confetti (correct answers) ----------------
     One canvas over the stage; pieces fall from above the top edge with drift,
     spin and a soft fade. Rectangles and small triangles in the lesson palette. */
  const CONFETTI_COLS = ['#FFC93A', '#EE6A10', '#FF4F86', '#8B5CF6', '#0EA5B7', '#22B26B', '#4F6BFF'];
  let confettiCanvas = null, pieces = [], confettiRunning = false;
  function confetti(count = 90) {
    if (Anim.reduced) return;
    if (!confettiCanvas) {
      confettiCanvas = document.createElement('canvas');
      confettiCanvas.id = 'confetti'; confettiCanvas.width = 1600; confettiCanvas.height = 900;
      document.getElementById('frame').appendChild(confettiCanvas);
    }
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      pieces.push({
        x: 60 + Math.random() * 1480, y: -30 - Math.random() * 260,
        vx: (Math.random() - 0.5) * 90, vy: 160 + Math.random() * 200,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 9,
        sway: Math.random() * Math.PI * 2, size: 9 + Math.random() * 9,
        tri: Math.random() < 0.35, col: CONFETTI_COLS[i % CONFETTI_COLS.length],
        born: now, life: 2300 + Math.random() * 900,
      });
    }
    if (confettiRunning) return;
    confettiRunning = true;
    let last = now;
    const ctx2 = confettiCanvas.getContext('2d');
    const step = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx2.clearRect(0, 0, 1600, 900);
      pieces = pieces.filter((p) => t - p.born < p.life && p.y < 960);
      for (const p of pieces) {
        p.vy += 260 * dt; p.vy = Math.min(p.vy, 420);
        p.sway += dt * 3; p.x += (p.vx + Math.sin(p.sway) * 40) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const age = (t - p.born) / p.life;
        ctx2.globalAlpha = age > 0.75 ? Math.max(0, 1 - (age - 0.75) / 0.25) : 1;
        ctx2.save(); ctx2.translate(p.x, p.y); ctx2.rotate(p.rot); ctx2.scale(1, Math.abs(Math.cos(p.sway * 1.3)) * 0.7 + 0.3);
        ctx2.fillStyle = p.col;
        if (p.tri) { ctx2.beginPath(); ctx2.moveTo(0, -p.size * 0.6); ctx2.lineTo(p.size * 0.55, p.size * 0.45); ctx2.lineTo(-p.size * 0.55, p.size * 0.45); ctx2.closePath(); ctx2.fill(); }
        else ctx2.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        ctx2.restore();
      }
      ctx2.globalAlpha = 1;
      if (pieces.length) requestAnimationFrame(step); else { confettiRunning = false; ctx2.clearRect(0, 0, 1600, 900); }
    };
    requestAnimationFrame(step);
  }

  /* one feedback path for every answer in the lesson */
  TL.Feedback = {
    correct({ confetti: burst = 90 } = {}) { Sfx.correctAnswer(); if (burst) confetti(burst); },
    wrong() { Sfx.wrongAnswer(); },
  };

  TL.UI = { confetti, Narration, badge, button, optionList, sparkle, wave, glow, miniTriangle, markup };
})();
