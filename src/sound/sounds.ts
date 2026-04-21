export type SoundName = "hit" | "miss" | "sink" | "win" | "lose";

/**
 * Procedural retro sound effects via Web Audio API. No external assets.
 * Each sound is a short envelope-shaped oscillator (or noise) burst.
 */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private enabled = true;

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  play(name: SoundName) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    switch (name) {
      case "hit":
        this.noiseBurst(ctx, now, 0.18, 0.35, "bandpass", 1200);
        this.tone(ctx, now, 0.2, "square", 220, 90, 0.35);
        break;
      case "miss":
        this.tone(ctx, now, 0.18, "sine", 340, 180, 0.2);
        this.noiseBurst(ctx, now + 0.02, 0.12, 0.12, "lowpass", 500);
        break;
      case "sink":
        this.tone(ctx, now, 0.35, "sawtooth", 180, 60, 0.4);
        this.tone(ctx, now + 0.12, 0.45, "square", 90, 40, 0.35);
        this.noiseBurst(ctx, now, 0.5, 0.25, "lowpass", 600);
        break;
      case "win":
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone(ctx, now + i * 0.12, 0.18, "square", f, f, 0.25),
        );
        break;
      case "lose":
        [330, 262, 208, 175].forEach((f, i) =>
          this.tone(ctx, now + i * 0.15, 0.22, "sawtooth", f, f, 0.25),
        );
        break;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    start: number,
    duration: number,
    type: OscillatorType,
    fromFreq: number,
    toFreq: number,
    gain: number,
  ) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), start + duration);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noiseBurst(
    ctx: AudioContext,
    start: number,
    duration: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
  ) {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    src.connect(bq).connect(amp).connect(ctx.destination);
    src.start(start);
    src.stop(start + duration + 0.02);
  }
}
