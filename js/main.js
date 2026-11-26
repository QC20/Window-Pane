import { VS, BG_FS, FOG_FS, GLASS_FS } from './shaders.js';
import { TEXTURES, MESHES, TINTS, SCENES, LIGHTS, LIGHT_LIST, PALETTES, PRESETS, hexToRgb } from './presets.js';
import { GlassSound, openMic } from './sound.js';

const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cv = $('#glass');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)').matches;
const embedded = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();

/* ---------- toast ---------- */
const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.classList.remove('fade');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add('fade');
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 400);
  }, ms);
}

const gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) {
  $('#nogl').hidden = false;
  cv.hidden = true;
  $('.dock').hidden = true;
} else {
  try { start(); } catch (err) {
    console.error(err);
    $('#nogl').textContent = 'The glass could not be drawn on this device.';
    $('#nogl').hidden = false;
    cv.hidden = true;
  }
}

function start() {
  /* ================= GL plumbing ================= */
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = fs => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name.replace('[0]', '')] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  };
  const P = { bg: program(BG_FS), fog: program(FOG_FS), glass: program(GLASS_FS) };

  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let halfFloat = !!gl.getExtension('EXT_color_buffer_float');
  function target(w, h, mip, fog) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (fog && halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && fog && halfFloat) { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); halfFloat = false; return target(w, h, mip, fog); }
    return { tex, fb, w, h };
  };
  const free = t => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } };
  const clearTarget = t => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };

  // texture for your own photo or camera
  const imgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imgTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([120, 120, 120, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let imgAsp = 1, imgMirror = 0;

  gl.useProgram(P.bg.p); gl.uniform1i(P.bg.u.uImg, 2);
  gl.useProgram(P.fog.p); gl.uniform1i(P.fog.u.uPrev, 3);
  gl.useProgram(P.glass.p); gl.uniform1i(P.glass.u.uBg, 0); gl.uniform1i(P.glass.u.uFog, 1);

  /* ================= sizing ================= */
  const MARGIN = 0.18;
  let W = 1, H = 1, cssW = 1, cssH = 1, dpr = 1, quality = 1, focal = 1000;
  let bgT = null, fogA = null, fogB = null;
  function resize() {
    cssW = Math.max(1, cv.clientWidth); cssH = Math.max(1, cv.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    W = Math.max(1, Math.round(cssW * dpr)); H = Math.max(1, Math.round(cssH * dpr));
    cv.width = W; cv.height = H; dpr = W / cssW;
    focal = Math.max(cssW, cssH);
    free(bgT);
    bgT = target(Math.max(2, Math.round(W * 0.5 * (1 + 2 * MARGIN))), Math.max(2, Math.round(H * 0.5 * (1 + 2 * MARGIN))), true, false);
    const fw = Math.max(2, Math.round(cssW / 4)), fh = Math.max(2, Math.round(cssH / 4));
    if (!fogA || fogA.w !== fw || fogA.h !== fh) {
      free(fogA); free(fogB);
      fogA = target(fw, fh, false, true); fogB = target(fw, fh, false, true);
      clearTarget(fogA); clearTarget(fogB);
    }
  }
  new ResizeObserver(resize).observe(cv);
  resize();

  const dock = $('.dock');
  new ResizeObserver(() => document.documentElement.style.setProperty('--dockH', dock.offsetHeight + 'px')).observe(dock);

  /* ================= state ================= */
  const FEEL = ['relief', 'frost', 'disp', 'dist', 'scale'];
  const S = {};
  let presetId = null;
  const feel = {};
  const live = {};
  let palette = new Float32Array(24);
  let meshFade = 1;

  const spring = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, twist: { x: 0, v: 0 } };
  const MAXT = 0.42;
  const stepSpring = (s, to, dt, k = 38, c = 6.5) => { s.v += (-k * (s.x - to) - c * s.v) * dt; s.x += s.v * dt; };
  let rot = rotation(0, 0);
  function rotation(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const X = [cy, 0, -sy], Y = [sy * sp, cp, cy * sp], N = [sy * cp, -sp, cy * cp];
    return { X, Y, N, m: new Float32Array([...X, ...Y, ...N]) };
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // screen point to flat coordinates on the turned pane (CSS px from its centre)
  function toLocal(clientX, clientY) {
    const r = cv.getBoundingClientRect();
    const sx = clientX - r.left - cssW / 2, sy = cssH / 2 - (clientY - r.top);
    const len = Math.hypot(sx, sy, focal), d = [sx / len, sy / len, -focal / len];
    const cast = N => { const t = -(N[2] * focal) / Math.min(dot(N, d), -1e-3); return [d[0] * t, d[1] * t, focal + d[2] * t]; };
    const tw = spring.twist.x * dot(cast(rot.N), rot.Y) / cssH, c = Math.cos(tw), s = Math.sin(tw);
    const N = rot.N.map((v, i) => v * c + rot.X[i] * s), X = rot.X.map((v, i) => v * c - rot.N[i] * s);
    const hit = cast(N);
    return [dot(hit, X), dot(hit, rot.Y)];
  }

  const sound = new GlassSound();
  const ripples = [], cracks = [], knocks = [];
  let clock = 0, simT = 0;
  let tool = 'hand';
  let drag = null;
  const ptr = { down: false, id: -1, type: 'mouse', sx: 0, sy: 0, t0: 0, moved: 0, local: [0, 0] };
  let hover = null, hoverLocal = null, spaceDown = false, fogPrev = null, stillFor = 0;
  let sunFollow = false, sunTarget = [0, 0];
  const sun = [0, 0];
  let gyro = null, gyroBase = null, mic = null, video = null, camStream = null;
  let decayAcc = 0, clearFog = false, snapPending = false;
  const seen = {};

  /* ================= UI ================= */
  const presetsEl = $('#presets');
  presetsEl.innerHTML = PRESETS.map(p =>
    `<button type="button" class="chip" data-preset="${p.id}" aria-pressed="false"><i style="background:conic-gradient(${p.swatch[0]} 0 34%,${p.swatch[1]} 0 67%,${p.swatch[2]} 0)"></i>${p.name}</button>`).join('');
  presetsEl.addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (b) applyPreset(b.dataset.preset); });

  const GROUPS = [
    { key: 'tex', label: 'Glass', items: TEXTURES },
    { key: 'mesh', label: 'Wire and lead', items: MESHES },
    { key: 'tint', label: 'Colour', items: TINTS },
    { key: 'pal', label: 'Cathedral palette', items: Object.entries(PALETTES).map(([v, p]) => ({ v, name: p.name, sw: p.colors.slice(0, 5) })) },
    { key: 'scene', label: 'Behind the glass', items: SCENES },
    { key: 'light', label: 'Light', items: LIGHT_LIST },
  ];
  const NUMERIC = new Set(['tex', 'mesh', 'tint', 'scene']);
  $('#groups').innerHTML = GROUPS.map(g => `<section><h3 id="h-${g.key}">${g.label}</h3><div class="seg" role="group" aria-labelledby="h-${g.key}" data-key="${g.key}">${
    g.items.map(it => `<button type="button" data-v="${it.v}" aria-pressed="false"${it.hidden ? ' hidden' : ''}>${it.sw ? `<span class="sw">${it.sw.map(c => `<b style="background:${c}"></b>`).join('')}</span>` : ''}${it.name}</button>`).join('')
  }</div></section>`).join('');
  $('#groups').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const key = b.parentElement.dataset.key, v = NUMERIC.has(key) ? +b.dataset.v : b.dataset.v;
    if (key === 'scene' && v !== 6) stopCam();
    if (key === 'mesh' || key === 'tex') meshFade = 0;
    S[key] = v; presetId = null; syncUI();
  });

  const SLIDERS = [
    { key: 'twistRest', label: 'Twist', min: -0.6, max: 0.6, step: 0.01, fmt: v => `${Math.round(v * 57.3)}°` },
    { key: 'relief', label: 'Relief', min: 0.2, max: 2, step: 0.01, fmt: v => v.toFixed(2) },
    { key: 'frost', label: 'Frost', min: 0, max: 4, step: 0.05, fmt: v => v.toFixed(1) },
    { key: 'disp', label: 'Colour split', min: 0, max: 8, step: 0.1, fmt: v => v.toFixed(1) },
    { key: 'dist', label: 'Depth behind the glass', min: 10, max: 220, step: 1, fmt: v => `${Math.round(v)} px` },
    { key: 'scale', label: 'Wire and lead spacing', min: 14, max: 60, step: 1, fmt: v => `${Math.round(v)} px` },
  ];
  $('#sliders').innerHTML = SLIDERS.map(s => `<label>${s.label}<output id="o-${s.key}"></output><input type="range" id="s-${s.key}" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('');
  $('#sliders').addEventListener('input', e => {
    const k = e.target.dataset.key; if (!k) return;
    S[k] = +e.target.value; presetId = null; syncUI();
  });

  function syncUI() {
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.preset === presetId)));
    document.querySelectorAll('#groups .seg').forEach(seg => {
      const key = seg.dataset.key;
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(String(S[key]) === b.dataset.v)));
    });
    for (const s of SLIDERS) { $('#s-' + s.key).value = S[s.key]; $('#o-' + s.key).textContent = s.fmt(S[s.key]); }
    palette = new Float32Array(PALETTES[S.pal].colors.flatMap(hexToRgb));
  }

  function applyPreset(id, announce = true) {
    const p = PRESETS.find(x => x.id === id) || PRESETS[0];
    presetId = p.id;
    for (const k of ['scene', 'tex', 'mesh', 'tint', 'light', 'pal', 'twistRest', ...FEEL]) S[k] = p[k];
    stopCam();
    meshFade = 0;
    sunFollow = false;
    ripples.push({ x: 0, y: 0, t0: clock, s: 0.7 }); if (ripples.length > 4) ripples.shift();
    syncUI();
    try { history.replaceState(null, '', '#' + p.id); } catch (_) {}
    if (announce) toast(p.name, 1500);
    const chip = presetsEl.querySelector(`[data-preset="${p.id}"]`);
    if (chip && announce) chip.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  const stepPreset = dir => {
    const i = PRESETS.findIndex(p => p.id === presetId);
    applyPreset(PRESETS[(i + dir + PRESETS.length) % PRESETS.length].id);
  };

  /* tools */
  const HINTS = {
    hand: coarse ? 'Drag to turn the glass. Tap to move the light.' : 'Drag to turn the glass. Scroll to twist it.',
    sun: coarse ? 'Drag to move the light.' : 'Move to steer the light. It stays where you leave it.',
    breath: 'Hold still to breathe on the glass, then drag to draw in the fog.',
    knock: 'Tap to knock. Three quick knocks in one spot crack it.',
  };
  function setTool(t, announce = true) {
    tool = t; cv.dataset.tool = t;
    document.querySelectorAll('[data-tool]').forEach(b => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
    if (announce) toast(HINTS[t], 3800);
  }
  document.querySelector('.tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });

  const studio = $('#studio'), studioBtn = $('#studioBtn');
  const toggleStudio = (open = studio.hidden) => { studio.hidden = !open; studioBtn.setAttribute('aria-expanded', String(open)); };
  studioBtn.addEventListener('click', () => toggleStudio());
  $('#studioClose').addEventListener('click', () => toggleStudio(false));

  function mend() {
    cracks.length = 0; knocks.length = 0; clearFog = true;
    ripples.push({ x: 0, y: 0, t0: clock, s: 0.5 }); if (ripples.length > 4) ripples.shift();
    toast('A fresh pane', 1400);
  }
  $('#mendBtn').addEventListener('click', mend);

  /* ================= bring your own ================= */
  const yourImageBtn = () => document.querySelector('#groups [data-key="scene"] [data-v="6"]');
  function useImage(source, w, h, mirror) {
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    imgAsp = w / h; imgMirror = mirror; S.scene = 6; presetId = null;
    yourImageBtn().hidden = false;
    syncUI();
  }
  async function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) { toast('That is not an image.'); return; }
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      stopCam();
      useImage(c, c.width, c.height, 0);
      toast('Your image is behind the glass now.');
    } catch (_) { toast('That image could not be read.'); }
  }
  const photoInput = $('#photoInput');
  $('#photoBtn').addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => { loadImageFile(photoInput.files[0]); photoInput.value = ''; });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragover'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragover'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragover'); loadImageFile(e.dataTransfer.files[0]); });

  function stopCam() {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = null; video = null;
    $('#camBtn').setAttribute('aria-pressed', 'false');
  }
  $('#camBtn').addEventListener('click', async () => {
    if (camStream) { stopCam(); if (S.scene === 6) { S.scene = 0; syncUI(); } return; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.srcObject = camStream;
      await video.play();
      useImage(video, video.videoWidth || 16, video.videoHeight || 9, 1);
      $('#camBtn').setAttribute('aria-pressed', 'true');
      toast('That is you behind the glass.');
    } catch (_) {
      stopCam();
      toast('The camera is blocked here. Allow it, or open the GitHub Pages version.', 4500);
    }
  });

  $('#micBtn').addEventListener('click', async () => {
    const b = $('#micBtn');
    if (mic) { mic.stop(); mic = null; b.setAttribute('aria-pressed', 'false'); return; }
    try {
      mic = await openMic();
      b.setAttribute('aria-pressed', 'true');
      toast('Blow on your microphone and the glass fogs up.', 4000);
    } catch (_) { toast('The microphone is blocked here. Allow it, or open the GitHub Pages version.', 4500); }
  });

  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!gyroBase) gyroBase = { b: e.beta, g: e.gamma };
    gyro.yaw = clamp((e.gamma - gyroBase.g) / 35, -1, 1) * 0.38;
    gyro.pitch = clamp((e.beta - gyroBase.b) / 35, -1, 1) * 0.38;
  }
  $('#gyroBtn').addEventListener('click', async () => {
    const b = $('#gyroBtn');
    if (gyro) { removeEventListener('deviceorientation', onOrient); gyro = null; b.setAttribute('aria-pressed', 'false'); return; }
    try {
      if (typeof DeviceOrientationEvent === 'undefined') throw new Error('none');
      if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('denied');
      gyro = { yaw: 0, pitch: 0 }; gyroBase = null;
      addEventListener('deviceorientation', onOrient);
      b.setAttribute('aria-pressed', 'true');
      toast('Tilt your phone to turn the glass.');
      setTimeout(() => { if (gyro && !gyroBase) toast('No tilt sensor is reporting here.', 3500); }, 1800);
    } catch (_) { toast('Phone tilt is not available here.'); }
  });

  const snapBtn = $('#snapBtn');
  if (embedded) snapBtn.hidden = true;
  snapBtn.addEventListener('click', () => { snapPending = true; });
  $('#linkBtn').addEventListener('click', () => {
    const url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copied.'), () => toast(url, 6000));
    else toast(url, 6000);
  });
  $('#soundBtn').addEventListener('click', () => { sound.on = !sound.on; $('#soundBtn').setAttribute('aria-pressed', String(sound.on)); });

  /* ================= hands on the glass ================= */
  const aimSun = (x, y) => {
    const r = cv.getBoundingClientRect();
    sunTarget = [(x - r.left) / cssW, 1 - (y - r.top) / cssH];
    sunFollow = true;
  };

  function knock(loc) {
    ripples.push({ x: loc[0], y: loc[1], t0: clock, s: 1 }); if (ripples.length > 4) ripples.shift();
    sound.knock(1);
    knocks.push({ x: loc[0], y: loc[1], t: clock });
    while (knocks.length && clock - knocks[0].t > 1.8) knocks.shift();
    const near = knocks.filter(k => Math.hypot(k.x - loc[0], k.y - loc[1]) < 110).length;
    if (near >= 3) {
      cracks.push({ x: loc[0], y: loc[1], t0: clock, seed: Math.random() * 97 }); if (cracks.length > 6) cracks.shift();
      knocks.length = 0;
      ripples.push({ x: loc[0], y: loc[1], t0: clock, s: 1.8 }); if (ripples.length > 4) ripples.shift();
      sound.crack();
      if (!seen.crack) { seen.crack = 1; toast('Cracked. The wire holds it together. Mend gives you a new pane.', 4200); }
    } else if (!seen.knock) { seen.knock = 1; toast('Knock twice more in the same spot.', 2400); }
  }

  cv.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    cv.focus({ preventScroll: true });
    Object.assign(ptr, { down: true, id: e.pointerId, type: e.pointerType, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: 0 });
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    ptr.local = toLocal(e.clientX, e.clientY);
    if (tool === 'hand') {
      drag = { x: e.clientX, y: e.clientY, yaw: spring.yaw.x, pitch: spring.pitch.x, t: performance.now() };
      spring.yaw.v = spring.pitch.v = 0;
    } else if (tool === 'sun') aimSun(e.clientX, e.clientY);
    else if (tool === 'knock') knock(ptr.local);
    else if (tool === 'breath') { fogPrev = ptr.local.slice(); stillFor = 0; }
  });
  cv.addEventListener('pointermove', e => {
    if (ptr.down && e.pointerId === ptr.id) {
      ptr.moved = Math.max(ptr.moved, Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy));
      if (tool === 'hand' && drag) {
        const now = performance.now(), k = 1.5 / Math.max(cssW, cssH);
        const yaw = clamp(drag.yaw + (e.clientX - drag.x) * k, -MAXT, MAXT);
        const pitch = clamp(drag.pitch + (e.clientY - drag.y) * k, -MAXT, MAXT);
        const dt = Math.max(1e-3, (now - drag.t) / 1000);
        spring.yaw.v = spring.yaw.v * 0.5 + 0.5 * (yaw - spring.yaw.x) / dt;
        spring.pitch.v = spring.pitch.v * 0.5 + 0.5 * (pitch - spring.pitch.x) / dt;
        spring.yaw.x = yaw; spring.pitch.x = pitch; drag.t = now;
      } else if (tool === 'sun') aimSun(e.clientX, e.clientY);
      else if (tool === 'breath') ptr.local = toLocal(e.clientX, e.clientY);
    } else if (e.pointerType === 'mouse') {
      if (tool === 'sun') aimSun(e.clientX, e.clientY);
      const r = cv.getBoundingClientRect();
      hover = [(e.clientX - r.left) / cssW, 1 - (e.clientY - r.top) / cssH];
      hoverLocal = toLocal(e.clientX, e.clientY);
    }
  });
  const release = e => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.down = false;
    if (tool === 'hand') {
      drag = null;
      spring.yaw.v = clamp(spring.yaw.v, -4, 4); spring.pitch.v = clamp(spring.pitch.v, -4, 4);
      if (ptr.type !== 'mouse' && ptr.moved < 8 && performance.now() - ptr.t0 < 320) aimSun(e.clientX, e.clientY);
    }
    fogPrev = null;
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse' || ptr.down) return;
    hover = null; hoverLocal = null;
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    spring.twist.v = clamp(spring.twist.v - dy * 0.004, -6, 6);
  }, { passive: false });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const onGlass = e.target === document.body || e.target === cv;
    const k = e.key;
    if (k >= '1' && k <= '4') setTool(['hand', 'sun', 'breath', 'knock'][+k - 1]);
    else if (k === ' ' && onGlass) { spaceDown = true; e.preventDefault(); }
    else if (k === 'ArrowLeft') { spring.yaw.v -= 1.4; e.preventDefault(); }
    else if (k === 'ArrowRight') { spring.yaw.v += 1.4; e.preventDefault(); }
    else if (k === 'ArrowUp') { spring.pitch.v -= 1.4; e.preventDefault(); }
    else if (k === 'ArrowDown') { spring.pitch.v += 1.4; e.preventDefault(); }
    else if (k === '[') spring.twist.v -= 1.5;
    else if (k === ']') spring.twist.v += 1.5;
    else if (k === ',') stepPreset(-1);
    else if (k === '.') stepPreset(1);
    else if (k === 's' || k === 'S') toggleStudio();
    else if (k === 'm' || k === 'M') mend();
    else if (k === 'Escape') toggleStudio(false);
  });
  addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
  addEventListener('blur', () => { spaceDown = false; });

  addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h && h !== presetId && PRESETS.some(p => p.id === h)) applyPreset(h);
  });

  /* ================= start-up ================= */
  const h0 = location.hash.slice(1);
  applyPreset(PRESETS.some(p => p.id === h0) ? h0 : PRESETS[0].id, false);
  for (const k of FEEL) feel[k] = S[k];
  const LT0 = LIGHTS[S.light];
  for (const k of Object.keys(LT0)) live[k] = Array.isArray(LT0[k]) ? LT0[k].slice() : LT0[k];
  sun[0] = LT0.sunPos[0]; sun[1] = LT0.sunPos[1]; sunTarget = sun.slice();
  meshFade = 1; ripples.length = 0;
  setTool('hand', false);
  setTimeout(() => toast(HINTS.hand, 4200), 600);

  /* ================= frame ================= */
  const rippleArr = new Float32Array(16), crackArr = new Float32Array(24);
  let last = performance.now(), frames = 0, slow = 0, running = true;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    clock += dt; simT += dt * (reduce.matches ? 0.25 : 1);

    // ease light, feel and the pane
    const LT = LIGHTS[S.light], kl = 1 - Math.exp(-dt * 4), kf = 1 - Math.exp(-dt * 6);
    for (const k of Object.keys(LT)) {
      if (Array.isArray(LT[k])) for (let i = 0; i < LT[k].length; i++) live[k][i] += (LT[k][i] - live[k][i]) * kl;
      else live[k] += (LT[k] - live[k]) * kl;
    }
    for (const k of FEEL) feel[k] += (S[k] - feel[k]) * kf;
    meshFade = Math.min(1, meshFade + dt * 2.2);
    if (!drag) {
      // the pane leans a little toward a hovering hand, or follows the phone
      const lean = tool === 'hand' && hover ? [-(hover[0] - 0.5) * 0.14, (hover[1] - 0.5) * 0.14] : [0, 0];
      stepSpring(spring.yaw, gyro ? gyro.yaw : lean[0], dt);
      stepSpring(spring.pitch, gyro ? gyro.pitch : lean[1], dt);
      spring.yaw.x = clamp(spring.yaw.x, -0.6, 0.6); spring.pitch.x = clamp(spring.pitch.x, -0.6, 0.6);
    }
    stepSpring(spring.twist, S.twistRest, dt, 26, 5);
    spring.twist.x = clamp(spring.twist.x, -1.4, 1.4);
    rot = rotation(spring.yaw.x, spring.pitch.x);

    if (!sunFollow) {
      const hp = live.sunPos;
      sunTarget = reduce.matches ? hp.slice() : [hp[0] + 0.05 * Math.sin(simT * 0.13), hp[1] + 0.07 * Math.sin(simT * 0.17 + 1)];
    }
    const ks = 1 - Math.exp(-dt * 5);
    sun[0] += (sunTarget[0] - sun[0]) * ks; sun[1] += (sunTarget[1] - sun[1]) * ks;

    // breath and wiping
    let breath = 0, wipe = 0, a = null, b = null;
    if (tool === 'breath' && ptr.down) {
      const cur = ptr.local, prev = fogPrev || cur;
      if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 0.8) { wipe = 1; a = prev; b = cur; stillFor = 0; }
      else { stillFor += dt; if (stillFor > 0.18) { breath = dt * 1.3; a = b = cur; } }
      fogPrev = cur.slice();
      if (!seen.fog && stillFor > 0.9) { seen.fog = 1; toast('Now drag to draw in it.', 2600); }
    }
    if (!a && spaceDown) { const p = hoverLocal || [0, 0]; breath = dt * 1.3; a = b = p; }
    if (!a && mic) {
      const lv = mic.level();
      if (lv > 0.03) { const p = hoverLocal || ptr.local || [0, 0]; breath = Math.min(0.08, (lv - 0.03) * dt * 30); a = b = p; }
    }
    const fu = p => [p[0] / cssW + 0.5, p[1] / cssH + 0.5];
    const fa = a ? fu(a) : [-9, -9], fb = b ? fu(b) : [-9, -9];
    const rate = dt / 26;
    let decay = rate;
    if (!halfFloat) { decayAcc += rate; if (decayAcc >= 1.6 / 255) { decay = decayAcc; decayAcc = 0; } else decay = 0; }

    // impacts
    while (ripples.length && clock - ripples[0].t0 > 2.5) ripples.shift();
    rippleArr.fill(0); crackArr.fill(0);
    ripples.forEach((r, i) => rippleArr.set([r.x, r.y, clock - r.t0, r.s], i * 4));
    cracks.forEach((c, i) => crackArr.set([c.x, c.y, clock - c.t0, c.seed], i * 4));

    // 1. the world behind the glass
    gl.bindFramebuffer(gl.FRAMEBUFFER, bgT.fb); gl.viewport(0, 0, bgT.w, bgT.h);
    gl.useProgram(P.bg.p);
    let u = P.bg.u;
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, imgTex);
    if (video && video.readyState >= 2 && S.scene === 6) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      if (video.videoWidth) imgAsp = video.videoWidth / video.videoHeight;
    }
    gl.uniform2f(u.uRes, bgT.w, bgT.h); gl.uniform1f(u.uTime, simT);
    gl.uniform2f(u.uLight, sun[0], sun[1]);
    gl.uniform2f(u.uPar, (sun[0] - live.sunPos[0]) * -0.04, (sun[1] - live.sunPos[1]) * -0.04);
    gl.uniform1f(u.uMargin, MARGIN); gl.uniform1i(u.uScene, S.scene);
    gl.uniform3fv(u.uSunCol, live.sunCol); gl.uniform1f(u.uSunPow, live.sunPow);
    gl.uniform3fv(u.uGrade, live.grade); gl.uniform1f(u.uExpo, live.expo);
    gl.uniform1f(u.uImgAsp, imgAsp); gl.uniform1f(u.uMirror, imgMirror);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgT.tex); gl.generateMipmap(gl.TEXTURE_2D);

    // 2. breath
    gl.bindFramebuffer(gl.FRAMEBUFFER, fogB.fb); gl.viewport(0, 0, fogB.w, fogB.h);
    gl.useProgram(P.fog.p);
    u = P.fog.u;
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, fogA.tex);
    gl.uniform2f(u.uRes, fogB.w, fogB.h); gl.uniform1f(u.uAsp, cssW / cssH);
    gl.uniform4f(u.uSeg, fa[0], fa[1], fb[0], fb[1]);
    gl.uniform1f(u.uBreath, breath); gl.uniform1f(u.uBreathR, 130 / cssH);
    gl.uniform1f(u.uWipe, wipe); gl.uniform1f(u.uFinger, 15 / cssH);
    gl.uniform1f(u.uDecay, decay); gl.uniform1f(u.uClear, clearFog ? 1 : 0); gl.uniform1f(u.uTime, simT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    clearFog = false;
    [fogA, fogB] = [fogB, fogA];

    // 3. the pane
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(P.glass.p);
    u = P.glass.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgT.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fogA.tex);
    gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uTime, simT);
    gl.uniform2f(u.uLight, sun[0], sun[1]);
    gl.uniform3fv(u.uGlintCol, live.glintCol); gl.uniform1f(u.uGlint, live.glint);
    gl.uniformMatrix3fv(u.uRot, false, rot.m); gl.uniform1f(u.uTwist, spring.twist.x);
    gl.uniform1f(u.uFocal, focal); gl.uniform1f(u.uDist, feel.dist); gl.uniform1f(u.uThick, 8); gl.uniform1f(u.uMargin, MARGIN);
    gl.uniform1i(u.uTex, S.tex); gl.uniform1i(u.uMesh, S.mesh); gl.uniform1i(u.uTint, S.tint);
    gl.uniform1f(u.uScale, feel.scale); gl.uniform1f(u.uRelief, feel.relief); gl.uniform1f(u.uFrost, feel.frost);
    gl.uniform1f(u.uDisp, feel.disp); gl.uniform1f(u.uMeshOn, meshFade * meshFade * (3 - 2 * meshFade));
    gl.uniform3fv(u.uPal, palette);
    gl.uniform1f(u.uWireLit, live.wireLit); gl.uniform3fv(u.uEnvCol, live.envCol);
    gl.uniform1f(u.uEnvWin, live.envWin); gl.uniform1f(u.uEnvLamp, live.envLamp);
    gl.uniform4fv(u.uCracks, crackArr); gl.uniform1i(u.uCrackN, cracks.length);
    gl.uniform4fv(u.uRipples, rippleArr); gl.uniform1i(u.uRippleN, ripples.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (snapPending) {
      snapPending = false;
      cv.toBlob(blob => {
        if (!blob) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `window-pane-${presetId || 'custom'}.png`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      }, 'image/png');
    }

    // step the resolution down if this device struggles
    frames++; slow += dt;
    if (frames === 50) {
      if (slow / frames > 0.026 && quality > 0.5) { quality *= 0.82; resize(); }
      frames = 0; slow = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; });
  cv.addEventListener('webglcontextrestored', () => location.reload());

  // handy for testing from the console
  window.windowPane = { applyPreset, setTool, knock: (x = 0, y = 0) => knock([x, y]), spring, S, toLocal, mend };
}
