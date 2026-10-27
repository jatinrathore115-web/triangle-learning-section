/* Geometry engine — real coordinates, live measurements, magnetic snapping.
   Vertex order is always [A, B, C]. Side i joins V[i] → V[(i+1)%3]:
   side 0 = AB, side 1 = BC, side 2 = CA. Angle i is the interior angle at V[i]. */
(function () {
  const TL = (window.TL = window.TL || {});

  const v = (x, y) => ({ x, y });
  const sub = (a, b) => v(a.x - b.x, a.y - b.y);
  const add = (a, b) => v(a.x + b.x, a.y + b.y);
  const mul = (a, s) => v(a.x * s, a.y * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const len = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (a) => { const l = len(a) || 1; return v(a.x / l, a.y / l); };
  const perp = (a) => v(-a.y, a.x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpP = (a, b, t) => v(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
  const clone = (V) => V.map((p) => v(p.x, p.y));
  const DEG = 180 / Math.PI;
  const RAD = Math.PI / 180;

  const PX_PER_CM = 84; // stage scale: 1 cm = 84 px

  function angleAt(V, i) {
    const P = V[i], Q = V[(i + 1) % 3], R = V[(i + 2) % 3];
    const a = norm(sub(Q, P)), b = norm(sub(R, P));
    return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * DEG;
  }
  const sides = (V) => [dist(V[0], V[1]), dist(V[1], V[2]), dist(V[2], V[0])];
  const angles = (V) => [0, 1, 2].map((i) => angleAt(V, i));
  const centroid = (V) => v((V[0].x + V[1].x + V[2].x) / 3, (V[0].y + V[1].y + V[2].y) / 3);

  function bbox(V) {
    const xs = V.map((p) => p.x), ys = V.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function incenter(V) {
    const [ab, bc, ca] = sides(V);
    // weights are the lengths of the opposite sides
    const wa = bc, wb = ca, wc = ab, s = wa + wb + wc;
    return v((V[0].x * wa + V[1].x * wb + V[2].x * wc) / s, (V[0].y * wa + V[1].y * wb + V[2].y * wc) / s);
  }
  function inradius(V) {
    const [a, b, c] = sides(V);
    const s = (a + b + c) / 2;
    const area = Math.abs(cross(sub(V[1], V[0]), sub(V[2], V[0]))) / 2;
    return area / s;
  }

  /* ---------- constructions (cm, y-up, B at origin, C on the x-axis) ---------- */
  function fromSSS(ab, ca, bc) {
    const ax = (ab * ab - ca * ca + bc * bc) / (2 * bc);
    const ay = Math.sqrt(Math.max(0, ab * ab - ax * ax));
    return [v(ax, ay), v(0, 0), v(bc, 0)];
  }
  function fromAngles(angB, angC, bc) {
    const angA = 180 - angB - angC;
    const ab = (bc * Math.sin(angC * RAD)) / Math.sin(angA * RAD);
    return [v(ab * Math.cos(angB * RAD), ab * Math.sin(angB * RAD)), v(0, 0), v(bc, 0)];
  }
  /* cm (y-up) → stage px with the bounding-box centre at `at` */
  function toPx(Vcm, at, k = PX_PER_CM) {
    const P = Vcm.map((p) => v(p.x * k, -p.y * k));
    const b = bbox(P);
    return P.map((p) => v(p.x - b.cx + at.x, p.y - b.cy + at.y));
  }
  function recenter(V, at) {
    const b = bbox(V);
    return V.map((p) => v(p.x - b.cx + at.x, p.y - b.cy + at.y));
  }
  function scaleAbout(V, c, s) { return V.map((p) => add(c, mul(sub(p, c), s))); }

  /* rotate `shape` (same vertex identities) to best match `ref` — keeps morphs short */
  function fitRotation(shape, ref) {
    const cs = centroid(shape), cr = centroid(ref);
    let sx = 0, sy = 0;
    for (let i = 0; i < 3; i++) {
      const a = sub(shape[i], cs), b = sub(ref[i], cr);
      sx += dot(a, b); sy += cross(a, b);
    }
    const th = Math.atan2(sy, sx), c = Math.cos(th), s = Math.sin(th);
    return shape.map((p) => { const d = sub(p, cs); return v(cr.x + d.x * c - d.y * s, cr.y + d.x * s + d.y * c); });
  }

  /* ---------- measurement display (never mathematically inconsistent) ---------- */
  const EPS_LEN = 0.02; // cm
  const EPS_ANG = 0.05; // degrees

  function fmtCm(x, dp = 1) {
    const f = Math.pow(10, dp);
    const r = Math.round(x * f) / f;
    return (Number.isInteger(r) ? String(r) : r.toFixed(dp).replace(/0+$/, '')) + ' cm';
  }
  function displayLengths(V, k = PX_PER_CM) {
    const cm = sides(V).map((s) => s / k);
    const out = cm.map((x) => fmtCm(x));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      if (out[i] === out[j] && Math.abs(cm[i] - cm[j]) > EPS_LEN) {
        out[i] = fmtCm(cm[i], 2); out[j] = fmtCm(cm[j], 2);
      }
    }
    return { cm, text: out };
  }
  function displayAngles(V) {
    const raw = angles(V);
    const exact = raw.map((a) => Math.abs(a - 90) < EPS_ANG);
    const r = raw.map((a, i) => {
      if (exact[i]) return 90;
      const n = Math.round(a);
      return n === 90 ? (a < 90 ? 89 : 91) : n;
    });
    const locked = (i) => exact[i];
    const equalToOther = (i) => [0, 1, 2].some((j) => j !== i && Math.abs(raw[i] - raw[j]) < 0.01);
    for (let guard = 0; guard < 4; guard++) {
      const sum = r[0] + r[1] + r[2];
      if (sum === 180) break;
      const dir = sum < 180 ? 1 : -1;
      const cands = [0, 1, 2].filter((i) => !locked(i) && r[i] + dir !== 90);
      if (!cands.length) break;
      cands.sort((i, j) => {
        const pe = (equalToOther(i) ? 1 : 0) - (equalToOther(j) ? 1 : 0);
        if (pe) return pe;
        return dir * ((raw[j] - r[j]) - (raw[i] - r[i]));
      });
      r[cands[0]] += dir;
    }
    return { raw, deg: r };
  }

  function classifySides(V, k = PX_PER_CM) {
    const s = sides(V).map((x) => x / k);
    const eq = (i, j) => Math.abs(s[i] - s[j]) < EPS_LEN;
    const pairs = [];
    if (eq(0, 1)) pairs.push([0, 1]);
    if (eq(1, 2)) pairs.push([1, 2]);
    if (eq(2, 0)) pairs.push([2, 0]);
    const type = pairs.length === 3 ? 'equilateral' : pairs.length ? 'isosceles' : 'scalene';
    const equalSides = type === 'equilateral' ? [0, 1, 2] : type === 'isosceles' ? pairs[0] : [];
    return { type, equalSides, cm: s };
  }
  function classifyAngles(V) {
    const a = angles(V);
    let idx = 0;
    for (let i = 1; i < 3; i++) if (a[i] > a[idx]) idx = i;
    if (Math.abs(a[idx] - 90) < EPS_ANG) return { type: 'right', index: idx, deg: a };
    if (a[idx] > 90) return { type: 'obtuse', index: idx, deg: a };
    return { type: 'acute', index: -1, deg: a };
  }

  function valid(V, o) {
    const s = sides(V), a = angles(V);
    if (Math.min(...s) < (o.minSide || 80)) return false;
    if (Math.min(...a) < (o.minAngle || 13)) return false;
    if (o.bounds) {
      const b = o.bounds;
      for (const p of V) if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) return false;
    }
    return true;
  }

  /* ---------- magnetic snapping ----------
     For the dragged vertex P (others J, K) each condition is a locus:
       PJ = PK        → perpendicular bisector of JK
       PJ = JK        → circle(J, |JK|)          PK = JK → circle(K, |JK|)
       ∠P = 90°       → Thales circle on JK
       ∠J = 90°       → line through J ⟂ JK       ∠K = 90° → line through K ⟂ JK
     Combined goals (equilateral, right isosceles) are exact points. */
  const projLine = (p, a, d) => { const u = norm(d); return add(a, mul(u, dot(sub(p, a), u))); };
  const projCircle = (p, c, r) => add(c, mul(norm(sub(p, c)), r));

  function makeSnapper(modes, k = PX_PER_CM) {
    const LEN_T = 0.18 * k;  // side-length difference that pulls into equality
    const ANG_T = 3;         // degrees that pull into 90°
    const PT_T = 0.34 * k;   // px radius for exact goal points
    return function snap(i, p, V) {
      const j = (i + 1) % 3, kk = (i + 2) % 3;
      const J = V[j], K = V[kk];
      const JK = dist(J, K), mid = lerpP(J, K, 0.5), u = norm(sub(K, J)), n = perp(u);

      const points = [];
      if (modes.equi) {
        const h = (JK * Math.sqrt(3)) / 2;
        points.push({ p: add(mid, mul(n, h)), kind: 'equi' }, { p: add(mid, mul(n, -h)), kind: 'equi' });
      }
      if (modes.rightIso) {
        points.push(
          { p: add(mid, mul(n, JK / 2)), kind: 'rightIso' }, { p: add(mid, mul(n, -JK / 2)), kind: 'rightIso' },
          { p: add(J, mul(n, JK)), kind: 'rightIso' }, { p: add(J, mul(n, -JK)), kind: 'rightIso' },
          { p: add(K, mul(n, JK)), kind: 'rightIso' }, { p: add(K, mul(n, -JK)), kind: 'rightIso' }
        );
      }
      let best = null;
      for (const c of points) {
        const d = dist(p, c.p);
        if (d < PT_T && (!best || d < best.d)) best = { ...c, d };
      }
      if (best) return { p: best.p, kind: best.kind };

      const loci = [];
      if (modes.iso) {
        const PJ = dist(p, J), PK = dist(p, K);
        loci.push({ score: Math.abs(PJ - PK) / LEN_T, proj: () => projLine(p, mid, n), kind: 'iso' });
        loci.push({ score: Math.abs(PJ - JK) / LEN_T, proj: () => projCircle(p, J, JK), kind: 'iso' });
        loci.push({ score: Math.abs(PK - JK) / LEN_T, proj: () => projCircle(p, K, JK), kind: 'iso' });
      }
      if (modes.right) {
        const tmp = [p, J, K];
        const aP = angleAt(tmp, 0), aJ = angleAt(tmp, 1), aK = angleAt(tmp, 2);
        loci.push({ score: Math.abs(aP - 90) / ANG_T, proj: () => projCircle(p, mid, JK / 2), kind: 'right' });
        loci.push({ score: Math.abs(aJ - 90) / ANG_T, proj: () => projLine(p, J, n), kind: 'right' });
        loci.push({ score: Math.abs(aK - 90) / ANG_T, proj: () => projLine(p, K, n), kind: 'right' });
      }
      let bl = null;
      for (const l of loci) if (l.score < 1 && (!bl || l.score < bl.score)) bl = l;
      if (bl) return { p: bl.proj(), kind: bl.kind };
      return { p, kind: null };
    };
  }

  TL.Geo = {
    v, sub, add, mul, dot, cross, len, dist, norm, perp, lerp, lerpP, clone, DEG, RAD, PX_PER_CM,
    angleAt, sides, angles, centroid, bbox, incenter, inradius,
    fromSSS, fromAngles, toPx, recenter, scaleAbout, fitRotation,
    fmtCm, displayLengths, displayAngles, classifySides, classifyAngles, valid, makeSnapper,
  };
})();
