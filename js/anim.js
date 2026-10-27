/* Tweening, easing and the single render loop. */
(function () {
  const TL = (window.TL = window.TL || {});

  const Ease = {
    linear: (t) => t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };

  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const Anim = {
    reduced: reduceQuery.matches,
    get speed() { return this.reduced ? 0.4 : 1; },
    _byObj: new WeakMap(),
    _all: new Set(),

    /* tween a numeric property; a new tween on the same obj/key replaces the old one */
    tween(obj, key, to, dur = 400, ease = Ease.outCubic) {
      let m = this._byObj.get(obj);
      if (!m) { m = new Map(); this._byObj.set(obj, m); }
      const prev = m.get(key);
      if (prev) this._finish(prev, false);
      return new Promise((res) => {
        const tw = { obj, key, from: obj[key], to, dur: Math.max(1, dur * this.speed), ease, start: performance.now(), res, map: m };
        m.set(key, tw);
        this._all.add(tw);
      });
    },
    /* free-form animation: fn(easedT) each frame */
    run(dur, ease, fn) {
      return new Promise((res) => {
        const tw = { fn, dur: Math.max(1, dur * this.speed), ease: ease || Ease.outCubic, start: performance.now(), res };
        this._all.add(tw);
      });
    },
    _finish(tw, snap = true) {
      if (snap) {
        if (tw.fn) tw.fn(1); else tw.obj[tw.key] = tw.to;
      }
      if (tw.map && tw.map.get(tw.key) === tw) tw.map.delete(tw.key);
      this._all.delete(tw);
      tw.res();
    },
    step(now) {
      for (const tw of [...this._all]) {
        const t = Math.max(0, Math.min(1, (now - tw.start) / tw.dur));
        const e = tw.ease(t);
        if (tw.fn) tw.fn(e); else tw.obj[tw.key] = tw.from + (tw.to - tw.from) * e;
        if (t >= 1) this._finish(tw);
      }
    },
    cancelAll() { for (const tw of [...this._all]) this._finish(tw, true); },
  };

  /* one rAF loop drives tweens and every registered renderer */
  const Loop = {
    items: new Set(),
    last: performance.now(),
    add(fn) { this.items.add(fn); return () => this.items.delete(fn); },
    start() {
      const tick = (now) => {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        Anim.step(now);
        for (const fn of this.items) fn(now, dt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * Anim.speed));

  /* colour helpers for smooth colour transitions */
  function hexToRgb(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbStr = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  TL.Ease = Ease; TL.Anim = Anim; TL.Loop = Loop; TL.sleep = sleep; TL.hexToRgb = hexToRgb; TL.rgbStr = rgbStr;
})();
