// Synthesised glass sounds and a microphone level meter. No audio files.

export class GlassSound {
  constructor() { this.ctx = null; this.on = true; }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (_) { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  out(gain) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.ctx.destination);
    return g;
  }

  partial(dest, freq, t, peak, decay) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest); o.start(t); o.stop(t + decay + 0.05);
  }

  noise(dest, t, dur, freq, q, peak) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q; g.gain.value = peak;
    src.connect(bp).connect(g).connect(dest); src.start(t);
  }

  // a knuckle on a pane: low thump plus a short ring
  knock(strength = 1) {
    if (!this.on || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime, out = this.out(0.35 * strength);
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.16);
    const detune = 1 + (Math.random() - 0.5) * 0.04;
    [2350, 3720, 5290].forEach((f, i) => this.partial(out, f * detune, t, 0.16 / (i + 1), 0.35 + 0.18 * (2 - i)));
    this.noise(out, t, 0.04, 2600, 1.2, 0.5);
  }

  // the pane gives way but the wire holds it: a crunch and a scatter of small rings
  crack() {
    if (!this.on || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime, out = this.out(0.5);
    this.noise(out, t, 0.5, 3400, 0.8, 1.4);
    this.noise(out, t, 0.25, 900, 0.9, 0.9);
    for (let i = 0; i < 14; i++) {
      const at = t + 0.02 + Math.random() * Math.random() * 0.6;
      this.partial(out, 3000 + Math.random() * 5000, at, 0.04 + Math.random() * 0.05, 0.12 + Math.random() * 0.25);
    }
  }
}

// Returns a level() function in 0..1 or throws if the browser refuses the microphone.
export async function openMic() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  src.connect(lp).connect(an);
  const buf = new Float32Array(an.fftSize);
  return {
    level() {
      an.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    },
    stop() { stream.getTracks().forEach(tr => tr.stop()); ctx.close().catch(() => {}); },
  };
}
