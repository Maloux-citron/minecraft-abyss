/* =====================================================================
 *  MINECRAFT ABYSS — ambiance sonore relaxante (100 % synthétisée, aucun fichier audio)
 *  AUCUN BRUIT : uniquement des sons tonals (sinus / triangle), jamais de bruit blanc.
 *  - houle : notes graves pures qui respirent lentement, et s'assourdissent avec la profondeur
 *  - harmoniques cristallines près de la surface
 *  - nappe douce (accord la mineur 9) qui s'épaissit en descendant
 *  - petites bulles, notes cristallines espacées, chants de baleine lointains
 *  Tout passe par une réverbération longue pour un rendu apaisant.
 * ===================================================================== */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const A = { ctx: null, enabled: true, volume: 0.5, ok: !!AC, needsGesture: false };
  let master, bus, send, bedLP, bedGain, shimGain, padGain, padLP;
  let tBubble = 2, tBell = 5, tWhale = 40, built = false, curDepth = 0, curFade = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // Réverbération : la réponse impulsionnelle est un bruit qui s'éteint, mais comme aucune source
  // n'émet de bruit, elle ne produit que des queues de notes douces (pas de souffle).
  function impulse(ctx, secs, decay) {
    const sr = ctx.sampleRate, n = Math.floor(sr * secs), buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const env = Math.pow(1 - i / n, decay);
        lp += ((Math.random() * 2 - 1) - lp) * 0.35;           // reverb douce (un peu sourde)
        d[i] = lp * env;
      }
    }
    return buf;
  }

  function lfo(ctx, freq, depth, target, phase) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = depth;
    o.connect(g); g.connect(target); o.start(ctx.currentTime + (phase || 0));
    return o;
  }

  function build() {
    if (built || !AC) return;
    let ctx;
    try { ctx = new AC(); } catch (e) { A.ok = false; return; }
    A.ctx = ctx; built = true;

    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .4;
    master.connect(comp); comp.connect(ctx.destination);
    A.analyser = ctx.createAnalyser(); A.analyser.fftSize = 2048; comp.connect(A.analyser);   // sert aux tests de niveau

    bus = ctx.createGain(); bus.connect(master);
    const rv = ctx.createConvolver(); rv.buffer = impulse(ctx, 5.5, 2.4);
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.85;
    send = ctx.createGain(); send.gain.value = 1;
    send.connect(rv); rv.connect(rvOut); rvOut.connect(master);

    // --- houle : notes graves pures qui montent et descendent très lentement (aucun bruit)
    bedLP = ctx.createBiquadFilter(); bedLP.type = 'lowpass'; bedLP.frequency.value = 900; bedLP.Q.value = 0.3;
    bedGain = ctx.createGain(); bedGain.gain.value = 0.2;
    bedLP.connect(bedGain); bedGain.connect(bus); bedGain.connect(send);
    [[110, 1], [164.81, .7], [220, .5], [329.63, .3]].forEach(([f, v]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = rnd(-4, 4);
      const g = ctx.createGain(); g.gain.value = 0.0;
      lfo(ctx, rnd(0.035, 0.07), v * 0.12, g.gain, rnd(0, 10));    // respiration lente, comme une houle
      lfo(ctx, rnd(0.02, 0.04), v * 0.05, g.gain, rnd(0, 10));
      g.gain.value = v * 0.2;
      o.connect(g); g.connect(bedLP); o.start();
    });

    // --- lumière près de la surface : harmoniques cristallines très douces
    shimGain = ctx.createGain(); shimGain.gain.value = 0.04;
    shimGain.connect(bus); shimGain.connect(send);
    [659.25, 987.77, 1318.51].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = rnd(-6, 6);
      const g = ctx.createGain(); g.gain.value = 0.05;
      lfo(ctx, rnd(0.05, 0.11), 0.045, g.gain, rnd(0, 9));
      o.connect(g); g.connect(shimGain); o.start();
    });

    // --- nappe : la mineur 9 (A1 E2 A2 C3 E3 B3)
    padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 700; padLP.Q.value = 0.3;
    padGain = ctx.createGain(); padGain.gain.value = 0.1;
    padLP.connect(padGain); padGain.connect(bus); padGain.connect(send);
    [[55, 1], [82.41, .8], [110, .7], [130.81, .45], [164.81, .4], [246.94, .18]].forEach(([f, v], i) => {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = i > 3 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det + rnd(-2, 2);
        const g = ctx.createGain(); g.gain.value = v * 0.16;
        lfo(ctx, rnd(0.03, 0.08), v * 0.10, g.gain, rnd(0, 8));      // chaque voix respire à son rythme
        o.connect(g); g.connect(padLP); o.start();
      }
    });
    built = true;
  }

  // ---------- événements ponctuels ----------
  function bubble() {
    const ctx = A.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), f0 = rnd(220, 480);
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * rnd(2, 3), t + 0.08);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rnd(0.03, 0.06), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    o.connect(g); g.connect(bus); g.connect(send);
    o.start(t); o.stop(t + 0.2);
  }
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
  function bell() {
    const ctx = A.ctx, t = ctx.currentTime, f = SCALE[(Math.random() * SCALE.length) | 0];
    const notes = Math.random() < 0.3 ? [f, f * 1.5] : [f];
    notes.forEach((fr, i) => {
      for (const [mul, vol] of [[1, 1], [2.0, .16], [3.01, .05]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fr * mul;
        const st = t + i * 0.35, peak = 0.05 * vol;
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(peak, st + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0005, st + 7);
        o.connect(g); g.connect(send); g.connect(bus);
        o.start(st); o.stop(st + 7.2);
      }
    });
  }
  function whale() {
    const ctx = A.ctx, t = ctx.currentTime, f = rnd(150, 260), dur = rnd(7, 11);
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * rnd(1.4, 1.8), t + dur * 0.35);
    o.frequency.linearRampToValueAtTime(f * rnd(0.7, 0.95), t + dur);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.5; vg.gain.value = 3; vib.connect(vg); vg.connect(o.frequency);
    lp.type = 'lowpass'; lp.frequency.value = 650;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp); lp.connect(g); g.connect(send); g.connect(bus);
    o.start(t); vib.start(t); o.stop(t + dur + .2); vib.stop(t + dur + .2);
  }

  // ---------- API ----------
  A.start = function () {
    if (!A.ok || built) return;
    build();
    if (A.ctx && A.ctx.state === 'suspended') A.needsGesture = true;
  };
  A.unlock = function () {
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume().then(() => { A.needsGesture = false; }).catch(() => {});
  };
  // Coupure du son : quand Wallpaper Engine met le fond en pause (jeu en plein écran, etc.)
  // ou quand la page est masquée. Fondu rapide puis suspension du moteur audio (0 % CPU).
  const why = { pause: false, hidden: !!document.hidden };
  let muted = !!document.hidden, suspendTimer = 0;
  function applyMute() {
    const m = why.pause || why.hidden;
    if (m === muted) return;
    muted = m;
    clearTimeout(suspendTimer);
    if (!A.ctx) return;
    if (m) {
      master.gain.cancelScheduledValues(A.ctx.currentTime);
      master.gain.setTargetAtTime(0, A.ctx.currentTime, 0.12);
      suspendTimer = setTimeout(() => { if (muted && A.ctx) A.ctx.suspend().catch(() => {}); }, 600);
    } else {
      A.ctx.resume().catch(() => {});          // le volume remonte en douceur dans update()
    }
  }
  A.setPaused = function (p) { why.pause = !!p; applyMute(); };
  document.addEventListener('visibilitychange', () => { why.hidden = document.hidden; applyMute(); });
  A.update = function (dt, depth, fade) {
    if (!A.ok || muted) return;
    if (!built) A.start();
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime;
    curDepth = depth; curFade = fade;
    const vol = A.enabled ? clamp(A.volume, 0, 1) * clamp(fade, 0, 1) : 0;
    master.gain.setTargetAtTime(vol * 0.8, t, 0.6);

    const dd = smooth(0, 1500, depth), shallow = 1 - smooth(20, 500, depth);
    bedLP.frequency.setTargetAtTime(lerp(900, 260, dd), t, 2);           // le son s'assourdit en profondeur
    bedGain.gain.setTargetAtTime(lerp(0.30, 0.20, dd), t, 2);
    shimGain.gain.setTargetAtTime(0.06 * shallow, t, 2);
    padGain.gain.setTargetAtTime(lerp(0.10, 0.24, smooth(0, 1200, depth)), t, 3);
    padLP.frequency.setTargetAtTime(lerp(900, 420, dd), t, 3);

    if (vol < 0.01) return;
    tBubble -= dt; tBell -= dt; tWhale -= dt;
    if (tBubble <= 0) { bubble(); if (Math.random() < 0.4) setTimeout(bubble, 120 + Math.random() * 160); tBubble = rnd(2, 5.5) * (1 + dd * 1.2); }
    if (tBell <= 0) { bell(); tBell = rnd(8, 17); }
    if (tWhale <= 0) { if (depth > 700) whale(); tWhale = rnd(35, 75); }
  };
  window.Ambience = A;

  // les navigateurs exigent un geste de l'utilisateur pour démarrer le son (pas Wallpaper Engine)
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, () => A.unlock(), { passive: true }));
})();
