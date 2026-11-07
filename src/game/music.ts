// The live game's soundtrack: an original funky arcade chiptune with a hip-hop edge, played live with Web Audio (no
// files, nothing to license). NES-style voices: a bouncing triangle bass, a fast 16th-note arpeggio, pulse-wave
// stabs and lead, a punchy boom-bap noise kit, plus a record scratch and a sneaker squeak. A 16-bar song that loops:
// groove intro, verse, bridge, verse.
import { audio } from "../ui/sound.ts";

const BPM = 112;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const SWING = 0.07; // the off 16ths land this share of a step late: a little bounce, still driving
const VOLUME = 0.22;
const LOOK_AHEAD = 0.12; // schedule this far ahead (seconds)
const MUTE_KEY = "s5p-music-off-v1";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A chord: bass root (MIDI), the stab voicing, and a one-bar lead line (16 steps; a number starts a note, null holds). */
type Bar = { root: number; stab: number[]; lead: (number | null)[] };
const _ = null;
const A: Bar[] = [
  { root: 45, stab: [60, 64, 67, 71], lead: [76, _, _, 74, _, 72, _, _, 69, _, 72, _, _, _, _, _] }, // Am9
  { root: 38, stab: [60, 64, 66, 69], lead: [_, _, 72, 74, _, 76, _, 74, _, 72, _, 69, _, _, _, _] }, // D9
  { root: 41, stab: [60, 64, 65, 69], lead: [72, _, _, _, 76, _, _, 77, _, 76, _, 74, _, 72, _, _] }, // Fmaj7
  { root: 40, stab: [56, 62, 67], lead: [71, _, _, _, 68, _, _, _, 71, _, 74, _, 76, _, _, _] }, // E7#9
];
const B: Bar[] = [
  { root: 38, stab: [60, 64, 65, 69], lead: [_, _, 77, _, 76, _, 74, _, 72, _, _, _, 74, _, _, _] }, // Dm9
  { root: 43, stab: [59, 64, 65], lead: [76, _, _, 74, _, 71, _, _, 67, _, _, _, _, _, _, _] }, // G13
  { root: 48, stab: [59, 62, 64, 67], lead: [_, _, 71, 72, _, 74, _, 76, _, 79, _, _, 76, _, _, _] }, // Cmaj9
  { root: 40, stab: [56, 62, 64], lead: [74, _, _, _, 71, _, 68, _, 64, _, _, _, _, _, _, _] }, // E7
];
/** The song: [bars, lead on?] — the intro is groove only. */
const SONG: [Bar[], boolean][] = [[A, false], [A, true], [B, true], [A, true]];
const BARS = SONG.flatMap(([bars, lead]) => bars.map((bar) => ({ bar, lead })));

