/* Living backgrounds: drifting clouds, chimney smoke and a waving castle flag,
   laid over the painted art at measured image coordinates. One SVG per image,
   with the same aspect fit as the art, so every effect stays pinned to its spot
   at any screen size. Motion is CSS transform/opacity, except the flag's
   wave, which is a small SVG shape morph. */
(function () {
  const TL = (window.TL = window.TL || {});
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* measured on the art (image pixels) */
  const SCENES = {
    background: {
      w: 1672, h: 941,
      chimney: { x: 184, y: 334, k: 1, rise: 140, color: '#ffffff' },
      flag: { x: 1505, y: 152, k: 1, blur: 2.9, red: '#e8243f', orange: '#ff5a1a', sky: ['#94d1fa', '#b6dafb', '#dde7fc'] },
      clouds: [
        { x: 260, y: 70, s: 1.25, dur: 150, op: 0.62 },
        { x: 900, y: 150, s: 0.85, dur: 115, op: 0.5 },
        { x: 1350, y: 55, s: 1.05, dur: 175, op: 0.58 },
        { x: 560, y: 250, s: 0.7, dur: 130, op: 0.42 },
      ],
      // clouds pass behind the castle
      behind: ['1430,128 1600,128 1672,210 1672,941 1395,941 1395,270'],
    },
    thumbnail: {
      w: 1600, h: 900,
      chimney: { x: 100, y: 350, k: 0.72, rise: 120, color: '#fff3f1' },
      flag: { x: 1510, y: 177, k: 1.03, blur: 1.1, red: '#e5283a', orange: '#f24a46', sky: ['#5db8fd', '#61bcfe', '#67c1ff'] },
      clouds: [
        { x: 60, y: 60, s: 0.95, dur: 120, op: 0.7 },
        { x: 700, y: 110, s: 0.7, dur: 95, op: 0.55 },
        { x: 1300, y: 40, s: 1.1, dur: 150, op: 0.65 },
      ],
      // clouds pass behind the hanging sign (and its ropes and leaves) and the castle
      behind: ['225,-20 1432,-20 1432,392 225,392', '1440,150 1600,150 1600,900 1400,900'],
    },
  };

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  /* swallowtail pennant, pole at x=0, top edge at y=0; three wave poses */
  const FLAG = [
    'M0 0 C14 -4 30 6 51 0 L41 11 L50 22 C31 26 14 15 0 23 Z',
    'M0 0 C14 5 31 -5 50 4 L41 13 L48 24 C30 17 14 27 0 23 Z',
    'M0 0 C16 -2 33 4 49 -2 L39 9 L50 19 C33 23 15 19 0 23 Z',
  ];

  function build(host, name, uid) {
    const S = SCENES[name];
    const svg = el('svg', { class: 'life', viewBox: `0 0 ${S.w} ${S.h}`, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
    svg.style.setProperty('--w', S.w + 'px');
    const defs = el('defs', {}, svg);

    // soft cloud: overlapping radial puffs, no filters (cheap to move)
    const cg = el('radialGradient', { id: `${uid}cloudG` }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.95' }, cg);
    el('stop', { offset: '.55', 'stop-color': '#fff', 'stop-opacity': '.75' }, cg);
    el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }, cg);
    const cloud = el('g', { id: `${uid}cloud` }, defs);
    for (const [cx, cy, r] of [[0, 10, 62], [58, -18, 60], [118, 4, 54], [62, 26, 58], [-46, 22, 44], [160, 24, 40]]) el('circle', { cx, cy, r, fill: `url(#${uid}cloudG)` }, cloud);

    // mask: clouds slip behind foreground shapes
    const mask = el('mask', { id: `${uid}behind`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: S.w, height: S.h }, defs);
    const mf = el('filter', { id: `${uid}soft`, x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
    el('feGaussianBlur', { stdDeviation: 8 }, mf);
    el('rect', { x: 0, y: 0, width: S.w, height: S.h, fill: '#fff' }, mask);
    const holes = el('g', { filter: `url(#${uid}soft)` }, mask);
    for (const pts of S.behind) el('polygon', { points: pts, fill: '#000' }, holes);

    const clouds = el('g', { class: 'life-clouds', mask: `url(#${uid}behind)` }, svg);
    S.clouds.forEach((c, i) => {
      const g = el('g', { class: 'life-cloud' }, clouds);
      // travel from fully off the left edge to fully off the right; start part-way
      g.style.setProperty('--from', `${-c.x - 260 * c.s}px`);
      g.style.setProperty('--to', `${S.w - c.x + 120 * c.s}px`);
      g.style.animationDuration = c.dur + 's';
      const span = S.w + 380 * c.s;
      g.style.animationDelay = -(c.dur * ((c.x + 260 * c.s) / span)) + 's';
      el('use', { href: `#${uid}cloud`, transform: `translate(${c.x} ${c.y}) scale(${c.s})`, opacity: c.op }, g);
    });

    // chimney smoke
    const sm = S.chimney;
    const sg = el('radialGradient', { id: `${uid}smokeG` }, defs);
    el('stop', { offset: '0', 'stop-color': sm.color, 'stop-opacity': '.9' }, sg);
    el('stop', { offset: '.6', 'stop-color': sm.color, 'stop-opacity': '.55' }, sg);
    el('stop', { offset: '1', 'stop-color': sm.color, 'stop-opacity': '0' }, sg);
    const smoke = el('g', { class: 'life-smoke', transform: `translate(${sm.x} ${sm.y}) scale(${sm.k})` }, svg);
    smoke.style.setProperty('--rise', -sm.rise + 'px');
    const PUFFS = 6, DUR = 7.2;
    for (let i = 0; i < PUFFS; i++) {
      const p = el('circle', { class: 'puff', cx: 0, cy: 0, r: 15, fill: `url(#${uid}smokeG)` }, smoke);
      p.style.animationDelay = -(DUR / PUFFS) * i + 's';
      p.style.animationDuration = DUR + 's';
    }

    // castle flag: cover the painted flag with its sky, then wave a vector flag in its place
    const f = S.flag;
    const flag = el('g', { class: 'life-flag', transform: `translate(${f.x} ${f.y}) scale(${f.k})` }, svg);
    const sky = el('linearGradient', { id: `${uid}sky` }, defs);
    f.sky.forEach((c, i) => el('stop', { offset: i / (f.sky.length - 1), 'stop-color': c }, sky));
    const pf = el('filter', { id: `${uid}patchBlur`, x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feGaussianBlur', { stdDeviation: 3 }, pf);
    el('rect', { x: 5, y: -5, width: 56, height: 34, rx: 10, fill: `url(#${uid}sky)`, filter: `url(#${uid}patchBlur)` }, flag);
    const fg = el('linearGradient', { id: `${uid}flagG` }, defs);
    el('stop', { offset: '0', 'stop-color': f.red }, fg);
    el('stop', { offset: '1', 'stop-color': f.orange }, fg);
    const shade = el('linearGradient', { id: `${uid}flagShade`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.35' }, shade);
    el('stop', { offset: '.5', 'stop-color': '#fff', 'stop-opacity': '0' }, shade);
    el('stop', { offset: '1', 'stop-color': '#7a0a1a', 'stop-opacity': '.3' }, shade);
    const ff = el('filter', { id: `${uid}flagBlur`, x: '-20%', y: '-40%', width: '140%', height: '180%' }, defs);
    el('feGaussianBlur', { stdDeviation: f.blur }, ff);
    const cloth = el('g', { filter: `url(#${uid}flagBlur)` }, flag);
    for (const fill of [`url(#${uid}flagG)`, `url(#${uid}flagShade)`]) {
      const path = el('path', { d: FLAG[0], fill }, cloth);
      el('animate', {
        attributeName: 'd', dur: '2.8s', repeatCount: 'indefinite',
        values: [...FLAG, FLAG[0]].join(';'), keyTimes: '0;.33;.66;1',
        calcMode: 'spline', keySplines: '.45 0 .55 1;.45 0 .55 1;.45 0 .55 1',
      }, path);
    }

    host.appendChild(svg);
    if (reduced && svg.pauseAnimations) svg.pauseAnimations();
    return svg;
  }

  TL.Scenery = {
    init() {
      const bg = document.querySelector('#bg .bg-img');
      if (bg) bg.insertAdjacentElement('afterend', build(document.createElement('div'), 'background', 'bgL'));
      const art = document.querySelector('#start .start-art');
      if (art) art.insertAdjacentElement('afterend', build(document.createElement('div'), 'thumbnail', 'thL'));
    },
  };
})();
