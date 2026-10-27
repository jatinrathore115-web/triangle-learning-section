/* Screen scripts — the 37-step learning story.
   Every screen continues the SAME triangle wherever the maths allows. */
(function () {
  const TL = window.TL;
  const { Geo, Anim, Sfx, UI, C, h } = TL;
  const { v, lerpP } = Geo;

  /* ---------- layouts ---------- */
  const CEN = v(800, 465);    // centre stage
  const QUIZ = v(560, 480);   // triangle left, options right
  const DUAL = v(600, 465);   // triangle left, two badges right
  const BOUNDS = { x0: 170, x1: 1430, y0: 225, y1: 715 };
  const BADGE_X = 1150, BADGE_Y1 = 420, BADGE_Y2 = 510;

  /* ---------- canonical shapes (cm, y-up) ---------- */
  const SH = (TL.SHAPES = {
    s546: Geo.fromSSS(5, 4, 6),               // AB 5, CA 4, BC 6 — scalene, acute
    iso556: Geo.fromSSS(5, 5, 6),             // isosceles
    equi5: Geo.fromSSS(5, 5, 5),              // equilateral, 60/60/60
    a656253: Geo.fromAngles(62, 53, 6),       // A 65°, B 62°, C 53°
    right: [v(0, 4.2), v(0, 0), v(6, 0)],     // A 55°, B 90°, C 35°
    obtuse: Geo.fromAngles(40, 30, 7.5),      // A 110°, B 40°, C 30° — sides 4 / 5.1 / 7.5
    a706050: Geo.fromAngles(60, 50, 6),       // A 70°, B 60°, C 50°
    rightIso: [v(0, 5), v(0, 0), v(5, 0)],    // 5 / 5 / 7.1 with 90° at B
  });
  const P = (name, at = CEN, k) => Geo.toPx(SH[name], at, k);

  /* ---------- helpers ---------- */
  const mask = (list) => [0, 1, 2].map((i) => (list.includes(i) ? 1 : 0));
  const dimExcept = (j, d) => [0, 1, 2].map((i) => (i === j ? 1 : d));
  const colsFor = (list, col) => [0, 1, 2].map((i) => (list.includes(i) ? col : C.outline));
  const winding = (V) => Math.sign(Geo.cross(Geo.sub(V[1], V[0]), Geo.sub(V[2], V[0])));
  const midOf = (V, i) => lerpP(V[i], V[(i + 1) % 3], 0.5);
  /* right-most x of the triangle outline on the horizontal line y */
  function edgeX(V, y) {
    let x = -Infinity;
    for (let i = 0; i < 3; i++) {
      const A = V[i], B = V[(i + 1) % 3];
      if ((y - A.y) * (y - B.y) <= 0 && A.y !== B.y) x = Math.max(x, A.x + ((y - A.y) / (B.y - A.y)) * (B.x - A.x));
    }
    return x === -Infinity ? Geo.bbox(V).x1 : x;
  }
  const sharedVertex = (a, b) => [a, (a + 1) % 3].find((x) => [b, (b + 1) % 3].includes(x));

  /* ---------- multi-shape layout ----------
     Fits several shapes into one region without overlap. One common scale keeps
     them comparable; 'row' spreads them evenly on a shared baseline, 'pyramid'
     puts the first shape on top and the rest on a row below. Returns px vertices
     and the slot each shape owns, so screens never hard-code positions. */
  const STAGE = { x: 170, y: 185, w: 1260, h: 570 };   // inside the glass, under the narration card
  function arrange(shapes, region = STAGE, { pattern = 'row', gap = 64, maxGap = 150, maxK = Geo.PX_PER_CM, fit = 'shared' } = {}) {
    const box = shapes.map((V) => Geo.bbox(V.map((p) => v(p.x, -p.y))));
    const idx = shapes.map((_, i) => i);
    const rows = pattern === 'pyramid' ? [[0], idx.slice(1)] : [idx];
    if (fit === 'slot') return arrangeSlots(shapes, box, rows, region, gap, maxK);
    const rowW = (r) => r.reduce((s, i) => s + box[i].w, 0);
    const rowH = (r) => Math.max(...r.map((i) => box[i].h));
    const k = Math.min(
      maxK,
      ...rows.map((r) => (region.w - gap * (r.length - 1)) / rowW(r)),
      (region.h - gap * (rows.length - 1)) / rows.reduce((s, r) => s + rowH(r), 0)
    );
    const totalH = rows.reduce((s, r) => s + rowH(r) * k, 0) + gap * (rows.length - 1);
    let y = region.y + (region.h - totalH) / 2;
    const V = [], slots = [];
    for (const r of rows) {
      const H = rowH(r) * k;
      const g = r.length > 1 ? Math.min(maxGap, Math.max(gap, (region.w - rowW(r) * k) / (r.length + 1))) : 0;
      let x = region.x + (region.w - (rowW(r) * k + g * (r.length - 1))) / 2;
      for (const i of r) {
        const w = box[i].w * k, hgt = box[i].h * k;
        V[i] = Geo.toPx(shapes[i], v(x + w / 2, y + H - hgt / 2), k);   // bottoms share the row's baseline
        slots[i] = { x: x + w / 2, y: y + H - hgt / 2, w, h: hgt };
        x += w + g;
      }
      y += H + gap;
    }
    return { V, slots, k };
  }
  /* 'slot' fit: shapes compared by look, not by measured size. Every shape gets the
     same area (equal visual weight); one common factor is solved so the rows fill the
     region's height exactly. Rows get equal-width slots with even gutters and the
     whole group is centred, so the spacing reads as deliberate. */
  function arrangeSlots(shapes, box, rows, region, gap, maxK) {
    const areaCm = (V) => Math.abs(Geo.cross(Geo.sub(V[1], V[0]), Geo.sub(V[2], V[0]))) / 2;
    const unit = shapes.map((V, i) => 1 / Math.sqrt(areaCm(V)));        // k = s · unit  →  area = s²
    const slotUnit = Math.max(...shapes.map((_, i) => box[i].w * unit[i]));
    const n = Math.max(...rows.map((r) => r.length));
    let sc = Math.min(
      (region.h - gap * (rows.length - 1)) / rows.reduce((acc, r) => acc + Math.max(...r.map((i) => box[i].h * unit[i])), 0),
      (region.w - gap * (n - 1)) / (n * slotUnit),
      ...shapes.map((_, i) => maxK / unit[i])
    );
    const slotW = slotUnit * sc;
    const totalH = rows.reduce((acc, r) => acc + Math.max(...r.map((i) => box[i].h * unit[i] * sc)), 0) + gap * (rows.length - 1);
    let y = region.y + (region.h - totalH) / 2;
    const V = [], slots = [], ks = [];
    for (const r of rows) {
      const H = Math.max(...r.map((i) => box[i].h * unit[i] * sc));
      const left = region.x + (region.w - (r.length * slotW + (r.length - 1) * gap)) / 2;
      r.forEach((i, ci) => {
        const k = unit[i] * sc, hgt = box[i].h * k;
        const cx = left + ci * (slotW + gap) + slotW / 2, cy = y + H - hgt / 2; // shared baseline per row
        V[i] = Geo.toPx(shapes[i], v(cx, cy), k);
        slots[i] = { x: cx, y: cy, w: box[i].w * k, h: hgt, k };
        ks[i] = k;
      });
      y += H + gap;
    }
    return { V, slots, ks, k: Math.min(...ks) };
  }
  const moveTo = (V, c) => Geo.recenter(V, c);

  /* canonical shape, rotated/mirrored to sit closest to the learner's triangle */
  function fitTo(target, cur, at = CEN) {
    let T = target;
    if (winding(T) !== winding(cur)) { const c = Geo.centroid(T); T = T.map((p) => v(2 * c.x - p.x, p.y)); }
    return Geo.recenter(Geo.fitRotation(T, cur), at);
  }

  function quiz(ctx, items, correct, o = {}) {
    const { btns } = UI.optionList(ctx.layer, items, { x: o.x || 960, y: o.y || 330, w: o.w || 420, delay: o.delay || 0 });
    // read the choices aloud once they are on screen; any answer stops the reading
    let answered = false;
    setTimeout(() => ctx.narr.readChoices(btns.map((b, i) => [b, items[i]]), () => answered), (o.delay || 0) + items.length * 150 * Anim.speed + 250);
    return new Promise((resolve) => {
      let locked = false;
      btns.forEach((b, i) => b.addEventListener('click', () => {
        if (locked) return;
        if (!answered) { answered = true; TL.VO.stop(); }
        Sfx.select();
        if (i === correct) {
          locked = true;
          // a correct answer clears any "try again" hint immediately
          if (ctx.narr.el.classList.contains('warn')) ctx.narr.hide();
          btns.forEach((x, j) => { x.disabled = true; if (j !== i) x.classList.add('muted'); });
          b.classList.add('right');
          resolve(i);
        } else {
          locked = true;
          b.classList.add('wrong', 'shake');
          TL.Feedback.wrong();
          if (o.onWrong) o.onWrong(i);
          setTimeout(() => { b.classList.remove('wrong', 'shake'); locked = false; }, 1100);
        }
      }));
    }).then((r) => { ctx.alive(); return r; });
  }

  /* enable vertex dragging until check(V) === true on release */
  function dragUntil(ctx, cfg) {
    const { tri } = ctx;
    return new Promise((resolve) => {
      let fails = 0;
      tri.enableDrag({
        bounds: BOUNDS,
        snap: Geo.makeSnapper(cfg.modes || {}),
        affordance: cfg.affordance || [0],
        onStart: () => { ctx.narr.dim(true); if (cfg.onStart) cfg.onStart(); },
        onMove: (V, kind) => { if (cfg.onMove) cfg.onMove(V, kind); },
        onEnd: (V) => {
          const r = cfg.check(V);
          if (r === true) { tri.disableDrag(); resolve(); }
          else { fails++; if (cfg.onFail) cfg.onFail(r, fails); }
        },
      });
    }).then(() => ctx.alive());
  }

  function evidenceSides(tri) { [0, 2, 1].forEach((i, n) => setTimeout(() => tri.pulse('sideLabel', { i, dur: 520 }), n * 160)); tri.pulse('shake', { dur: 420 }); }
  function evidenceAngles(tri) { [0, 1, 2].forEach((i, n) => setTimeout(() => tri.pulse('angle', { i, dur: 560 }), n * 160)); tri.pulse('shake', { dur: 420 }); }

  const S = [];
  const add = (name, chip, kind, enter) => S.push({ name, chip, kind, enter });

  /* =====================================================================
     RECALL
     ===================================================================== */

  // 01 — LET'S EXPLORE TRIANGLES
  add('Let’s explore triangles', 'Recall', 'recall', async (ctx) => {
    const { tri } = ctx;
    tri.reset();
    tri.set({ op: 0 }, { instant: true });
    const title = h('div', 'title', ctx.layer, '<h1></h1><p></p>');
    await ctx.wait(120);
    title.classList.add('in');
    // the title is read aloud word by word before anything else moves
    await ctx.voiceInto(title.querySelector('h1'), 'Let’s explore triangles');
    await ctx.voiceInto(title.querySelector('p'), 'Before we return to the tunnel, learn how to recognise them.');
    await ctx.wait(250);

    // every triangle is born in the centre, then glides to its place;
    // all three rest on one shared baseline so the row reads as a set
    ctx.narrAt = v(800, 232); // just under the title, above the row of shapes
    // final row: tall | hero | right-angled, laid out by the shared engine (no overlaps, even gaps)
    const TALL = [v(1.6, 4.4), v(0, 0), v(3.2, 0)], RT = [v(0, 3.3), v(0, 0), v(4.4, 0)];
    const row = arrange([TALL, SH.s546, RT], { x: 170, y: 330, w: 1260, h: 345 }, { maxK: 70 });
    const bornAt = (i) => moveTo(row.V[i], v(800, row.slots[i].y));   // every triangle is born in the centre…
    const glide = (view, i) => { Sfx.whoosh(); return view.morphTo(row.V[i], 950, TL.Ease.inOutCubic); }; // …then glides to its slot
    document.getElementById('platform').style.opacity = 1;

    // 1 — right-angled triangle: centre → right
    const rt = ctx.view(bornAt(2));
    await ctx.step(rt.drawIn({ vertexGap: 130, sideDur: 320 }));
    await ctx.wait(200);
    await ctx.step(glide(rt, 2));

    // 2 — tall triangle: centre → left
    const tall = ctx.view(bornAt(0));
    await ctx.step(tall.drawIn({ vertexGap: 130, sideDur: 320 }));
    await ctx.wait(200);
    await ctx.step(glide(tall, 0));

    // 3 — the hero triangle stays in the centre (it continues into the lesson)
    tri.setShape(row.V[1]);
    await ctx.step(tri.drawIn());
    await ctx.wait(300);

    await ctx.say(['Triangles can look', '[tri|different].'], { hold: 700 });
    await ctx.say(['Let’s explore what makes them', '[tri|triangles].'], { noHold: true });
    ctx.narrAt = null;
    await ctx.continue('Begin learning', { y: 742, delay: 500 });

    // continuity: push into the centre triangle; the others blur away
    ctx.narr.hide();
    title.classList.remove('in');
    Sfx.whoosh();
    ctx.reveal();
    for (const o of [tall, rt]) {
      o.g.style.transition = 'filter .6s'; o.g.style.filter = 'blur(6px)';
      o.set({ op: 0 });
    }
    await ctx.morph(P('s546'), 1000);
  });

  // 02 — THIS IS A TRIANGLE
  add('This is a triangle', 'Recall', 'recall', async (ctx) => {
    const { tri } = ctx;
    tri.reset();
    await ctx.ensure(P('s546'));
    await ctx.say(['This is a', '[tri|triangle].'], {
      gap: 450,
      onPhrase: (i) => {
        if (i !== 1) return;
        tri.pulse('glow', { dur: 900 });
        [0, 1, 2].forEach((j) => tri.pulse('vertexFlash', { i: j, dur: 700 }));
        Sfx.chime();
      },
    });
    await ctx.continue();
  });

  // 03 — 3 STRAIGHT SIDES
  add('Three straight sides', 'Recall', 'recall', async (ctx) => {
    const { tri } = ctx;
    tri.reset();
    await ctx.ensure(P('s546'));
    tri.numOrder = [1, 3, 2]; // left = 1, right = 2, base = 3
    await ctx.say(['A triangle is a', '[tri|closed shape]'], {
      noHold: true, gap: 380,
      onPhrase: (i) => { if (i === 1) { Sfx.trace(1.1); tri.comet(tri.perimeter(0), { dur: 1150, tail: 0.35 }); } },
    });
    await ctx.wait(1300);
    for (const i of [0, 2, 1]) {
      tri.setAt('sideCol', i, C.side[i]).setAt('num', i, 1).setAt('sHi', i, 0.6);
      tri.pulse('side', { i, dur: 650 });
      Sfx.chime();
      await ctx.wait(620);
    }
    const [x, y] = ctx.below(tri.V, 86);
    ctx.floatLabel('3 straight sides', x, y);
    await ctx.append('with [side|three straight sides].', { hold: 900 });
    await ctx.continue();
  });

  // 04 — TRIANGLES CAN BE DIFFERENT
  add('Triangles can be different', 'Recall', 'recall', async (ctx) => {
    const { tri } = ctx;
    tri.reset();
    await ctx.ensure(P('s546'));
    // pyramid: our triangle on top, two different triangles below — sized together so nothing overlaps
    const TALL = [v(1.8, 4.4), v(0, 0), v(3.7, 0)], WIDE = [v(-1, 2.2), v(0, 0), v(5, 0)];
    const lay = arrange([SH.s546, TALL, WIDE], { x: 170, y: 200, w: 1260, h: 540 }, { pattern: 'pyramid', gap: 60, fit: 'slot' });
    await ctx.morph(lay.V[0], 750);   // the main triangle rises and settles in the top slot
    // copies of it slide down into the lower slots…
    const ghost = (i) => {
      const g = ctx.view(tri.V);
      g.set({ fill: 0, shadow: 0, op: 0.5, vtx: 0.4 }, { instant: true });
      g.morphTo(Geo.toPx(SH.s546, v(lay.slots[i].x, lay.slots[i].y), lay.ks[0]), 850);
      return g;
    };
    Sfx.whoosh();
    const L = ghost(1), R = ghost(2);
    await ctx.wait(750);
    for (const g of [L, R]) g.set({ fill: 1, shadow: 1, op: 1, vtx: 1 });
    await ctx.wait(450);
    // …then their corners move to make new shapes
    L.morphTo(lay.V[1], 850);
    await ctx.step(R.morphTo(lay.V[2], 850));
    await ctx.say(['Triangles can have', '[tri|different shapes].']);
    await ctx.say(['Let’s explore', 'their [side|sides].'], { noHold: true });
    await ctx.continue();
  });

  /* =====================================================================
     SIDES
     ===================================================================== */

  // 05 — MEASURE THE SIDES
  add('Measure the sides', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ scale: 1 });
    ctx.chip('Measure mode');
    await ctx.ensure(P('s546'));
    await ctx.say(['Let’s measure', 'the [side|sides] of this triangle.'], { hold: 350 });
    for (const i of [0, 2, 1]) {
      Sfx.trace(0.55);
      await ctx.step(tri.comet(tri.sidePath(i), { dur: 620, color: '#FFFFFF', width: 7, tail: 0.5 }));
      tri.setAt('sl', i, 1);
      tri.pulse('sideLabel', { i, dur: 420 });
      Sfx.chime();
      await ctx.wait(260);
    }
    tri.pulse('scale', { amp: 0.015, dur: 600 });
    tri.pulse('glow', { dur: 700, amp: 0.6 });
    await ctx.continue('Continue', { delay: 500 });
  });

  // 06 — WHAT DO YOU NOTICE?
  add('What do you notice?', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    await ctx.ensure(P('s546', QUIZ));
    await ctx.say(['What do you notice', 'about the [side|sides]?'], { noHold: true });
    for (const i of [0, 2, 1]) { tri.pulse('sideLabel', { i, dur: 520 }); tri.setAt('slHi', i, 0.5); await ctx.wait(330); }
    tri.set({ slHi: 0 });
    await quiz(ctx, ['All three are different', 'Two sides are equal', 'All three are equal'], 0, {
      onWrong: () => { ctx.sayFree(['Look at the', '[side|side lengths] again.'], { tone: 'warn' }); evidenceSides(tri); },
    });
    TL.Feedback.correct();
    for (const i of [0, 2, 1]) {
      tri.pulse('sideLabel', { i, dur: 450 });
      tri.setAt('lblCol', i, C.side[i]).setAt('slHi', i, 1);
      await ctx.wait(220);
    }
    for (const i of [0, 2, 1]) { tri.setAt('sideCol', i, C.side[i]); await ctx.wait(150); }
    await ctx.say(['Yes! [side|5 cm, 4 cm and 6 cm]', 'are all different.'], { tone: 'good' });
  });

  // 07 — SCALENE
  add('Scalene', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, sideCol: C.side.slice(), lblCol: C.side.slice(), slHi: 0.6 });
    await ctx.ensure(P('s546'));
    await ctx.say(['All three sides', 'are [side|different].']);
    await ctx.say(['A triangle with all three sides different is called a', '[sc|scalene] triangle.'], { noHold: true });
    ctx.reveal();
    ctx.badge('scalene', ...ctx.below());
    await ctx.wait(1300);
    await ctx.continue();
  });

  // 08 — MAKE TWO SIDES EQUAL
  add('Make two sides equal', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    await ctx.ensure(P('s546'));
    ctx.chip('Drag vertex');
    await ctx.say(['What if', '[eq|two sides] were equal?']);
    tri.assist.equal = true;
    const done = dragUntil(ctx, {
      modes: { iso: true, equi: true },
      check: (V) => { const t = Geo.classifySides(V).type; return t === 'isosceles' ? true : t; },
      onFail: (r, n) => {
        if (r === 'equilateral') ctx.sayFree(['All three are equal now.', 'Make just [eq|two] equal.'], { tone: 'warn' });
        else if (n >= 3) ctx.hint('Tip: make the two slanted sides show the same number.', true);
      },
    });
    await ctx.say(['Drag a vertex', 'to make [eq|two sides equal].'], { noHold: true });
    ctx.hint('Watch the numbers change as you drag.');
    await done;
    TL.Feedback.correct();
    await ctx.wait(450);
  });

  // 09 — ISOSCELES
  add('Isosceles', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    if (Geo.classifySides(tri.V).type !== 'isosceles' || tri.t.op < 0.5) {
      if (tri.t.op < 0.5) await ctx.ensure(P('iso556'));
      else await ctx.morph(fitTo(P('iso556'), tri.V, Geo.centroid(tri.V)));
    }
    const eq = Geo.classifySides(tri.V).equalSides;
    tri.set({ tick: mask(eq), lblCol: C.equal, slHi: mask(eq), sideCol: colsFor(eq, C.equal), sHi: mask(eq).map((x) => x * 0.7) });
    await ctx.say(['[eq|Two sides]', 'are equal.'], { noHold: true });
    const [a, b] = eq, sv = sharedVertex(a, b);
    Sfx.trace(0.9);
    await ctx.step(tri.comet(() => [midOf(tri.Vd, a), tri.Vd[sv], midOf(tri.Vd, b)], { dur: 950, color: '#B9F3FA', tail: 0.4 }));
    [a, b].forEach((i) => tri.pulse('sideLabel', { i, dur: 500 }));
    await ctx.wait(500);
    await ctx.say(['A triangle with two equal sides is called an', '[eq|isosceles] triangle.'], { noHold: true });
    ctx.reveal();
    ctx.badge('isosceles', ...ctx.below());
    await ctx.wait(1300);
    await ctx.continue();
  });

  // 10 — MAKE ALL THREE SIDES EQUAL
  add('Make all three equal', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    if (tri.t.op < 0.5 || Geo.classifySides(tri.V).type === 'scalene') await ctx.ensure(fitTo(P('iso556'), tri.V));
    // an equilateral apex sits ~0.87 × base above the base — glide the shape down
    // (lengths unchanged) so that target is comfortably reachable on stage
    { const b = Geo.bbox(tri.V), dy = BOUNDS.y1 - 30 - b.y1; if (dy > 4) await ctx.morph(tri.V.map((p) => v(p.x, p.y + dy)), 700); }
    ctx.chip('Drag vertex');
    tri.assist.equal = true;
    let celebrated = false;
    const done = dragUntil(ctx, {
      modes: { iso: true, equi: true },
      onMove: (V, kind) => {
        if (kind === 'equi' && !celebrated) {
          celebrated = true;
          [0, 1, 2].forEach((i) => tri.pulse('sideLabel', { i, dur: 520 }));
          tri.comet(tri.perimeter(0), { dur: 900, color: '#B9F3FA', tail: 0.3 });
        } else if (kind !== 'equi') celebrated = false;
      },
      check: (V) => Geo.classifySides(V).type === 'equilateral' || 'no',
      onFail: (r, n) => { if (n >= 3) ctx.hint('Tip: the base is the third side — make the other two match it.', true); },
    });
    await ctx.say(['Can you make', '[eq|all three sides] equal?'], { noHold: true });
    ctx.hint('Drag a vertex until the three lengths match.');
    await done;
    TL.Feedback.correct();
    await ctx.wait(450);
  });

  // 11 — EQUILATERAL
  add('Equilateral', 'Sides', 'sides', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    if (tri.t.op < 0.5) await ctx.ensure(P('equi5'));
    else if (Geo.classifySides(tri.V).type !== 'equilateral') await ctx.morph(fitTo(P('equi5'), tri.V, Geo.centroid(tri.V)));
    tri.set({ tick: 1, slHi: 1, lblCol: C.equal });
    await ctx.say(['[eq|All three sides]', 'are equal.'], { noHold: true });
    for (const i of [0, 2, 1]) {
      tri.setAt('sideCol', i, C.equal).setAt('sHi', i, 0.5);
      tri.pulse('side', { i, dur: 600 }); tri.pulse('sideLabel', { i, dur: 500 });
      Sfx.chime();
      await ctx.wait(380);
    }
    tri.pulse('glow', { dur: 800 }); tri.pulse('scale', { amp: 0.02, dur: 700 });
    await ctx.wait(700);
    await ctx.say(['A triangle with all three sides equal is called an', '[eq|equilateral] triangle.'], { noHold: true });
    ctx.reveal();
    ctx.badge('equilateral', ...ctx.below());
    await ctx.wait(1300);
    await ctx.continue();
  });

  /* ---------- sides checkpoints ---------- */

  // 12 — CHECKPOINT: MAKE ISOSCELES
  add('Checkpoint: make isosceles', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    await ctx.ensure(P('s546'));
    ctx.chip('Drag vertex');
    await ctx.say(['Challenge time.'], { hold: 500 });
    await ctx.say(['Make this triangle', '[eq|isosceles].'], { noHold: true });
    tri.enableDrag({ bounds: BOUNDS, snap: Geo.makeSnapper({ iso: true, equi: true }), affordance: [0], onStart: () => ctx.narr.dim(true) });
    const btn = ctx.button('Check');
    let fails = 0;
    for (;;) {
      await ctx.click(btn);
      const t = Geo.classifySides(tri.V).type;
      if (t === 'isosceles') break;
      fails++;
      TL.Feedback.wrong();
      evidenceSides(tri);
      if (t === 'equilateral') ctx.sayFree(['All three sides are equal —', 'make exactly [eq|two] equal.'], { tone: 'warn' });
      else ctx.sayFree(['Look at the', '[side|side lengths] again.'], { tone: 'warn' });
      if (fails >= 1) ctx.hint('Hint: drag the top vertex until two sides show the same length.', true);
    }
    btn.disabled = true;
    tri.disableDrag();
    TL.Feedback.correct();
  });

  // 13 — CHECKPOINT SUCCESS
  add('Checkpoint success', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1 });
    if (tri.t.op < 0.5 || Geo.classifySides(tri.V).type !== 'isosceles') await ctx.ensure(P('iso556'));
    const eq = Geo.classifySides(tri.V).equalSides;
    tri.set({ tick: mask(eq), lblCol: C.equal, slHi: mask(eq), sideCol: colsFor(eq, C.equal), sHi: mask(eq).map((x) => x * 0.7) });
    eq.forEach((i) => { tri.pulse('side', { i, dur: 700 }); tri.pulse('sideLabel', { i, dur: 520 }); });
    const b = Geo.bbox(tri.V);
    ctx.wave(b.cx, b.cy, C.correct, 1000);
    ctx.sparkle(b.cx, b.y0 + 10, 5, 110);
    await ctx.say(['Great! This triangle is', '[eq|isosceles].'], { tone: 'good', noHold: true });
    ctx.badge('isosceles', ...ctx.below());
    await ctx.wait(1100);
    await ctx.continue();
  });

  /* sorting cards / zones (shared by 14 and 15) */
  const SORT = [
    { key: 'equilateral', tag: 'C', V: Geo.fromSSS(6, 6, 6), x: 490 },
    { key: 'scalene', tag: 'A', V: Geo.fromSSS(5, 4, 6), x: 800 },
    { key: 'isosceles', tag: 'B', V: Geo.fromSSS(5, 5, 7), x: 1110 },
  ];
  const ZONES = [
    { key: 'scalene', name: 'SCALENE', col: C.side[0], x: 440 },
    { key: 'isosceles', name: 'ISOSCELES', col: '#0B8FA0', x: 800 },
    { key: 'equilateral', name: 'EQUILATERAL', col: '#2A8CF0', x: 1160 },
  ];
  const CARD_Y = 322, ZONE_Y = 614;

  function sortCard(layer, d) {
    const card = h('div', 'card', layer);
    const txt = Geo.displayLengths(d.V, 1).text;
    card.appendChild(UI.miniTriangle(d.V, { w: 262, h: 200, pad: 40, sideText: txt, fs: 18 }));
    card.style.left = d.x + 'px'; card.style.top = CARD_Y + 'px';
    card.dataset.key = d.key;
    card.meas = [0, 2, 1].map((i) => txt[i].replace(' cm', '')).join(' / ') + ' cm';
    return card;
  }
  function zoneEl(layer, z) {
    const el = h('div', 'zone', layer, `<span class="z-name">${z.name}</span><span class="z-drop">DROP TRIANGLE HERE</span>`);
    el.style.left = z.x + 'px'; el.style.top = ZONE_Y + 'px';
    el.style.setProperty('--zc', z.col);
    return el;
  }
  function seat(card, z, y = ZONE_Y) {
    card.style.transition = 'left .5s cubic-bezier(.22,1,.36,1), top .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1,.36,1), opacity .4s';
    card.style.left = z.x + 'px'; card.style.top = (y + 18) + 'px';
    card.style.setProperty('--dx', '0px'); card.style.setProperty('--dy', '0px'); card.style.setProperty('--s', 0.66);
  }

  // 14 — SORT TRIANGLES
  add('Sort the triangles', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset(); tri.set({ op: 0 });
    const zones = ZONES.map((z) => ({ ...z, el: zoneEl(ctx.layer, z) }));
    const cards = SORT.map((d) => sortCard(ctx.layer, d));
    cards.forEach((c, i) => { c.classList.add('enter'); setTimeout(() => { c.classList.add('in'); c.classList.remove('enter'); }, 120 + i * 100); });
    zones.forEach((z, i) => setTimeout(() => z.el.classList.add('in'), 380 + i * 90));
    await ctx.say(['Sort the triangles', 'by their [side|sides].'], { noHold: true });
    ctx.hint('Drag a triangle into its group — or tap a triangle, then tap a group.');

    const inside = (z, p) => Math.abs(p.x - z.x) < 175 && Math.abs(p.y - ZONE_Y) < 125;
    let placed = 0, picked = null;
    const pick = (card) => {
      if (picked) picked.classList.remove('sel');
      picked = card && card !== picked ? card : null;
      if (picked) { picked.classList.add('sel'); Sfx.select(); }
      zones.forEach((z) => z.el.classList.toggle('ready', !!picked && !z.filled));
    };
    await new Promise((resolve) => {
      // one drop rule for drag, tap-then-tap and keyboard
      const drop = (card, z) => {
        card.classList.remove('sel');
        if (picked === card) pick(null);
        if (z && !z.filled && z.key === card.dataset.key) {
          card.done = true; z.filled = card;
          card.classList.remove('drag');
          card.tabIndex = -1;
          seat(card, z);
          z.el.classList.add('filled');
          z.el.tabIndex = -1;
          TL.Feedback.correct({ confetti: 45 }); // lighter burst: three of these happen in a row
          ctx.sparkle(z.x, ZONE_Y - 40, 4, 70);
          if (++placed === 3) resolve();
          return;
        }
        card.classList.add('back');
        card.style.setProperty('--dx', '0px'); card.style.setProperty('--dy', '0px');
        if (z) {
          TL.Feedback.wrong();
          ctx.sayFree(['Look at the', '[side|side lengths] again.'], { tone: 'warn' });
          card.querySelectorAll('.mini-lbl').forEach((l) => { l.classList.remove('evid'); void l.getBBox(); l.classList.add('evid'); setTimeout(() => l.classList.remove('evid'), 2500); });
        }
      };
      zones.forEach((z) => {
        z.el.tabIndex = 0;
        z.el.setAttribute('role', 'button');
        z.el.setAttribute('aria-label', `Put the chosen triangle in ${z.name}`);
        const go = () => { if (picked && !z.filled) drop(picked, z); };
        z.el.addEventListener('click', go);
        z.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } });
      });
      cards.forEach((card) => {
        card.classList.add('drag');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Triangle with sides ${card.meas}`);
        card.addEventListener('keydown', (e) => { if (!card.done && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); pick(card); } });
        const home = { x: parseFloat(card.style.left), y: CARD_Y };
        card.addEventListener('pointerdown', (e) => {
          if (card.done) return;
          e.preventDefault();
          Sfx.unlock();
          card.setPointerCapture(e.pointerId);
          card.classList.remove('back'); card.classList.add('lift');
          const start = { x: e.clientX, y: e.clientY };
          let pos = home, moved = false;
          const move = (ev) => {
            const dx = (ev.clientX - start.x) / TL.App.scale, dy = (ev.clientY - start.y) / TL.App.scale;
            if (Math.hypot(dx, dy) > 8) moved = true;
            card.style.setProperty('--dx', dx + 'px'); card.style.setProperty('--dy', dy + 'px');
            pos = { x: home.x + dx, y: home.y + dy };
            zones.forEach((z) => z.el.classList.toggle('hot', !z.filled && inside(z, pos)));
          };
          const up = () => {
            card.removeEventListener('pointermove', move);
            card.removeEventListener('pointerup', up);
            card.removeEventListener('pointercancel', up);
            card.classList.remove('lift');
            zones.forEach((z) => z.el.classList.remove('hot'));
            if (!moved) { // a tap: choose this card, then tap a group
              card.style.setProperty('--dx', '0px'); card.style.setProperty('--dy', '0px');
              pick(card);
              return;
            }
            drop(card, zones.find((zz) => !zz.filled && inside(zz, pos)));
          };
          card.addEventListener('pointermove', move);
          card.addEventListener('pointerup', up);
          card.addEventListener('pointercancel', up);
        });
      });
    });
    ctx.alive();
    ctx.carry({ zones, cards }, [...zones.map((z) => z.el), ...cards]);
  });

  // 15 — SORT SUCCESS
  add('Sort success', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.set({ op: 0 });
    let zones, cards;
    if (ctx.carried) ({ zones, cards } = ctx.carried);
    else {
      zones = ZONES.map((z) => ({ ...z, el: zoneEl(ctx.layer, z) }));
      cards = SORT.map((d) => sortCard(ctx.layer, d));
      zones.forEach((z) => {
        z.el.classList.add('in', 'filled');
        const c = cards.find((cc) => cc.dataset.key === z.key);
        c.classList.add('in'); seat(c, z); z.filled = c;
      });
    }
    await ctx.wait(250);
    // align into a clean centred row
    const Y = 470;
    zones.forEach((z) => { z.el.style.top = Y + 'px'; seat(z.filled, z, Y); });
    await ctx.wait(650);
    for (const z of zones) {
      z.el.classList.add('glow');
      Sfx.chime();
      await ctx.wait(380);
    }
    await ctx.say(['Great job!', 'You sorted all the triangles.'], { tone: 'good', noHold: true });
    await ctx.continue('Continue', { delay: 900 });
  });

  /* =====================================================================
     ANGLES
     ===================================================================== */

  // 16 — INTRODUCE ANGLES
  add('Measure the angles', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    const eqV = P('equi5');
    if (tri.t.op < 0.5) {
      tri.setShape(eqV);
      tri.reset({ sl: 1 }, { instant: true });
      tri.set({ op: 1 });
      await ctx.wait(600);
    } else {
      tri.reset({ sl: 1 });
      await ctx.ensure(eqV);
    }
    ctx.chip('Angle measure');
    await ctx.wait(300);
    tri.set({ sl: 0 });
    await ctx.say(['Now let’s measure', 'the [ang|angles].'], { hold: 350 });
    tri.set({ ag: 0, ang: 1 }, { instant: true });
    for (const i of [0, 1, 2]) {
      tri.setAt('ag', i, 1);
      Sfx.trace(0.35);
      await ctx.wait(380);
      tri.setAt('al', i, 1);
      tri.pulse('angle', { i, dur: 450 });
      Sfx.chime();
      await ctx.wait(380);
    }
    await ctx.continue('Continue', { delay: 400 });
  });

  // 17 — WHAT DO YOU NOTICE ABOUT THE ANGLES?
  add('What about the angles?', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    await ctx.ensure(P('equi5', QUIZ));
    await ctx.say(['What do you notice', 'about the [ang|angles]?'], { noHold: true });
    for (const i of [0, 1, 2]) { tri.pulse('angle', { i, dur: 520 }); tri.setAt('aHi', i, 0.5); await ctx.wait(330); }
    tri.set({ aHi: 0 });
    await quiz(ctx, ['All are acute angles', 'One angle is a right angle', 'One angle is obtuse'], 0, {
      onWrong: () => { ctx.sayFree(['Check the', '[ang|angles] once more.'], { tone: 'warn' }); evidenceAngles(tri); },
    });
    TL.Feedback.correct();
    [0, 1, 2].forEach((i) => tri.pulse('angle', { i, dur: 700 }));
    tri.set({ aHi: 1 });
    await ctx.say(['Yes! All three are', '[ang|acute angles].'], { tone: 'good' });
  });

  // 18 — ALL ARE LESS THAN 90°
  add('All less than 90°', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    await ctx.ensure(P('equi5'));
    await ctx.say(['All three angles are', '[ang|less than 90°].'], { noHold: true, lift: 84 });
    for (const i of [0, 1, 2]) {
      tri.setAt('ref', i, 1).setAt('aHi', i, 0.6);
      Sfx.chime();
      await ctx.wait(750);
    }
    await ctx.wait(800);
    tri.set({ ref: 0, aHi: 0 });
    await ctx.wait(350);
    await ctx.say(['So they are', '[ang|acute angles].'], { noHold: true });
    tri.set({ aHi: 1 });
    [0, 1, 2].forEach((i) => tri.pulse('angle', { i, dur: 700 }));
    await ctx.wait(1000);
    await ctx.continue();
  });

  // 19 — ACUTE-ANGLED TRIANGLE
  add('Acute-angled', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1, aHi: 0.6 });
    await ctx.ensure(P('equi5'));
    await ctx.say(['A triangle with three acute angles', 'is called an [ang|acute-angled triangle].'], { noHold: true });
    ctx.reveal();
    ctx.badge('acute', ...ctx.below());
    await ctx.wait(1400);
    await ctx.continue();
  });

  // 20 — MAKE ONE ANGLE 90°
  add('Make one angle 90°', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    await ctx.ensure(P('a656253'));
    ctx.chip('Drag vertex');
    tri.assist.right = true;
    const done = dragUntil(ctx, {
      modes: { right: true },
      check: (V) => Geo.classifyAngles(V).type === 'right' || 'no',
      onFail: (r, n) => { if (n >= 3) ctx.hint('Tip: find an angle in the 80s and keep opening it.', true); },
    });
    await ctx.say(['Can you make one angle', 'exactly [rt|90°]?'], { noHold: true });
    ctx.hint('Drag a vertex — the angles change live.');
    await done;
    TL.Feedback.correct();
    await ctx.wait(400);
  });

  // 21 — RIGHT-ANGLED
  add('Right-angled', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    if (tri.t.op < 0.5) await ctx.ensure(P('right'));
    else if (Geo.classifyAngles(tri.V).type !== 'right') await ctx.morph(fitTo(P('right'), tri.V, Geo.centroid(tri.V)));
    const j = Geo.classifyAngles(tri.V).index;
    await ctx.say(['One angle is exactly', '[rt|90°].'], { noHold: true });
    tri.set({ ang: dimExcept(j, 0.45), al: dimExcept(j, 0.5), aHi: mask([j]) });
    tri.pulse('angle', { i: j, dur: 700 });
    tri.pulse('ring', { i: j, color: C.right, dur: 900 });
    await ctx.wait(1200);
    await ctx.say(['A triangle with one angle of exactly 90° is called a', '[rt|right-angled] triangle.'], { noHold: true });
    ctx.reveal();
    ctx.badge('right', ...ctx.below());
    await ctx.wait(1300);
    await ctx.continue();
  });

  // 22 — WHAT IF ONE ANGLE WERE GREATER THAN 90°?
  add('Greater than 90°?', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    if (tri.t.op < 0.5 || Geo.classifyAngles(tri.V).type !== 'right') await ctx.ensure(P('right'));
    tri.assist.obtuse = true;
    tri.enableDrag({ bounds: BOUNDS, affordance: [0], onStart: () => ctx.narr.dim(true) });
    await ctx.say(['What if one angle were', '[ob|greater than 90°]?'], { hold: 1100 });
    return { seamless: true };
  });

  // 23 — DRAG TO MAKE AN ANGLE OBTUSE (same interaction continues)
  add('Make an angle obtuse', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    if (!ctx.seamless) {
      tri.reset({ ang: 1, al: 1 });
      if (tri.t.op < 0.5 || Geo.classifyAngles(tri.V).type === 'obtuse') await ctx.ensure(P('right'));
    }
    tri.assist.obtuse = true;
    ctx.chip('Drag vertex');
    const done = dragUntil(ctx, {
      modes: {},
      check: (V) => Geo.classifyAngles(V).type === 'obtuse' || 'no',
      onFail: (r, n) => { if (n >= 2) ctx.hint('Tip: open one corner wider than a square corner.', true); },
    });
    await ctx.say(['Drag a vertex to make', '[ob|any angle obtuse].'], { noHold: true });
    ctx.hint('Make one corner wider than a right angle.');
    await done;
    TL.Feedback.correct();
    await ctx.wait(400);
  });

  // 24 — OBTUSE-ANGLED (settle at 110° / 40° / 30°)
  add('Obtuse-angled', 'Angles', 'angles', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    if (tri.t.op < 0.5) await ctx.ensure(P('obtuse'));
    const ca = Geo.classifyAngles(tri.V);
    const j = ca.type === 'obtuse' ? ca.index : 0;
    const o1 = (j + 1) % 3, o2 = (j + 2) % 3, cur = Geo.angles(tri.V);
    const ang = [0, 0, 0];
    ang[j] = 110;
    ang[cur[o1] >= cur[o2] ? o1 : o2] = 40;
    ang[cur[o1] >= cur[o2] ? o2 : o1] = 30;
    const baseCm = (7.5 * Math.sin(ang[0] * Geo.RAD)) / Math.sin(110 * Geo.RAD);
    await ctx.morph(fitTo(Geo.toPx(Geo.fromAngles(ang[1], ang[2], baseCm), CEN), tri.V, CEN), 900);
    await ctx.say(['One angle is', '[ob|greater than 90°].'], { noHold: true });
    tri.set({ ang: dimExcept(j, 0.5), al: dimExcept(j, 0.6), aHi: mask([j]) });
    tri.pulse('angle', { i: j, dur: 700 });
    await ctx.wait(1100);
    await ctx.say(['A triangle with one angle greater than 90° is called an', '[ob|obtuse-angled] triangle.'], { noHold: true });
    tri.pulse('ring', { i: j, color: C.obtuse, size: 90, dur: 1000 });
    ctx.reveal();
    ctx.badge('obtuse', ...ctx.below());
    await ctx.wait(1300);
    await ctx.continue();
  });

  /* ---------- angles checkpoints ---------- */
  const ACUTE_CARDS = [
    { tag: 'A', V: Geo.fromAngles(50, 70, 5), ok: true },
    { tag: 'B', V: Geo.fromAngles(40, 50, 5.4), ok: false },
    { tag: 'C', V: Geo.fromAngles(40, 40, 6), ok: false },
    { tag: 'D', V: Geo.fromAngles(60, 60, 5), ok: true },
  ];
  const ACX = [365, 655, 945, 1235], ACY = 470;
  function acuteCard(layer, d, x) {
    const card = h('div', 'card', layer, `<span class="c-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`);
    const mini = UI.miniTriangle(d.V, { w: 252, h: 240, k: 40, angles: true, angleLabels: true, fs: 17, dy: 14 });
    card.appendChild(mini);
    card.mini = mini;
    card.style.left = x + 'px'; card.style.top = ACY + 'px';
    card.setAttribute('role', 'checkbox'); card.setAttribute('aria-checked', 'false');
    card.setAttribute('aria-label', `Triangle with angles ${Geo.displayAngles(d.V).deg.join(', ')} degrees`);
    return card;
  }

  // 25 — CHECKPOINT: FIND ACUTE TRIANGLES
  add('Find acute triangles', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset(); tri.set({ op: 0 });
    const cards = ACUTE_CARDS.map((d, i) => acuteCard(ctx.layer, d, ACX[i]));
    cards.forEach((c, i) => { c.classList.add('enter'); setTimeout(() => { c.classList.add('in'); c.classList.remove('enter'); }, 100 + i * 100); });
    await ctx.say(['Which of these are', '[ang|acute-angled] triangles?'], { noHold: true });
    await ctx.wait(500); // let the learner scan first
    const toggle = (c) => {
      c.sel = !c.sel; c.classList.toggle('sel', c.sel); c.setAttribute('aria-checked', String(c.sel));
      Sfx.select();
    };
    cards.forEach((c) => {
      c.classList.add('pick'); c.tabIndex = 0;
      c.addEventListener('click', () => toggle(c));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(c); } });
    });
    ctx.hint('You can choose more than one.');
    const btn = ctx.button('Check');
    for (;;) {
      await ctx.click(btn);
      const okAll = cards.every((c, i) => !!c.sel === ACUTE_CARDS[i].ok);
      if (okAll) break;
      TL.Feedback.wrong();
      if (!cards.some((c) => c.sel)) { ctx.sayFree(['Tap every triangle whose angles', 'are all [ang|less than 90°].'], { tone: 'warn' }); continue; }
      ctx.sayFree(['Check the', '[ang|angles] once more.'], { tone: 'warn' });
      cards.forEach((c, i) => {
        const d = ACUTE_CARDS[i];
        if (!!c.sel !== d.ok) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
        if (!d.ok) {
          const degs = Geo.angles(c.mini.refs.V);
          const k = degs.indexOf(Math.max(...degs));
          const l = c.mini.refs.angleLabels[k];
          l.classList.remove('evid'); void l.getBBox(); l.classList.add('evid');
          setTimeout(() => l.classList.remove('evid'), 2500);
        }
      });
    }
    btn.disabled = true;
    cards.forEach((c) => { c.classList.remove('pick'); c.tabIndex = -1; });
    TL.Feedback.correct();
    ctx.carry({ cards }, cards);
  });

  // 26 — CHECKPOINT SUCCESS
  add('Acute check success', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.set({ op: 0 });
    let cards;
    if (ctx.carried) cards = ctx.carried.cards;
    else {
      cards = ACUTE_CARDS.map((d, i) => acuteCard(ctx.layer, d, ACX[i]));
      cards.forEach((c, i) => { c.classList.add('in'); if (ACUTE_CARDS[i].ok) c.classList.add('sel'); });
    }
    cards.forEach((c, i) => {
      if (ACUTE_CARDS[i].ok) c.classList.add('good');
      else { c.classList.remove('sel'); c.classList.add('faded'); }
    });
    const g = cards.filter((c, i) => ACUTE_CARDS[i].ok);
    g.forEach((c) => ctx.sparkle(parseFloat(c.style.left), ACY - 80, 3, 60));
    await ctx.say(['Correct! These two triangles', 'have only [ang|acute angles].'], { tone: 'good', noHold: true });
    await ctx.continue('Continue', { delay: 900 });
  });

  // 27 — MAKE A RIGHT-ANGLED TRIANGLE
  add('Make it right-angled', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    if (tri.t.op < 0.5) {
      // emerge from example A, then morph to the new starting triangle
      tri.setShape(Geo.toPx(ACUTE_CARDS[0].V, CEN, 60));
      tri.reset({ ang: 1, al: 1 }, { instant: true });
      tri.set({ op: 0 }, { instant: true });
      tri.set({ op: 1 });
      await ctx.wait(500);
    }
    await ctx.morph(P('a706050'), 900);
    ctx.chip('Drag vertex');
    const done = dragUntil(ctx, {
      modes: { right: true },
      check: (V) => Geo.classifyAngles(V).type === 'right' || 'no',
      onFail: (r, n) => { if (n >= 2) ctx.hint('Hint: one angle must read exactly 90°.', true); },
    });
    await ctx.say(['Make this triangle', '[rt|right-angled].'], { noHold: true });
    ctx.hint('Drag any vertex to create one 90° angle.');
    await done;
    TL.Feedback.correct();
    await ctx.wait(400);
  });

  // 28 — RIGHT-ANGLED SUCCESS
  add('Right-angled success', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ ang: 1, al: 1 });
    if (tri.t.op < 0.5) await ctx.ensure(P('right'));
    else if (Geo.classifyAngles(tri.V).type !== 'right') await ctx.morph(fitTo(P('right'), tri.V, Geo.centroid(tri.V)));
    const j = Geo.classifyAngles(tri.V).index;
    tri.set({ ang: dimExcept(j, 0.45), al: dimExcept(j, 0.5), aHi: mask([j]) });
    tri.pulse('ring', { i: j, color: C.right, dur: 900 });
    await ctx.say(['A triangle with one [rt|90°] angle', 'is right-angled.'], { tone: 'good', noHold: true });
    ctx.reveal();
    ctx.badge('right', ...ctx.below());
    await ctx.wait(1300);
    await ctx.continue();
  });

  /* =====================================================================
     BOTH
     ===================================================================== */

  // 29 — CLASSIFY BY SIDES
  add('Classify by sides', 'Both', 'both', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, ang: 0.4, al: 0.45 });
    await ctx.ensure(P('rightIso', QUIZ));
    await ctx.say(['What type of triangle is this', 'by its [side|sides]?'], { noHold: true });
    for (const i of [0, 1]) { tri.pulse('sideLabel', { i, dur: 520 }); tri.setAt('slHi', i, 0.6); await ctx.wait(300); }
    await quiz(ctx, ['Scalene', 'Isosceles', 'Equilateral'], 1, {
      onWrong: () => { ctx.sayFree(['Look at the', '[side|side lengths] again.'], { tone: 'warn' }); evidenceSides(tri); },
    });
    TL.Feedback.correct();
    tri.set({ sideCol: colsFor([0, 1], C.equal), tick: [1, 1, 0], slHi: [1, 1, 0], sHi: [0.7, 0.7, 0], lblCol: C.equal });
    [0, 1].forEach((i) => tri.pulse('side', { i, dur: 700 }));
    await ctx.say(['Two sides are [eq|5 cm].', 'It is [eq|isosceles].'], { tone: 'good' });
  });

  // 30 — CLASSIFY BY ANGLES (same triangle, focus moves to 90°)
  add('Classify by angles', 'Both', 'both', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 0.5, ang: 1, al: 1, tick: [1, 1, 0], sideCol: colsFor([0, 1], C.equal) });
    await ctx.ensure(P('rightIso', QUIZ));
    const toB = (i) => () => [midOf(tri.Vd, i), tri.Vd[1]];
    tri.comet(toB(0), { dur: 700, color: '#E4C9FF', tail: 0.5 });
    await ctx.step(tri.comet(toB(1), { dur: 700, color: '#E4C9FF', tail: 0.5 }));
    tri.set({ aHi: [0, 1, 0] });
    tri.pulse('angle', { i: 1, dur: 600 });
    await ctx.say(['Now classify the same triangle', 'by its [ang|angles].'], { noHold: true });
    await quiz(ctx, ['Acute-angled', 'Right-angled', 'Obtuse-angled'], 1, {
      onWrong: () => { ctx.sayFree(['Check the', '[ang|angles] once more.'], { tone: 'warn' }); evidenceAngles(tri); },
    });
    TL.Feedback.correct();
    tri.pulse('ring', { i: 1, color: C.right, dur: 900 });
    await ctx.say(['One angle is [rt|90°].', 'It is [rt|right-angled].'], { tone: 'good' });
  });

  // 31 — BOTH CLASSIFICATIONS
  add('Both classifications', 'Both', 'both', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, ang: 1, al: 1 });
    await ctx.ensure(P('rightIso', DUAL));
    await ctx.say(['This triangle is', '[eq|isosceles]…'], { noHold: true });
    tri.set({ sideCol: colsFor([0, 1], C.equal), tick: [1, 1, 0], sHi: [0.6, 0.6, 0], slHi: [1, 1, 0], lblCol: C.equal });
    ctx.badge('isosceles', BADGE_X, BADGE_Y1);
    await ctx.wait(850);
    await ctx.append('…and [rt|right-angled].', { noHold: true });
    tri.set({ aHi: [0, 1, 0] });
    tri.pulse('angle', { i: 1, dur: 600 });
    ctx.badge('right', BADGE_X, BADGE_Y2);
    await ctx.wait(1400);
    await ctx.continue();
  });

  // 32 — CLASSIFY BY SIDES AND ANGLES
  add('Two ways to classify', 'Both', 'both', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, ang: 1, al: 1, sideCol: colsFor([0, 1], C.equal), tick: [1, 1, 0] });
    await ctx.ensure(P('rightIso', DUAL));
    const bIso = ctx.badge('isosceles', BADGE_X, BADGE_Y1, { sound: false });
    const bRt = ctx.badge('right', BADGE_X, BADGE_Y2, { sound: false });
    await ctx.say(['A triangle can be classified', '[tri|in two ways].'], { noHold: true });
    const b = Geo.bbox(tri.V);
    const conn = (y0, y1, col) => {
      const x0 = edgeX(tri.V, y0) + 22, x1 = BADGE_X - 140;
      const p = TL.svgEl('path', { d: `M${x0} ${y0} C${x0 + 60} ${y0} ${x1 - 60} ${y1} ${x1} ${y1}`, class: 'conn', stroke: col, opacity: 0.85 }, ctx.svg);
      const L = p.getTotalLength();
      p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
      Anim.run(650, TL.Ease.outCubic, (t) => { p.style.strokeDashoffset = `${L * (1 - t)}`; });
      return p;
    };
    conn(b.cy + 5, BADGE_Y1, C.equal);
    await ctx.wait(250);
    conn(b.cy + 60, BADGE_Y2, C.right);
    await ctx.wait(900);
    await ctx.say(['By its [eq|sides]…'], { noHold: true });
    tri.set({ sHi: [0.8, 0.8, 0], slHi: [1, 1, 0], lblCol: C.equal, aHi: 0, ang: 0.5, al: 0.5 });
    [0, 1].forEach((i) => tri.pulse('side', { i, dur: 700 }));
    bIso.pulse(); bRt.classList.add('dim');
    await ctx.wait(1300);
    await ctx.say(['…and by its [ang|angles].'], { noHold: true });
    tri.set({ sHi: 0, slHi: 0, sl: 0.55, ang: 1, al: 1, aHi: [0, 1, 0] });
    tri.pulse('ring', { i: 1, color: C.right, dur: 900 });
    bRt.classList.remove('dim'); bIso.classList.add('dim'); bRt.pulse();
    await ctx.wait(1300);
    bIso.classList.remove('dim');
    tri.set({ sl: 1 });
    await ctx.continue();
  });

  // 33 — CHECKPOINT: CLASSIFY BOTH
  add('Checkpoint: classify both', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, ang: 1, al: 1 });
    await ctx.ensure(P('obtuse', v(545, 480)));
    const box = h('div', 'opts', ctx.layer);
    box.style.left = '935px'; box.style.top = '250px'; box.style.width = '470px';
    h('div', 'opts-title', box, 'Classify by sides and angles.');
    const group = (label, items) => {
      h('div', 'opt-group', box, label);
      const row = h('div', 'opt-row', box);
      const btns = items.map((t) => h('button', 'opt chip-opt', row, t));
      let sel = -1;
      btns.forEach((b, i) => b.addEventListener('click', () => {
        if (row.locked) return;
        sel = i; btns.forEach((x, j) => x.classList.toggle('sel', j === i)); Sfx.select();
      }));
      return { row, btns, get sel() { return sel; } };
    };
    const gS = group('BY SIDES', ['Scalene', 'Isosceles', 'Equilateral']);
    const gA = group('BY ANGLES', ['Acute', 'Right', 'Obtuse']);
    [...gS.btns, ...gA.btns].forEach((b, i) => setTimeout(() => b.classList.add('in'), 200 + i * 70));
    await ctx.say(['Classify this triangle by its', '[side|sides] and [ang|angles].'], { noHold: true });
    let picked = false;
    [...gS.btns, ...gA.btns].forEach((b) => b.addEventListener('click', () => { if (!picked) { picked = true; TL.VO.stop(); } }));
    ctx.narr.readChoices([...gS.btns, ...gA.btns].map((b) => [b, b.textContent]), () => picked);
    const btn = ctx.button('Check', 1170, 690);
    for (;;) {
      await ctx.click(btn);
      if (gS.sel < 0 || gA.sel < 0) { Sfx.boop(); /* not wrong, just incomplete */ ctx.sayFree(['Choose one answer', 'in [tri|each row].'], { tone: 'warn' }); continue; }
      const okS = gS.sel === 0, okA = gA.sel === 2;
      if (okS && okA) break;
      TL.Feedback.wrong();
      const flag = (g) => { const b = g.btns[g.sel]; b.classList.add('wrong', 'shake'); setTimeout(() => b.classList.remove('wrong', 'shake'), 1100); };
      if (!okS) { flag(gS); evidenceSides(tri); }
      if (!okA) { flag(gA); tri.pulse('ring', { i: 0, color: C.obtuse, dur: 900 }); tri.pulse('angle', { i: 0, dur: 600 }); }
      ctx.sayFree(!okS ? ['Look at the', '[side|side lengths] again.'] : ['Check the', '[ang|angles] once more.'], { tone: 'warn' });
    }
    btn.disabled = true;
    gS.row.locked = gA.row.locked = true;
    gS.btns[0].classList.add('right'); gA.btns[2].classList.add('right');
    TL.Feedback.correct();
    await ctx.wait(500);
    ctx.carry({ box }, [box]);
  });

  // 34 — CHECKPOINT SUCCESS
  add('Classify both success', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    if (ctx.carried) ctx.carried.box.classList.add('retract');
    tri.reset({ sl: 1, ang: 1, al: 1 });
    await ctx.ensure(P('obtuse', DUAL));
    await ctx.say(['Correct! This triangle is', '[sc|scalene] and [ob|obtuse-angled].'], { tone: 'good', noHold: true });
    ctx.badge('scalene', BADGE_X, BADGE_Y1);
    for (const i of [0, 2, 1]) {
      tri.setAt('sideCol', i, C.side[i]).setAt('lblCol', i, C.side[i]).setAt('slHi', i, 1);
      tri.pulse('sideLabel', { i, dur: 500 });
      await ctx.wait(260);
    }
    await ctx.wait(400);
    ctx.badge('obtuse', BADGE_X, BADGE_Y2);
    tri.set({ aHi: [1, 0, 0] });
    tri.pulse('ring', { i: 0, color: C.obtuse, size: 90, dur: 1000 });
    await ctx.wait(1300);
    await ctx.continue();
  });

  // 35 — FINAL GEOMETRY CHALLENGE
  add('Final challenge', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, ang: 1, al: 1 });
    await ctx.ensure(P('s546'));
    ctx.chip('Drag vertex');
    const conds = h('div', 'conds', ctx.layer);
    const tick = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const cS = h('div', 'cond', conds, `<b>${tick}</b>Two equal sides <small>ACHIEVED</small>`);
    const cA = h('div', 'cond', conds, `<b>${tick}</b>One 90° angle <small>ACHIEVED</small>`);
    await ctx.say(['Final challenge.'], { hold: 600 });
    setTimeout(() => cS.classList.add('in'), 200);
    setTimeout(() => cA.classList.add('in'), 320);
    const state = { s: false, a: false };
    const update = (V) => {
      const s = Geo.classifySides(V).type === 'isosceles';
      const a = Geo.classifyAngles(V).type === 'right';
      if (s && !state.s) Sfx.chime();
      if (a && !state.a) Sfx.chime();
      state.s = s; state.a = a;
      cS.classList.toggle('ok', s); cA.classList.toggle('ok', a);
    };
    update(tri.V);
    const done = dragUntil(ctx, {
      modes: { iso: true, right: true, rightIso: true },
      onMove: (V) => update(V),
      check: (V) => (state.s && state.a) || 'no',
    });
    await ctx.say(['Make a', '[rt|right-angled] [eq|isosceles] triangle.'], { noHold: true });
    await done;
    await ctx.wait(250);
    TL.Feedback.correct();
    await ctx.wait(300);
  });

  // 36 — FINAL CHALLENGE SUCCESS
  add('Final success', 'Checkpoint', 'check', async (ctx) => {
    const { tri } = ctx;
    tri.reset({ sl: 1, ang: 1, al: 1 });
    const ok = (V) => Geo.classifySides(V).type === 'isosceles' && Geo.classifyAngles(V).type === 'right';
    if (tri.t.op < 0.5 || !ok(tri.V)) await ctx.ensure(P('rightIso', DUAL));
    else await ctx.morph(Geo.recenter(tri.V, DUAL), 800);
    const eq = Geo.classifySides(tri.V).equalSides, j = Geo.classifyAngles(tri.V).index;
    tri.set({ sideCol: colsFor(eq, C.equal), tick: mask(eq), sHi: mask(eq).map((x) => x * 0.7), slHi: mask(eq), lblCol: C.equal });
    eq.forEach((i) => tri.pulse('side', { i, dur: 700 }));
    const bIso = ctx.badge('isosceles', BADGE_X, BADGE_Y1);
    await ctx.wait(800);
    tri.set({ aHi: mask([j]) });
    tri.pulse('ring', { i: j, color: C.right, dur: 900 });
    const bRt = ctx.badge('right', BADGE_X, BADGE_Y2);
    await ctx.wait(800);
    bIso.pulse(); bRt.pulse();
    const b = Geo.bbox(tri.V);
    ctx.glow(800, 470, '#FFE7A3', 980);
    ctx.sparkle(b.cx, b.cy - 40, 6, 170);
    ctx.reveal();
    Sfx.shimmer();
    const gj = ctx.floatLabel('GREAT JOB!', BADGE_X, BADGE_Y2 + 92);
    gj.style.color = C.correct; gj.style.letterSpacing = '.12em';
    await ctx.say(['You can classify triangles by', '[side|sides] and [ang|angles]!'], { tone: 'good', noHold: true });
    await ctx.wait(1200);
    await ctx.continue();
  });

  /* =====================================================================
     SUMMARY
     ===================================================================== */

  // 37 — FINAL SUMMARY
  add('Summary', 'Summary', 'summary', async (ctx) => {
    const { tri } = ctx;
    const k = 64, LEFT = v(370, 470);
    tri.reset({});
    const grid = h('div', 'grid', ctx.layer);
    const COLS = [760, 1010, 1260], ROWS = [342, 628];
    const t1 = h('div', 'sec-title', grid, '<i></i>Triangles by sides');
    const t2 = h('div', 'sec-title', grid, '<i style="background:var(--acute)"></i>Triangles by angles');
    t1.style.left = '652px'; t1.style.top = '184px';
    t2.style.left = '652px'; t2.style.top = '474px';

    const card = (row, col, kind, rule, mini) => {
      const c = h('div', 'card', grid);
      c.style.left = COLS[col] + 'px'; c.style.top = ROWS[row] + 'px';
      c.appendChild(mini);
      const n = h('div', 'c-name', c, TL.BADGE[kind].label);
      n.style.setProperty('--cc', TL.BADGE[kind].col);
      h('div', 'c-rule', c, rule);
      c.classList.add('enter');
      requestAnimationFrame(() => { c.classList.add('in'); c.classList.remove('enter'); });
      Sfx.pop();
      return c;
    };

    await ctx.ensure(Geo.toPx(SH.s546, LEFT, k));
    await ctx.say(['Let’s summarise', 'what we learned.'], { hold: 500 });

    t1.classList.add('in');
    const sides = [
      { s: 's546', kind: 'scalene', rule: 'All sides different', say: ['A [sc|scalene] triangle', 'has all sides different.'], vis: { sideCol: C.side.slice(), tick: 0, sHi: 0.4 }, mini: { sideCols: C.side } },
      { s: 'iso556', kind: 'isosceles', rule: 'Two sides equal', say: ['An [eq|isosceles] triangle', 'has two equal sides.'], vis: { sideCol: colsFor([0, 2], C.equal), tick: [1, 0, 1], sHi: [0.5, 0, 0.5] }, mini: { sideCols: colsFor([0, 2], C.equal), ticks: [1, 0, 1] } },
      { s: 'equi5', kind: 'equilateral', rule: 'All three sides equal', say: ['An [eq|equilateral] triangle', 'has all three sides equal.'], vis: { sideCol: [C.equal, C.equal, C.equal], tick: 1, sHi: 0.5 }, mini: { sideCols: [C.equal, C.equal, C.equal], ticks: [1, 1, 1] } },
    ];
    for (let i = 0; i < 3; i++) {
      const it = sides[i];
      tri.set({ sl: 0, ang: 0, al: 0, aHi: 0, ...it.vis });
      await ctx.morph(Geo.toPx(SH[it.s], LEFT, k), 650);
      tri.pulse('scale', { amp: 0.02, dur: 500 });
      card(0, i, it.kind, it.rule, UI.miniTriangle(SH[it.s], { w: 214, h: 142, pad: 18, ...it.mini }));
      await ctx.say(it.say, { hold: 250 });
    }

    t2.classList.add('in');
    const angs = [
      { s: 'a706050', kind: 'acute', rule: 'All angles < 90°', say: ['An [ang|acute-angled] triangle', 'has all angles less than 90°.'], hi: [0.7, 0.7, 0.7] },
      { s: 'right', kind: 'right', rule: 'One angle = 90°', say: ['A [rt|right-angled] triangle', 'has one angle of exactly 90°.'], hi: [0, 1, 0] },
      { s: 'obtuse', kind: 'obtuse', rule: 'One angle > 90°', say: ['An [ob|obtuse-angled] triangle', 'has one angle greater than 90°.'], hi: [1, 0, 0] },
    ];
    tri.set({ sideCol: C.outline, tick: 0, sHi: 0, ang: 1, al: 1 });
    for (let i = 0; i < 3; i++) {
      const it = angs[i];
      tri.set({ aHi: it.hi });
      await ctx.morph(Geo.toPx(SH[it.s], LEFT, k), 650);
      it.hi.forEach((x, j) => x && tri.pulse('angle', { i: j, dur: 520 }));
      card(1, i, it.kind, it.rule, UI.miniTriangle(SH[it.s], { w: 214, h: 142, pad: 18, angles: true }));
      await ctx.say(it.say, { hold: 250 });
    }

    // final concept: one triangle, two names
    ctx.narr.hide();
    grid.classList.add('back');
    tri.set({ sl: 1, ang: 1, al: 1, aHi: [0, 1, 0], sideCol: colsFor([0, 1], C.equal), tick: [1, 1, 0], lblCol: C.equal, slHi: [1, 1, 0] });
    await ctx.morph(P('rightIso', v(800, 410)), 900);
    const b1 = ctx.badge('isosceles', 620, 728, { small: true });
    const plus = h('div', 'plus', ctx.layer, '+'); plus.style.left = '800px'; plus.style.top = '728px';
    await ctx.wait(300);
    plus.classList.add('in');
    const b2 = ctx.badge('right', 985, 728, { small: true, sound: false });
    await ctx.say(['A triangle can be classified by both', 'its [side|sides] and its [ang|angles].'], { hold: 900 });

    // everything settles into a clean overview
    ctx.narr.hide();
    tri.set({ op: 0 });
    [b1, b2, plus].forEach((e) => { e.style.transition = 'opacity .4s'; e.style.opacity = 0; });
    await ctx.wait(350);
    grid.classList.remove('back');
    grid.classList.add('center');
    await ctx.wait(900);
    const ready = await ctx.continue('You’re ready!', { delay: 200 });
    ready.classList.remove('in');
    Sfx.shimmer();
    ctx.glow(800, 450, '#FFE7A3', 1100);
    ctx.sparkle(800, 300, 6, 220);
    await ctx.say(['Well done,', '[tri|triangle explorer]!'], { tone: 'good', noHold: true });
    const again = ctx.button('Play again', 800, 838, { variant: 'soft', arrow: false });
    await ctx.click(again);
    ctx.goto(0);
  });

  TL.SCREENS = S;
})();
