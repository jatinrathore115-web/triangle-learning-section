/* LearningTransitionController — runs screen scripts, owns the persistent
   triangle, and hands each screen a small context API. */
(function () {
  const TL = window.TL;
  const { Geo, Anim, Loop, Sfx, VO, UI, TriangleView, h, svgEl } = TL;
  const { v } = Geo;
  const CANCEL = { cancelled: true };

  const $ = (id) => document.getElementById(id);

  const App = {
    i: 0,
    token: 0,
    scale: 1,
    carried: null,

    init() {
      this.frame = $('frame');
      this.overlay = $('overlay');
      this.bg = $('bg');
      this.fit();
      window.addEventListener('resize', () => this.fit());

      if (Anim.reduced) document.body.classList.add('reduced');
      TL.Scenery.init();
      Loop.start();

      this.tri = new TriangleView($('triLayer'), Geo.toPx(TL.SHAPES.s546, v(800, 470)));
      this.tri.set({ op: 0 }, { instant: true });
      this.narr = new UI.Narration(this.overlay);

      this.ambient();
      this.wireUi();

      VO.onSpeaking((on) => Sfx.duck(on));
      // audio may only start after a tap: the lesson opens on a start button
      const q = new URLSearchParams(location.search).get('screen');
      const startAt = q ? Math.max(0, parseInt(q, 10) - 1) : 0;
      const start = $('start'), go = () => {
        Sfx.unlock(); VO.unlock(); Sfx.select();
        $('startBtn').classList.add('pressed');
        setTimeout(() => { start.classList.add('gone'); this.go(startAt); }, 160);
        setTimeout(() => start.remove(), 800);
      };
      $('startBtn').addEventListener('click', go, { once: true });
      const keyStart = (e) => { if (start.isConnected && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.removeEventListener('keydown', keyStart); $('startBtn').click(); } };
      document.addEventListener('keydown', keyStart);
    },

    fit() {
      const vw = window.innerWidth, vh = window.innerHeight;
      this.scale = Math.min(vw / 1600, vh / 900);
      this.frame.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
    },

    ambient() {
      const amb = $('ambient');
      for (let i = 0; i < 16; i++) {
        const m = h('div', 'mote', amb);
        m.style.left = Math.random() * 1600 + 'px';
        m.style.top = 300 + Math.random() * 600 + 'px';
        m.style.setProperty('--mx', (Math.random() * 80 - 40) + 'px');
        m.style.animationDuration = 9 + Math.random() * 9 + 's';
        m.style.animationDelay = -Math.random() * 14 + 's';
        const s = 3 + Math.random() * 5;
        m.style.width = m.style.height = s + 'px';
      }
    },

    wireUi() {
      document.addEventListener('pointerdown', () => Sfx.unlock());
      $('navBack').addEventListener('click', () => { Sfx.select(); if (this.i > 0) this.go(this.i - 1); });
      $('navNext').addEventListener('click', () => { Sfx.select(); if (this.i < TL.SCREENS.length - 1) this.go(this.i + 1); });

      document.addEventListener('keydown', (e) => {
        Sfx.unlock();
        if (e.target.closest && e.target.closest('select, input, .vtx-hit')) return;
        if (e.key === 'Enter' && this.ctx) {
          const btns = [...this.ctx.layer.querySelectorAll('.btn:not(:disabled)')];
          if (btns.length && document.activeElement === document.body) { e.preventDefault(); btns[btns.length - 1].click(); }
        }
      });
    },

    async go(n, o = {}) {
      const S = TL.SCREENS;
      n = Math.max(0, Math.min(S.length - 1, n));
      const token = ++this.token;
      const prev = this.ctx;
      if (prev) prev._exit(!!o.seamless);
      this.i = n;
      const def = S[n];
      $('navBack').disabled = n === 0;
      $('navNext').disabled = n === S.length - 1;
      document.body.classList.toggle('checkpoint', def.kind === 'check');
      document.body.classList.toggle('focus', def.kind === 'check');
      if (!o.seamless) {
        this.tri.disableDrag();
        this.tri.assist = {};
        this.tri.labelFmt = {};
        this.tri.numOrder = null;
      }
      const ctx = (this.ctx = this.makeCtx(token, def, o));
      try {
        const r = await def.enter(ctx);
        if (token === this.token && n < S.length - 1) this.go(n + 1, r || {});
      } catch (e) {
        if (e !== CANCEL) console.error(e);
      }
    },

    makeCtx(token, def, o) {
      const app = this, tri = this.tri, narr = this.narr;
      const layer = h('div', 'layer', this.overlay);
      const svgFront = svgEl('g', {}, $('stageFront'));
      const svgBack = svgEl('g', {}, $('stageBack'));
      const views = [];

      // adopt elements carried over from the previous screen
      const carried = this.carried;
      this.carried = null;
      if (carried) carried.els.forEach((e) => layer.appendChild(e));

      // narration lives in one fixed slot at the top of the glass stage
      const NARR_TOP = v(800, 70);

      const ctx = {
        tri, narr, layer, svg: svgFront, svgBack, def,
        seamless: !!o.seamless,
        carried: carried ? carried.data : null,
        narrAt: null,

        alive() { if (token !== app.token) throw CANCEL; },
        async wait(ms) { await TL.sleep(ms); ctx.alive(); },
        async step(p) { const r = await p; ctx.alive(); return r; },

        _pos(opt) {
          const at = opt.at || ctx.narrAt || NARR_TOP;
          const chars = [].concat(opt.text || '').join(' ').replace(/\[(\w+)\|([^\]]+)\]/g, '$2').length;
          const w = Math.min(900, chars * 16 + 64);
          return v(Math.max(120 + w / 2 + 14, Math.min(1480 - w / 2 - 14, at.x)), at.y);
        },
        async say(phrases, opt = {}) {
          ctx.alive();
          const p = ctx._pos({ ...opt, text: phrases });
          await narr.say(phrases, { ...opt, x: p.x, y: p.y });
          ctx.alive();
        },
        sayFree(phrases, opt = {}) {
          if (token !== app.token) return;
          const p = ctx._pos({ ...opt, text: phrases });
          narr.say(phrases, { ...opt, x: p.x, y: p.y, noHold: true });
        },
        async append(phrase, opt = {}) { await narr.append(phrase, opt); ctx.alive(); },
        async voiceInto(el, text) { await narr.voiceInto(el, text); ctx.alive(); },

        async morph(V, dur = 850) { await tri.morphTo(V, dur); ctx.alive(); },
        /* bring the persistent triangle to V: draw it if hidden, otherwise morph */
        async ensure(V, { dur = 850 } = {}) {
          if (tri.t.op < 0.5) {
            tri.setShape(V);
            await ctx.step(tri.drawIn());
          } else {
            const d = Math.max(...V.map((p, i) => Geo.dist(p, tri.V[i])));
            if (d > 0.5) await ctx.morph(V, dur);
          }
        },
        view(V, opts) {
          const tv = new TriangleView(svgBack, V, opts);
          views.push(tv);
          return tv;
        },
        /* badge slot: under the triangle, or beside it when a tall shape leaves no room below */
        below(V = tri.targetV, gap = 92) {
          const b = Geo.bbox(V);
          if (b.y1 + gap <= 742) return [b.cx, b.y1 + gap];
          return b.x1 + 190 <= 1340 ? [b.x1 + 190, b.cy] : [b.x0 - 190, b.cy];
        },

        badge(kind, x, y, opt) { return UI.badge(layer, kind, x, y, opt); },
        button(label, x = 800, y = 838, opt) { return UI.button(layer, label, x, y, opt); },
        click(btn) {
          return new Promise((res) => btn.addEventListener('click', () => { Sfx.select(); res(); }, { once: true }))
            .then(() => ctx.alive());
        },
        async continue(label = 'Continue', opt = {}) {
          await ctx.step(narr.idle()); // never offer Continue while the narrator is still talking
          await ctx.wait(opt.delay != null ? opt.delay : 150);
          const b = ctx.button(label, opt.x, opt.y, opt);
          await ctx.click(b);
          b.disabled = true;
          return b;
        },
        chip(text) {
          const c = h('div', 'chip', layer, `<i></i>${text.toUpperCase()}`);
          requestAnimationFrame(() => c.classList.add('in'));
          return c;
        },
        hint(text, warm) { if (token === app.token) narr.sub(text, warm); },
        floatLabel(text, x, y) {
          const f = h('div', 'float-lbl', layer, text);
          f.style.left = x + 'px'; f.style.top = y + 'px';
          requestAnimationFrame(() => f.classList.add('in'));
          return f;
        },
        sparkle(x, y, n, spread) { UI.sparkle(layer, x, y, n, spread); },
        wave(x, y, color, size) { UI.wave(layer, x, y, color, size); },
        glow(x, y, color, size) { UI.glow(layer, x, y, color, size); },
        /* subtle camera push for concept reveals */
        reveal() {
          app.bg.classList.add('push');
          tri.pulse('scale', { amp: 0.03, dur: 1000 });
          setTimeout(() => app.bg.classList.remove('push'), 700);
        },
        carry(data, els) {
          els.forEach((e) => app.overlay.appendChild(e));
          app.carried = { data, els };
        },
        goto(n) { app.go(n); },

        _exit(seamless) {
          layer.classList.add('leaving');
          setTimeout(() => layer.remove(), 420);
          for (const g of [svgFront, svgBack]) {
            g.style.transition = 'opacity .35s'; g.style.opacity = 0;
          }
          for (const tv of views) {
            tv.set({ op: 0 });
            tv.morphTo(tv.V.map((p) => v(p.x - 50, p.y)), 520);
          }
          setTimeout(() => { views.forEach((tv) => tv.destroy()); svgFront.remove(); svgBack.remove(); }, 560);
          if (!seamless) narr.hide();
          app.bg.classList.remove('push');
        },
      };
      return ctx;
    },
  };

  TL.App = App;
  TL.CANCEL = CANCEL;
  window.addEventListener('DOMContentLoaded', () => App.init());
})();