// The groove, in 16th-note steps. Bass: semitones above the root (null = rest); step 15 walks into the next chord.
const BASS: (number | null)[][] = [
  [0, _, 12, 0, _, 0, 12, _, 0, _, 12, 0, 10, _, 12, _], // octave bounce
  [0, _, 12, _, 0, 12, _, 10, _, 7, _, 0, 3, _, 5, _],
];
const STABS = [6, 14]; // "and" of 2 and 4, on top of the arpeggio
const KICK = [0, 3, 8, 10]; // boom-bap: 1, the "a" of 1, 3, and of 3
const SNARE = [4, 12];
const GHOST = [7, 15]; // quiet snares
const OPEN_HAT = [6, 14];

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private waves: Record<"lead" | "stab", PeriodicWave> | null = null;
  private timer = 0;
  private step = 0;
  private next = 0;
  private on = false;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      // storage blocked: music stays on
    }
  }

  start() {
    if (this.on || !this.setup()) return;
    const ctx = this.ctx!;
    void ctx.resume();
    this.on = true;
    this.next = ctx.currentTime + 0.05;
    this.master!.gain.setValueAtTime(this.muted ? 0 : VOLUME, ctx.currentTime);
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  /** Stop scheduling and fade out what's already queued. */
  stop() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    const ctx = this.ctx!;
    this.master!.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      // not saved; fine for this visit
    }
    if (this.ctx && this.master && this.on) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.03);
    return !this.muted;
  }

  private setup() {
    if (this.ctx) return true;
    const ctx = audio();
    if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // a compressor glues the mix together and makes the drums hit harder
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 4;
    glue.attack.value = 0.005;
    glue.release.value = 0.12;
    const makeUp = ctx.createGain();
    makeUp.gain.value = 1.6;
    this.master.connect(glue).connect(makeUp).connect(ctx.destination);
    // white noise for the drums
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1; // a fixed noise pattern (no Math.random needed)
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    // narrow pulse waves, the NES sound: 25% for the lead, 12.5% for the stabs
    const pulse = (duty: number) => {
      const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      return ctx.createPeriodicWave(real, imag);
    };
    this.waves = { lead: pulse(0.25), stab: pulse(0.125) };
    return true;
  }

  private tick() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + LOOK_AHEAD) {
      const s = this.step % 16;
      this.play(this.step, this.next + (s % 2 ? SWING * STEP : 0));
      this.next += STEP;
      this.step = (this.step + 1) % (BARS.length * 16);
    }
  }

  private play(step: number, t: number) {
    const barNo = Math.floor(step / 16), s = step % 16;
    const { bar, lead } = BARS[barNo];
    const nextBar = BARS[(barNo + 1) % BARS.length].bar;

    // bass: the groove line, walking chromatically into the next chord on the last 16th
    const line = BASS[barNo % 2];
    const off = s === 15 ? nextBar.root - 1 - bar.root : line[s];
    if (off != null) {
      const holds = s < 15 && line[s + 1] == null ? 2 : 1;
      this.tone("triangle", hz(bar.root + off), t, STEP * holds * 0.85, 0.55);
    }

    // the arcade arpeggio: up through the chord an octave higher, a note every 16th
    const arp = [...bar.stab, ...bar.stab.slice(1, -1).reverse()]; // up and back down
    this.tone("stab", hz(arp[s % arp.length] + 12), t, STEP * 0.5, 0.045, 4200);
    // chord stabs on the offbeats
    if (STABS.includes(s)) for (const m of bar.stab) this.tone("stab", hz(m), t, STEP * 0.6, 0.06, 2600);

    // lead melody, each note held until the next one (or 6 steps at most)
    const m = bar.lead[s];
    if (lead && m != null) {
      let len = 1;
      while (s + len < 16 && bar.lead[s + len] == null && len < 6) len++;
      this.tone("lead", hz(m), t, STEP * len * 0.9, 0.13, 3600, true);
    }

    // drums: boom-bap, with a snare fill at the end of the song
    const fill = barNo === BARS.length - 1 && s >= 12;
    if (KICK.includes(s)) this.kick(t);
    if (fill) this.snare(t, 0.45 + (s - 12) * 0.12);
    else if (SNARE.includes(s)) this.snare(t, 0.75);
    else if (GHOST.includes(s)) this.snare(t, 0.12);
    if (OPEN_HAT.includes(s)) this.hat(t, 0.14, 0.12);
    else this.hat(t, s % 4 === 0 ? 0.12 : s % 2 ? 0.05 : 0.08, 0.025); // every 16th, accented on the beat

    // the hip-hop basketball bits: a record scratch closing every 4-bar phrase, a sneaker squeak now and then
    if (barNo % 4 === 3 && (s === 12 || s === 14)) this.scratch(t);
    if (barNo % 4 === 1 && s === 7) this.squeak(t);
  }

  /** A "wika" scratch: a noise burst through a filter sweeping up then down, like a record pushed and pulled. */
  private scratch(t: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = this.noise;
    f.type = "bandpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + STEP * 0.7);
    f.frequency.exponentialRampToValueAtTime(500, t + STEP * 1.6);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.01);
    env.gain.setValueAtTime(0.5, t + STEP * 1.4);
    env.gain.linearRampToValueAtTime(0, t + STEP * 1.8);
    src.connect(f).connect(env).connect(this.master!);
    src.start(t, 0.3);
    src.stop(t + STEP * 2);
  }

  /** A sneaker squeak on the hardwood: a quick, high, wobbling chirp. */
  private squeak(t: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(2300, t);
    osc.frequency.linearRampToValueAtTime(3100, t + 0.04);
    osc.frequency.linearRampToValueAtTime(2600, t + 0.09);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.03, t + 0.01);
    env.gain.linearRampToValueAtTime(0, t + 0.1);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  private tone(kind: "triangle" | "lead" | "stab", freq: number, t: number, len: number, vol: number, cutoff = 0, vibrato = false) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), env = ctx.createGain();
    if (kind === "triangle") osc.type = "triangle";
    else osc.setPeriodicWave(this.waves![kind]);
    osc.frequency.value = freq;
    if (vibrato && len > STEP * 2) {
      // a little wobble that starts once the note has sung for a moment
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * 0.012, t + STEP * 2);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + len + 0.05);
    }
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.005);
    env.gain.setValueAtTime(vol, t + Math.max(0.006, len - 0.03));
    env.gain.linearRampToValueAtTime(0, t + len);
    let out: AudioNode = env;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      env.connect(f);
      out = f;
    }
    osc.connect(env);
    out.connect(this.master!);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }

  /** A punchy kick: a fast pitch drop for the thump, plus a short click for the attack. */
  private kick(t: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    env.gain.setValueAtTime(1.2, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.26);
    this.noiseHit(t, 0.35, 0.012, "highpass", 3000); // the click
  }

  private noiseHit(t: number, vol: number, len: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.frequency.value = freq;
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(env).connect(this.master!);
    src.start(t, (t * 7919) % 0.9); // a different slice of the noise each hit
    src.stop(t + len + 0.02);
  }

  private snare(t: number, vol: number) {
    this.noiseHit(t, vol, 0.14, "bandpass", 1800);
    this.tone("triangle", 196, t, 0.05, vol * 0.5); // a little body under the noise
    if (vol > 0.4) this.noiseHit(t + 0.012, vol * 0.6, 0.09, "bandpass", 1200); // a clap layer on the big ones
  }

  private hat(t: number, vol: number, len: number) {
    this.noiseHit(t, vol, len, "highpass", 7000);
  }
}
