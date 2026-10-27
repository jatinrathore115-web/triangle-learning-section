/* Soft synthesized UI sounds (Web Audio, no files). Narration lives in voice.js. */
(function () {
  const TL = (window.TL = window.TL || {});
  let ctx = null, master = null, unlocked = false;

  function ac() {
    if (!unlocked) return null;
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx.state === 'running' ? ctx : null;
  }

  function tone(freq, { type = 'sine', at = 0, dur = 0.2, gain = 0.12, to = null, attack = 0.008 } = {}) {
    const c = ac(); if (!c || !Sfx.on) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise({ at = 0, dur = 0.3, gain = 0.05, f0 = 600, f1 = 2400, q = 1.2 } = {}) {
    const c = ac(); if (!c || !Sfx.on) return;
    const t0 = c.currentTime + at;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  let lastTick = 0;
  const Sfx = {
    on: true,
    unlock() { unlocked = true; ac(); },
    pop() { tone(520, { to: 880, dur: 0.12, gain: 0.09 }); },
    trace(dur = 0.35) { noise({ dur, gain: 0.035, f0: 900, f1: 3200, q: 2 }); },
    chime() { tone(1318, { dur: 0.35, gain: 0.05 }); tone(1976, { at: 0.04, dur: 0.3, gain: 0.03 }); },
    correct() {
      [784, 988, 1175].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.6, gain: 0.07, type: 'triangle' }));
      tone(2637, { at: 0.24, dur: 0.25, gain: 0.025 });
    },
    boop() { tone(330, { to: 240, dur: 0.18, gain: 0.08 }); },
    tick() {
      const now = performance.now();
      if (now - lastTick < 70) return;
      lastTick = now;
      tone(1800, { dur: 0.03, gain: 0.012, type: 'square' });
    },
    snap() { tone(180, { to: 120, dur: 0.09, gain: 0.12 }); tone(2200, { at: 0.01, dur: 0.05, gain: 0.04, type: 'triangle' }); },
    shimmer() { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.45, gain: 0.025 })); },
    whoosh() { noise({ dur: 0.45, gain: 0.025, f0: 400, f1: 1400, q: 0.8 }); },
    select() { tone(660, { dur: 0.08, gain: 0.05, type: 'triangle' }); },
    /* effects sit under the narrator's voice, then come back */
    duck(on) { if (master && ctx) master.gain.setTargetAtTime(on ? 0.2 : 0.55, ctx.currentTime, 0.25); },
  };

  /* answer feedback sounds (provided recordings) */
  const answer = { correct: new Audio('assets/sfx/correct.mp3'), wrong: new Audio('assets/sfx/incorrect.mp3') };
  const BASE = { correct: 0.75, wrong: 0.7 };
  for (const k in answer) { answer[k].preload = 'auto'; answer[k].volume = BASE[k]; }
  let primed = false;
  const playAnswer = (k) => {
    if (!Sfx.on) return;
    const a = answer[k];
    try { a.pause(); a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  };
  Sfx.correctAnswer = () => playAnswer('correct');
  Sfx.wrongAnswer = () => playAnswer('wrong');
  const unlockWebAudio = Sfx.unlock;
  Sfx.unlock = () => {
    unlockWebAudio();
    if (primed) return;
    primed = true; // tablets need each element touched inside a user gesture
    for (const k in answer) { const a = answer[k]; a.muted = true; a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); }
  };
  const duckSynth = Sfx.duck;
  Sfx.duck = (on) => { duckSynth(on); for (const k in answer) answer[k].volume = on ? BASE[k] * 0.4 : BASE[k]; };

  TL.Sfx = Sfx;
})();
