// Procedural audio: everything is synthesised with the Web Audio API.
export interface Volumes { master: number; detector: number; effects: number; ambience: number; muted: boolean; }
export class Sound {
  ctx: AudioContext | null = null; vol: Volumes = { master: 0.7, detector: 0.8, effects: 0.7, ambience: 0.35, muted: false };
  private master!: GainNode; private detG!: GainNode; private fxG!: GainNode; private ambG!: GainNode;
  private osc: OscillatorNode | null = null; private oscG: GainNode | null = null; private osc2: OscillatorNode | null = null;
  private noiseBuf: AudioBuffer | null = null; private wind: { src: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode } | null = null; private surf: { g: GainNode } | null = null; private rain: GainNode | null = null;
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return; }
    const c = this.ctx; this.master = c.createGain(); this.detG = c.createGain(); this.fxG = c.createGain(); this.ambG = c.createGain();
    this.detG.connect(this.master); this.fxG.connect(this.master); this.ambG.connect(this.master); this.master.connect(c.destination); this.applyVol();
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = this.noiseBuf.getChannelData(0); let b0 = 0; for (let i = 0; i < len; i++) { const wn = Math.random() * 2 - 1; b0 = 0.97 * b0 + 0.03 * wn; d[i] = wn * 0.5 + b0 * 3; }
    // ambience: wind (always), surf and rain (set per location)
    const mk = (type: BiquadFilterType, freq: number, q = 0.7) => { const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.ambG); src.start(); return { src, f, g }; };
    this.wind = mk('lowpass', 420); const s = mk('bandpass', 700, 0.4); this.surf = { g: s.g }; const r = mk('highpass', 3200, 0.5); this.rain = r.g;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(this.wind.f.frequency); lfo.start();
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.09; const lg2 = c.createGain(); lg2.gain.value = 0.03; lfo2.connect(lg2); lg2.connect(s.g.gain); lfo2.start();
    // detector voice
    this.osc = c.createOscillator(); this.osc.type = 'sine'; this.osc2 = c.createOscillator(); this.osc2.type = 'triangle'; this.oscG = c.createGain(); this.oscG.gain.value = 0;
    this.osc.frequency.value = 300; this.osc2.frequency.value = 600; const g2 = c.createGain(); g2.gain.value = 0.25; this.osc.connect(this.oscG); this.osc2.connect(g2); g2.connect(this.oscG); this.oscG.connect(this.detG); this.osc.start(); this.osc2.start();
  }
  applyVol() { if (!this.ctx) return; const m = this.vol.muted ? 0 : this.vol.master; this.master.gain.value = m; this.detG.gain.value = this.vol.detector; this.fxG.gain.value = this.vol.effects; this.ambG.gain.value = this.vol.ambience; }
  setAmbience(o: { wind: number; surf: number; rain: number }) { if (!this.ctx) return; const t = this.ctx.currentTime; this.wind!.g.gain.setTargetAtTime(0.05 + o.wind * 0.18, t, 0.8); this.surf!.g.gain.setTargetAtTime(o.surf * 0.12, t, 0.8); this.rain!.gain.setTargetAtTime(o.rain * 0.12, t, 0.8); }
  /** continuous detector tone: strength 0..1 and pitch in Hz; 0 strength silences it */
  detect(strength: number, hz: number, iron: boolean) {
    if (!this.ctx || !this.osc) return; const t = this.ctx.currentTime;
    this.oscG!.gain.setTargetAtTime(strength > 0.002 ? Math.min(0.55, 0.06 + strength * 0.7) : 0, t, 0.025);
    if (strength > 0) { this.osc.frequency.setTargetAtTime(hz, t, 0.03); this.osc2!.frequency.setTargetAtTime(iron ? hz * 0.5 : hz * 2.01, t, 0.03); this.osc.type = iron ? 'sawtooth' : 'sine'; }
  }
  crackle(level: number) { if (!this.ctx || !this.noiseBuf || level <= 0.02 || Math.random() > level * 0.5) return; this.noiseHit(0.03 + Math.random() * 0.04, 2400 + Math.random() * 3000, 0.04 * level + 0.01, 'highpass'); }
  private noiseHit(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass', dest?: AudioNode) { const c = this.ctx!; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); const t = c.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); s.connect(f); f.connect(g); g.connect(dest ?? this.fxG); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  private tone(freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine', dest?: AudioNode) { const c = this.ctx!; const o = c.createOscillator(); o.type = type; o.frequency.value = freq; const g = c.createGain(); const t = c.currentTime + delay; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0004, t + dur); o.connect(g); g.connect(dest ?? this.fxG); o.start(t); o.stop(t + dur + 0.05); }
  dig() { if (!this.ctx) return; this.noiseHit(0.18, 260, 0.5, 'lowpass'); setTimeout(() => this.ctx && this.noiseHit(0.22, 900, 0.18, 'bandpass'), 90); setTimeout(() => this.ctx && this.noiseHit(0.1, 200, 0.4), 260); }
  scrape() { if (this.ctx) this.noiseHit(0.12, 1800, 0.09, 'bandpass'); }
  click() { if (this.ctx) this.tone(660, 0.05, 0.05, 0, 'triangle'); }
  coin() { if (!this.ctx) return; this.tone(1568, 0.25, 0.1); this.tone(2093, 0.4, 0.08, 0.07); }
  recover(tier: number) {
    if (!this.ctx) return; if (tier <= 0) { this.tone(520, 0.12, 0.08, 0, 'triangle'); return; }
    if (tier === 1) { this.tone(523, 0.18, 0.1); this.tone(659, 0.25, 0.1, 0.09); return; }
    if (tier === 2) { [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 0.11, i * 0.1)); return; }
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 1.4, 0.1, i * 0.13)); this.noiseHit(1.5, 5000, 0.05, 'highpass');
  }
  splash() { if (this.ctx) this.noiseHit(0.5, 1200, 0.3, 'bandpass'); }
  buy() { if (!this.ctx) return; this.tone(880, 0.1, 0.08, 0, 'triangle'); this.tone(1175, 0.2, 0.08, 0.08, 'triangle'); }
  deny() { if (this.ctx) { this.tone(200, 0.2, 0.1, 0, 'sawtooth'); } }
  pinpoint(prox: number) { if (this.ctx && prox > 0) this.tone(900 + prox * 900, 0.05, 0.08, 0, 'square'); }
}
