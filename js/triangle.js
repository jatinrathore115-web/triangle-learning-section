/* TriangleView — one live SVG triangle whose vertices, sides, measurements,
   equal-side marks, angle arcs and right-angle marker are all separately
   controllable and recomputed from real coordinates every frame. */
(function () {
  const TL = (window.TL = window.TL || {});
  const { Geo, Anim, Ease, Loop, Sfx, hexToRgb, rgbStr } = TL;
  const { v, sub, add, mul, dot, cross, len, dist, norm, perp, lerpP, clone } = Geo;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- shared palette (shape colours follow the "reference shape color" image) ---------- */
  const C = {
    outline: '#EE6A10', outlineDeep: '#D4520A', inner: '#FFF2B3',
    side: ['#FF4F86', '#22B26B', '#8B5CF6'],      // side0 AB = Side 1 (rose), side2 CA = Side 2 (violet), side1 BC = Side 3 (green)
    equal: '#0EA5B7', acute: '#4F6BFF', right: '#A24BF0', obtuse: '#F2557A',
    correct: '#16B37E', wrong: '#FF7A59', navy: '#1D2B53', white: '#FFFFFF',
  };
  TL.C = C;

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  TL.svgEl = el;

  const ptsAttr = (P) => P.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const pathD = (P, close) => 'M' + P.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L') + (close ? ' Z' : '');

  /* sub-polyline between fractions s0..s1 of the total length */
  function subPoly(P, s0, s1) {
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + dist(P[i - 1], P[i]));
    const T = L[L.length - 1];
    const at = (s) => {
      const d = Math.max(0, Math.min(1, s)) * T;
      for (let i = 1; i < P.length; i++) if (d <= L[i] || i === P.length - 1) {
        const seg = L[i] - L[i - 1] || 1;
        return lerpP(P[i - 1], P[i], (d - L[i - 1]) / seg);
      }
      return P[P.length - 1];
    };
    const out = [at(s0)];
    for (let i = 1; i < P.length - 1; i++) { const f = L[i] / T; if (f > s0 && f < s1) out.push(P[i]); }
    out.push(at(s1));
    return out;
  }
  TL.subPoly = subPoly;

  /* colour easing in HSL along the shortest hue path — RGB blending of
     complementary colours (teal → orange) passes through muddy grey */
  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60 < 0 ? h * 60 + 360 : h * 60, s, l];
  }
  function hsl2rgb([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function stepColor(cur, target, a) {
    if (Math.abs(cur[0] - target[0]) + Math.abs(cur[1] - target[1]) + Math.abs(cur[2] - target[2]) < 1.5) { cur[0] = target[0]; cur[1] = target[1]; cur[2] = target[2]; return; }
    const A = rgb2hsl(cur), B = rgb2hsl(target);
    if (A[1] < 0.05) A[0] = B[0];
    let dh = B[0] - A[0];
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    const out = hsl2rgb([(A[0] + dh * a + 360) % 360, A[1] + (B[1] - A[1]) * a, A[2] + (B[2] - A[2]) * a]);
    cur[0] = out[0]; cur[1] = out[1]; cur[2] = out[2];
  }

  const ARR3 = (x) => [x, x, x];
  function defaults() {
    return {
      op: 1, fill: 1, shadow: 1, vtx: 1, glow: 0, scale: 1, outlineOp: 1,
      sl: ARR3(0), slHi: ARR3(0), ang: ARR3(0), al: ARR3(0), aHi: ARR3(0),
      sHi: ARR3(0), tick: ARR3(0), num: ARR3(0), ref: ARR3(0), handle: ARR3(0), sq: ARR3(0), ag: ARR3(1),
      sideCol: ARR3(C.outline), lblCol: ARR3(C.equal),
    };
  }
  function copyState(t) {
    const c = {};
    for (const k in t) {
      const x = t[k];
      if (Array.isArray(x)) c[k] = x.map((y) => (typeof y === 'string' ? hexToRgb(y) : y));
      else c[k] = typeof x === 'string' ? hexToRgb(x) : x;
    }
    return c;
  }

  class TriangleView {
    constructor(parent, V, opts = {}) {
      this.k = opts.k || Geo.PX_PER_CM;
      this.V = clone(V);
      this.t = defaults();
      this.c = copyState(this.t);
      this.tau = 0.13;
      this.draw = [1, 1, 1];
      this.vpop = [1, 1, 1];
      this.p = { m: 1 };
      this.fx = [];
      this.assist = {};
      this.labelFmt = {};
      this.hover = -1; this.active = -1;
      this.dragCfg = null; this.snapKind = null;
      this._txt = new Map();
      this._build(parent);
      this._unloop = Loop.add((now, dt) => this.render(now, dt));
    }

    /* ---------------- DOM ---------------- */
    _build(parent) {
      const g = (this.g = el('g', { class: 'tri' }, parent));
      this.shadow = el('ellipse', { fill: 'url(#triShadow)' }, g);
      const glowG = el('g', { filter: 'url(#softGlow)' }, g);
      this.glowLines = [0, 1, 2].map(() => el('line', { 'stroke-linecap': 'round', 'stroke-width': 24 }, glowG));
      this.outlineGlow = el('polygon', { fill: 'none', 'stroke-width': 26, 'stroke-linejoin': 'round', stroke: '#FFD27A' }, glowG);
      this.fillPoly = el('polygon', { fill: 'url(#triFill)' }, g);
      this.sheen = el('polygon', { fill: 'url(#triSheen)' }, g);
      this.inner = el('polygon', { fill: 'none', stroke: C.inner, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
      this.wedges = [0, 1, 2].map(() => ({
        fill: el('path', {}, g),
        stroke: el('path', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g),
      }));
      this.refs = [0, 1, 2].map(() => el('path', { fill: 'none', stroke: C.navy, 'stroke-width': 2.5, 'stroke-dasharray': '5 6', 'stroke-linecap': 'round' }, g));
      this.sides = [0, 1, 2].map(() => el('line', { 'stroke-linecap': 'round', 'stroke-width': 12 }, g));
      this.ticks = [0, 1, 2].map(() => el('path', { stroke: C.equal, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }, g));
      this.fxLayer = el('g', { filter: 'url(#softGlow)' }, g);
      this.fxLayerSharp = el('g', {}, g);
      this.tip = el('circle', { r: 11, fill: '#FFF6D6', filter: 'url(#softGlow)', opacity: 0 }, g);

      this.verts = [0, 1, 2].map((i) => {
        const vg = el('g', { class: 'vtx' }, g);
        const halo = el('circle', { fill: 'none', stroke: C.outline, 'stroke-width': 2.5 }, vg);
        const soft = el('circle', { fill: 'rgba(255,255,255,0.45)', stroke: 'rgba(238,106,16,0.45)', 'stroke-width': 1.5 }, vg);
        const ring = el('circle', { fill: '#fff', stroke: C.outlineDeep, 'stroke-width': 5 }, vg);
        const hit = el('circle', { r: 32, fill: 'transparent', class: 'vtx-hit', tabindex: -1, role: 'slider', 'aria-label': `Vertex ${'ABC'[i]}` }, vg);
        hit.style.pointerEvents = 'none';
        hit.addEventListener('pointerdown', (e) => this._down(i, e));
        hit.addEventListener('pointerenter', () => { this.hover = i; });
        hit.addEventListener('pointerleave', () => { if (this.hover === i) this.hover = -1; });
        hit.addEventListener('keydown', (e) => this._key(i, e));
        return { vg, halo, soft, ring, hit };
      });

      const lab = (h, fs) => {
        const lg = el('g', { class: 'lbl' }, g);
        const rect = el('rect', { height: h, rx: h / 2, y: -h / 2, fill: 'rgba(255,255,255,0.95)', filter: 'url(#lblShadow)' }, lg);
        const text = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, fill: C.navy, class: 'lbl-text' }, lg);
        return { lg, rect, text, h };
      };
      this.sideLbls = [0, 1, 2].map(() => lab(42, 23));
      this.angLbls = [0, 1, 2].map(() => lab(36, 20));
      this.refLbls = [0, 1, 2].map(() => { const r = lab(32, 17); r.text.textContent = '< 90°'; r.rect.setAttribute('width', 76); r.rect.setAttribute('x', -38); return r; });
      this.nums = [0, 1, 2].map(() => {
        const ng = el('g', {}, g);
        const circ = el('circle', { r: 20, fill: '#fff', 'stroke-width': 4, filter: 'url(#lblShadow)' }, ng);
        const text = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 21, class: 'lbl-text' }, ng);
        return { ng, circ, text };
      });
    }

    destroy() { this._unloop(); this.g.remove(); }

    /* ---------------- state API ---------------- */
    set(obj, { instant = false } = {}) {
      for (const k in obj) {
        const val = obj[k];
        if (Array.isArray(this.t[k]) && !Array.isArray(val)) this.t[k] = ARR3(val);
        else this.t[k] = Array.isArray(val) ? val.slice() : val;
        if (instant) {
          const x = this.t[k];
          this.c[k] = Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? hexToRgb(y) : y)) : typeof x === 'string' ? hexToRgb(x) : x;
        }
      }
      return this;
    }
    setAt(key, i, val) { this.t[key][i] = val; return this; }
    reset(extra = {}, opts) {
      const d = defaults();
      d.op = this.t.op; // visibility is owned by whoever shows/hides the triangle
      this.assist = {}; this.labelFmt = {};
      return this.set(Object.assign(d, extra), opts);
    }

    get targetV() { return this._mto || this.V; }
    setShape(V) { this._mto = null; this.V = clone(V); }

    morphTo(V2, dur = 800, ease = Ease.inOutCubic) {
      this._mfrom = clone(this.V);
      this._mto = clone(V2);
      this.p.m = 0;
      return Anim.tween(this.p, 'm', 1, dur, ease);
    }

    pulse(type, o = {}) {
      return new Promise((res) => this.fx.push({ type, start: performance.now(), dur: (o.dur || 600) * Anim.speed, res, ...o }));
    }
    /* light travelling along a polyline that is recomputed from live vertices */
    comet(pathFn, o = {}) {
      const path = el('path', { fill: 'none', stroke: o.color || '#FFF7D1', 'stroke-width': o.width || 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.fxLayer);
      const core = el('path', { fill: 'none', stroke: '#fff', 'stroke-width': (o.width || 8) * 0.45, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.fxLayerSharp);
      return this.pulse('comet', { dur: o.dur || 800, pathFn, path, core, tail: o.tail || 0.22, ease: o.ease || Ease.inOutSine });
    }
    perimeter(start = 0) { return () => { const V = this.Vd; return [V[start], V[(start + 1) % 3], V[(start + 2) % 3], V[start]]; }; }
    sidePath(i) { return () => [this.Vd[i], this.Vd[(i + 1) % 3]]; }

    async drawIn({ vertexGap = 170, sideDur = 360, sound = true } = {}) {
      this.draw = [0, 0, 0]; this.vpop = [0, 0, 0];
      this.set({ fill: 0, shadow: 0, op: 1 }, { instant: true });
      if (Anim.reduced) {
        this.draw = [1, 1, 1]; this.vpop = [1, 1, 1];
        this.set({ op: 0 }, { instant: true }); this.set({ op: 1, fill: 1, shadow: 1 });
        return TL.sleep(300);
      }
      for (let i = 0; i < 3; i++) {
        Anim.tween(this.vpop, i, 1, 320, Ease.outBack);
        if (sound) Sfx.pop();
        await TL.sleep(vertexGap);
      }
      for (let i = 0; i < 3; i++) {
        if (sound) Sfx.trace(sideDur / 1000);
        await Anim.tween(this.draw, i, 1, sideDur, Ease.inOutCubic);
      }
      this.set({ fill: 1, shadow: 1 });
      this.comet(this.perimeter(0), { dur: 700, tail: 0.3 });
      await this.pulse('scale', { amp: 0.025, dur: 900 });
    }

    /* ---------------- interaction ---------------- */
    enableDrag(cfg) {
      this.dragCfg = Object.assign({ vertices: [0, 1, 2], minSide: 100, minAngle: 14 }, cfg);
      this.snapKind = null;
      this.verts.forEach((vt, i) => {
        const on = this.dragCfg.vertices.includes(i);
        vt.hit.style.pointerEvents = on ? 'all' : 'none';
        vt.hit.setAttribute('tabindex', on ? 0 : -1);
        vt.hit.classList.toggle('draggable', on);
      });
      const hl = cfg.affordance != null ? cfg.affordance : this.dragCfg.vertices;
      this.set({ handle: [0, 1, 2].map((i) => (hl.includes(i) ? 1 : 0.35 * (this.dragCfg.vertices.includes(i) ? 1 : 0))) });
    }
    disableDrag() {
      this.dragCfg = null; this.active = -1;
      this.verts.forEach((vt) => { vt.hit.style.pointerEvents = 'none'; vt.hit.setAttribute('tabindex', -1); vt.hit.classList.remove('draggable'); });
      this.set({ handle: 0 });
      document.body.classList.remove('grabbing');
    }
    _svgPt(e) {
      const svg = this.g.ownerSVGElement;
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    }
    _down(i, e) {
      if (!this.dragCfg) return;
      e.preventDefault();
      Sfx.unlock();
      this.active = i;
      const p = this._svgPt(e);
      this.grab = sub(this.V[i], v(p.x, p.y));
      document.body.classList.add('grabbing');
      const move = (ev) => {
        if (this.active !== i) return;
        const q = this._svgPt(ev);
        this._applyDrag(i, add(v(q.x, q.y), this.grab));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.body.classList.remove('grabbing');
        if (this.active !== i) return;
        this.active = -1;
        if (this.dragCfg && this.dragCfg.onEnd) this.dragCfg.onEnd(this.V, this.snapKind);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      if (this.dragCfg.onStart) this.dragCfg.onStart(i);
    }
    _key(i, e) {
      if (!this.dragCfg) return;
      const d = { ArrowLeft: v(-4, 0), ArrowRight: v(4, 0), ArrowUp: v(0, -4), ArrowDown: v(0, 4) }[e.key];
      if (d) {
        e.preventDefault();
        if (this.dragCfg.onStart) this.dragCfg.onStart(i);
        this._applyDrag(i, add(this.V[i], d));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this.dragCfg.onEnd) this.dragCfg.onEnd(this.V, this.snapKind);
      }
    }
    _applyDrag(i, target) {
      const cfg = this.dragCfg; if (!cfg) return;
      const V = this.V;
      const attempt = (p) => {
        const s = cfg.snap ? cfg.snap(i, p, V) : { p, kind: null };
        const W = clone(V); W[i] = s.p;
        return Geo.valid(W, cfg) ? { W, kind: s.kind } : null;
      };
      let r = attempt(target);
      if (!r) {
        const old = V[i]; let lo = 0, hi = 1, ok = null;
        for (let n = 0; n < 12; n++) {
          const mid = (lo + hi) / 2, p = lerpP(old, target, mid);
          const W = clone(V); W[i] = p;
          if (Geo.valid(W, cfg)) { lo = mid; ok = p; } else hi = mid;
        }
        if (ok) r = attempt(ok);
      }
      if (!r) return;
      if (dist(r.W[i], V[i]) > 0.5) Sfx.tick();
      this.V = r.W;
      if (r.kind && r.kind !== this.snapKind) { Sfx.snap(); this.pulse('vertexFlash', { i, dur: 420 }); }
      this.snapKind = r.kind;
      if (cfg.onMove) cfg.onMove(this.V, r.kind, i);
    }

    /* ---------------- render ---------------- */
    render(now, dt) {
      const t = this.t, c = this.c;
      // morph
      if (this._mto) {
        this.V = this._mfrom.map((p, i) => lerpP(p, this._mto[i], this.p.m));
        if (this.p.m >= 1) this._mto = null;
      }
      const V0 = this.V;
      const raw = Geo.angles(V0);
      const exact90 = raw.map((a) => Math.abs(a - 90) < 0.05);
      const lens = Geo.sides(V0).map((s) => s / this.k);

      // live assists write into targets
      if (this.assist.equal) {
        const hi = [0, 0, 0], tk = [0, 0, 0];
        const pairs = [[0, 1], [1, 2], [2, 0]];
        for (const [a, b] of pairs) {
          const d = Math.abs(lens[a] - lens[b]);
          const cl = Math.max(0, 1 - d / 0.6);
          const val = d < 0.02 ? 1 : cl * cl * 0.75;
          hi[a] = Math.max(hi[a], val); hi[b] = Math.max(hi[b], val);
          if (d < 0.02) { tk[a] = 1; tk[b] = 1; }
        }
        t.slHi = hi; t.tick = tk; t.lblCol = ARR3(C.equal);
        t.sHi = tk.map((x) => x * 0.6);
      }
      if (this.assist.right || this.assist.obtuse) {
        t.aHi = raw.map((ang, i) => {
          if (this.assist.obtuse && ang > 90.05) return 1;
          if (this.assist.right) { const cl = Math.max(0, 1 - Math.abs(ang - 90) / 22); return exact90[i] ? 1 : cl * cl * 0.8; }
          return 0;
        });
      }
      t.sq = exact90.map((x) => (x ? 1 : 0));

      // smoothing
      const a = 1 - Math.exp(-dt / this.tau);
      for (const k in t) {
        const tv = t[k];
        if (Array.isArray(tv)) {
          for (let i = 0; i < 3; i++) {
            if (typeof tv[i] === 'string') stepColor(c[k][i], hexToRgb(tv[i]), Math.min(1, a * 1.6));
            else c[k][i] += (tv[i] - c[k][i]) * (k === 'sq' ? Math.min(1, a * 1.6) : a);
          }
        } else if (typeof tv === 'string') { const tc = hexToRgb(tv); for (let j = 0; j < 3; j++) c[k][j] += (tc[j] - c[k][j]) * a; }
        else c[k] += (tv - c[k]) * a;
      }

      // effects
      let glowFx = 0, scaleFx = 0, shakeX = 0;
      const sideFx = [0, 0, 0], sideLblPop = [0, 0, 0], angPop = [0, 0, 0], vflash = [0, 0, 0];
      const rings = [];
      for (const f of [...this.fx]) {
        const tt = Math.max(0, Math.min(1, (now - f.start) / f.dur));
        const bell = Math.sin(Math.PI * tt);
        switch (f.type) {
          case 'glow': glowFx = Math.max(glowFx, bell * (f.amp || 1)); break;
          case 'scale': scaleFx += bell * (f.amp || 0.02); break;
          case 'side': sideFx[f.i] = Math.max(sideFx[f.i], bell * (f.amp || 1)); break;
          case 'sideLabel': sideLblPop[f.i] = Math.max(sideLblPop[f.i], bell); break;
          case 'angle': angPop[f.i] = Math.max(angPop[f.i], bell); break;
          case 'vertexFlash': vflash[f.i] = Math.max(vflash[f.i], bell); break;
          case 'ring': rings.push({ f, tt }); break;
          case 'shake': shakeX += Math.sin(tt * Math.PI * 6) * 5 * (1 - tt); break;
          case 'comet': break;
        }
        if (tt >= 1) {
          this.fx.splice(this.fx.indexOf(f), 1);
          if (f.path) { f.path.remove(); f.core.remove(); }
          if (f.ringEl) f.ringEl.remove();
          f.res();
        }
      }

      // displayed vertices (scale about centroid for pulses / camera)
      const cen = Geo.centroid(V0);
      const s = c.scale * (1 + scaleFx);
      const V = (this.Vd = V0.map((p) => add(cen, mul(sub(p, cen), s))));
      const bb = Geo.bbox(V);

      this.g.setAttribute('opacity', Math.max(0, c.op).toFixed(3));

      // shadow
      this.shadow.setAttribute('cx', bb.cx); this.shadow.setAttribute('cy', bb.y1 + 26);
      this.shadow.setAttribute('rx', Math.max(40, bb.w * 0.46)); this.shadow.setAttribute('ry', 16);
      this.shadow.setAttribute('opacity', (0.9 * c.shadow).toFixed(3));

      // fill + highlight
      this.fillPoly.setAttribute('points', ptsAttr(V));
      this.fillPoly.setAttribute('opacity', c.fill.toFixed(3));
      this.sheen.setAttribute('points', ptsAttr(V));
      this.sheen.setAttribute('opacity', (c.fill * 0.75).toFixed(3));
      const I = Geo.incenter(V), r = Geo.inradius(V);
      const inset = Math.min(8, r * 0.3);
      this.inner.setAttribute('points', ptsAttr(V.map((p) => add(I, mul(sub(p, I), 1 - inset / r)))));
      this.inner.setAttribute('opacity', (c.fill * 0.85).toFixed(3));

      // outline glow (pulses)
      this.outlineGlow.setAttribute('points', ptsAttr(V));
      this.outlineGlow.setAttribute('opacity', Math.min(1, c.glow + glowFx).toFixed(3));

      // sides
      for (let i = 0; i < 3; i++) {
        const A = V[i], B = V[(i + 1) % 3];
        const d = this.draw[i];
        const E = lerpP(A, B, d);
        const ln = this.sides[i];
        ln.setAttribute('x1', A.x); ln.setAttribute('y1', A.y); ln.setAttribute('x2', E.x); ln.setAttribute('y2', E.y);
        ln.setAttribute('stroke', rgbStr(c.sideCol[i]));
        ln.setAttribute('stroke-width', (12 + 3 * c.sHi[i] + 2.5 * sideFx[i]).toFixed(2));
        ln.setAttribute('opacity', d <= 0.001 ? 0 : c.outlineOp);
        const gl = this.glowLines[i];
        gl.setAttribute('x1', A.x); gl.setAttribute('y1', A.y); gl.setAttribute('x2', E.x); gl.setAttribute('y2', E.y);
        gl.setAttribute('stroke', rgbStr(c.sideCol[i]));
        gl.setAttribute('opacity', d <= 0.001 ? 0 : Math.min(0.9, c.sHi[i] * 0.55 + sideFx[i] * 0.8).toFixed(3));

        // equal-side tick
        const tk = c.tick[i];
        if (tk > 0.01) {
          const M = lerpP(A, B, 0.5), u = norm(sub(B, A)), n = perp(u), h = 13 * tk;
          this.ticks[i].setAttribute('d', `M${M.x - n.x * h} ${M.y - n.y * h} L${M.x + n.x * h} ${M.y + n.y * h}`);
          this.ticks[i].setAttribute('opacity', tk.toFixed(3));
        } else this.ticks[i].setAttribute('opacity', 0);
      }
      // draw-in tip
      const drawing = this.draw.findIndex((d) => d > 0.001 && d < 0.999);
      if (drawing >= 0) {
        const E = lerpP(V[drawing], V[(drawing + 1) % 3], this.draw[drawing]);
        this.tip.setAttribute('cx', E.x); this.tip.setAttribute('cy', E.y); this.tip.setAttribute('opacity', 1);
      } else this.tip.setAttribute('opacity', 0);

      // comets
      for (const f of this.fx) if (f.type === 'comet') {
        const tt = f.ease(Math.max(0, Math.min(1, (now - f.start) / f.dur)));
        const P = f.pathFn();
        const head = tt * (1 + f.tail);
        const seg = subPoly(P, Math.max(0, head - f.tail), Math.min(1, head));
        const fade = head > 1 ? Math.max(0, 1 - (head - 1) / f.tail) : 1;
        f.path.setAttribute('d', pathD(seg)); f.core.setAttribute('d', pathD(seg));
        f.path.setAttribute('opacity', fade); f.core.setAttribute('opacity', fade * 0.9);
      }

      // angles: wedge ↔ right-angle square blend
      for (let i = 0; i < 3; i++) {
        const P = V[i], Q = V[(i + 1) % 3], R = V[(i + 2) % 3];
        const u1 = norm(sub(Q, P)), u2 = norm(sub(R, P));
        const th = raw[i];
        const kindCol = exact90[i] ? C.right : th > 90 ? C.obtuse : C.acute;
        if (!this._angCol) this._angCol = [hexToRgb(C.acute), hexToRgb(C.acute), hexToRgb(C.acute)];
        const tc = hexToRgb(kindCol);
        stepColor(this._angCol[i], tc, Math.min(1, a * 1.3));
        const col = this._angCol[i];

        const adj = Math.min(dist(P, Q), dist(P, R));
        const R0 = Math.max(36, Math.min(62, adj * 0.3)) * (th > 90 ? 1.12 : 1) * (1 + 0.08 * angPop[i]) * Math.max(0.001, c.ag[i]);
        const sq = c.sq[i];
        const N = 18;
        const a1 = Math.atan2(u1.y, u1.x);
        const sweep = Math.atan2(cross(u1, u2), dot(u1, u2));
        const ss = 28;
        const P1 = add(P, mul(u1, ss)), P2 = add(P1, mul(u2, ss)), P3 = add(P, mul(u2, ss));
        const pts = [];
        for (let n = 0; n <= N; n++) {
          const f = n / N;
          const arcP = add(P, v(Math.cos(a1 + sweep * f) * R0, Math.sin(a1 + sweep * f) * R0));
          const sqP = f < 0.5 ? lerpP(P1, P2, f * 2) : lerpP(P2, P3, (f - 0.5) * 2);
          pts.push(lerpP(arcP, sqP, sq));
        }
        const op = c.ang[i];
        const w = this.wedges[i];
        w.fill.setAttribute('d', pathD([P, ...pts], true));
        const pastel = [0, 1, 2].map((j) => col[j] + (255 - col[j]) * (0.5 - 0.18 * c.aHi[i]));
        w.fill.setAttribute('fill', rgbStr(pastel, (0.82 + 0.15 * c.aHi[i]) * op));
        w.stroke.setAttribute('d', pathD(pts));
        w.stroke.setAttribute('stroke', rgbStr(col, op));
        w.stroke.setAttribute('stroke-width', (3.5 + 1.8 * c.aHi[i] + 1.5 * angPop[i]).toFixed(2));

        // 90° comparator helper
        const rf = c.ref[i];
        if (rf > 0.01) {
          const dir = Math.sign(sweep) || 1;
          const rr = R0 + 18, M = [];
          for (let n = 0; n <= 16; n++) { const ang = a1 + dir * (Math.PI / 2) * (n / 16); M.push(add(P, v(Math.cos(ang) * rr, Math.sin(ang) * rr))); }
          this.refs[i].setAttribute('d', pathD([P, ...M, P]));
          this.refs[i].setAttribute('opacity', (rf * 0.75).toFixed(3));
          const rp = add(P, mul(norm(add(u1, u2)), -46));
          this.refLbls[i].lg.setAttribute('transform', `translate(${rp.x.toFixed(2)} ${rp.y.toFixed(2)})`);
          this.refLbls[i].lg.setAttribute('opacity', rf.toFixed(3));
          this.refLbls[i].rect.setAttribute('stroke', rgbStr(col, 0.8));
          this.refLbls[i].rect.setAttribute('stroke-width', 2);
        } else { this.refs[i].setAttribute('opacity', 0); this.refLbls[i].lg.setAttribute('opacity', 0); }

        // angle label inside along the bisector
        const al = this.angLbls[i];
        if (i === 0) this._degs = Geo.displayAngles(V0).deg;
        const txt = this.labelFmt.angle ? this.labelFmt.angle(i, this._degs) : null;
        const str = txt || `${this._degs[i]}°`;
        this._setText(al.text, str);
        const wdt = str.length * 11.4 + 22;
        al.rect.setAttribute('width', wdt); al.rect.setAttribute('x', -wdt / 2);
        const bis = norm(add(u1, u2));
        const half = (th * Math.PI) / 360;
        const rl = Math.hypot(wdt / 2, al.h / 2) * 0.82;
        const dIn = Math.max(R0 + 6 + rl * 0.8, (rl + 6) / Math.sin(half));
        const dInc = dist(P, I);
        const pos = dIn <= dInc * 1.25 ? add(P, mul(bis, dIn)) : add(P, mul(bis, -(rl + 24)));
        const sc = 1 + 0.06 * c.aHi[i] + 0.08 * angPop[i];
        al.lg.setAttribute('transform', `translate(${(pos.x + shakeX).toFixed(2)} ${pos.y.toFixed(2)}) scale(${sc.toFixed(3)})`);
        al.lg.setAttribute('opacity', Math.max(0, c.al[i]).toFixed(3));
        al.rect.setAttribute('stroke', rgbStr(col, Math.min(1, c.aHi[i] + angPop[i])));
        al.rect.setAttribute('stroke-width', 2.5);
      }

      // expanding ring fx (around an angle)
      for (const { f, tt } of rings) {
        if (!f.ringEl) f.ringEl = el('circle', { fill: 'none', 'stroke-width': 3 }, this.fxLayerSharp);
        const P = V[f.i];
        f.ringEl.setAttribute('cx', P.x); f.ringEl.setAttribute('cy', P.y);
        f.ringEl.setAttribute('r', 20 + tt * (f.size || 70));
        f.ringEl.setAttribute('stroke', f.color || C.obtuse);
        f.ringEl.setAttribute('opacity', (1 - tt) * 0.8);
      }

      // side labels (offset along the outward normal)
      const dl = Geo.displayLengths(V0, this.k).text;
      for (let i = 0; i < 3; i++) {
        const A = V[i], B = V[(i + 1) % 3], O = V[(i + 2) % 3];
        const M = lerpP(A, B, 0.5);
        let n = perp(norm(sub(B, A)));
        if (dot(n, sub(O, M)) > 0) n = mul(n, -1);
        const sl = this.sideLbls[i];
        const str = this.labelFmt.side ? this.labelFmt.side(i, dl) : dl[i];
        this._setText(sl.text, str);
        const wdt = str.length * 12.6 + 26;
        sl.rect.setAttribute('width', wdt); sl.rect.setAttribute('x', -wdt / 2);
        const off = 14 + Math.abs(n.x) * wdt / 2 + Math.abs(n.y) * sl.h / 2;
        const pos = add(M, mul(n, off));
        const sc = 1 + 0.08 * sideLblPop[i] + 0.04 * c.slHi[i];
        sl.lg.setAttribute('transform', `translate(${(pos.x + shakeX).toFixed(2)} ${pos.y.toFixed(2)}) scale(${sc.toFixed(3)})`);
        sl.lg.setAttribute('opacity', Math.max(0, c.sl[i]).toFixed(3));
        sl.rect.setAttribute('stroke', rgbStr(c.lblCol[i], Math.min(1, c.slHi[i] + sideLblPop[i] * 0.6)));
        sl.rect.setAttribute('stroke-width', 3);

        // side number badges (1, 2, 3)
        const nb = this.nums[i];
        const np = add(M, mul(n, 36));
        nb.ng.setAttribute('transform', `translate(${np.x.toFixed(2)} ${np.y.toFixed(2)}) scale(${(0.6 + 0.4 * c.num[i]).toFixed(3)})`);
        nb.ng.setAttribute('opacity', Math.max(0, c.num[i]).toFixed(3));
        nb.circ.setAttribute('stroke', rgbStr(c.sideCol[i]));
        nb.text.setAttribute('fill', rgbStr(c.sideCol[i]));
        this._setText(nb.text, String(this.numOrder ? this.numOrder[i] : i + 1));
      }

      // vertices + drag affordance
      const breathe = 0.5 + 0.5 * Math.sin((now / 3600) * Math.PI * 2);
      for (let i = 0; i < 3; i++) {
        const vt = this.verts[i], P = V[i];
        vt.vg.setAttribute('transform', `translate(${P.x.toFixed(2)} ${P.y.toFixed(2)})`);
        const hov = this.dragCfg && this.dragCfg.vertices.includes(i) ? (this.active === i ? 1.18 : this.hover === i ? 1.1 : 1) : 1;
        const pop = this.vpop[i];
        vt.ring.setAttribute('r', (11 * pop * hov * (1 + 0.15 * vflash[i])).toFixed(2));
        vt.ring.setAttribute('stroke-width', (4.5 + 0.6 * breathe).toFixed(2));
        vt.ring.setAttribute('opacity', (c.vtx * Math.min(1, pop)).toFixed(3));
        const hd = c.handle[i];
        vt.soft.setAttribute('r', (20 * hov).toFixed(2));
        vt.soft.setAttribute('opacity', (hd * (this.active === i ? 1 : 0.85)).toFixed(3));
        const ph = ((now / 1600) + i * 0.2) % 1;
        vt.halo.setAttribute('r', (21 + ph * 18).toFixed(2));
        vt.halo.setAttribute('opacity', (hd * (1 - ph) * 0.75 * (this.active >= 0 ? 0.3 : 1)).toFixed(3));
      }
    }

    _setText(node, str) {
      if (this._txt.get(node) !== str) { node.textContent = str; this._txt.set(node, str); }
    }
  }

  TL.TriangleView = TriangleView;
})();
