// The soundtrack: original chiptunes played live with Web Audio (no files, nothing to license). NES-style voices: a
// bouncing triangle bass, a fast 16th-note arpeggio, pulse-wave stabs and lead, a punchy noise kit, plus (in the game
// song) a record scratch and a sneaker squeak. Four songs share one player (SONGS): the game groove on offence, a tense
// defence version of it, the title anthem and the laid-back menu funk. setSong swaps at the next bar (the two game
// songs at the next half bar, keeping their place, so a change of hands never leaves a gap); muffle() dulls it all
// behind a low-pass filter (the title's arcade cabinet, heard from across the room).
import { audio } from "../ui/sound.ts";

const VOLUME = 0.22;
const LOOK_AHEAD = 0.12; // schedule this far ahead (seconds)
const MUTE_KEY = "s5p-music-off-v1";
const MUFFLED = { cutoff: 520, volume: 0.6 }; // the cabinet across the room: dull and a bit quieter

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A chord: bass root (MIDI), the stab voicing, and a one-bar lead line (16 steps; a number starts a note, null holds). */
type Bar = { root: number; stab: number[]; lead: (number | null)[] };
/** One song: its bars (each with the lead on or off) and its groove, in 16th-note steps. */
export type Song = {
  bpm: number;
  swing: number; // the off 16ths land this share of a step late
  bars: { bar: Bar; lead: boolean }[];
  bass: (number | null)[][]; // semitones above the root per step, one line per bar (alternating); step 15 walks on
  kick: number[]; snare: number[]; ghost: number[]; openHat: number[]; stabs: number[];
  arp: number; // arpeggio volume (0 = none)
  lead: { vol: number; cutoff: number };
  extras: boolean; // the record scratch and sneaker squeak
};

const _ = null;
const song = (parts: [Bar[], boolean][]) => parts.flatMap(([bars, lead]) => bars.map((bar) => ({ bar, lead })));

// The game song (offence): funky arcade with a hip-hop edge. Groove intro, verse, bridge, verse.
const GA: Bar[] = [
  { root: 45, stab: [60, 64, 67, 71], lead: [76, _, _, 74, _, 72, _, _, 69, _, 72, _, _, _, _, _] }, // Am9
  { root: 38, stab: [60, 64, 66, 69], lead: [_, _, 72, 74, _, 76, _, 74, _, 72, _, 69, _, _, _, _] }, // D9
  { root: 41, stab: [60, 64, 65, 69], lead: [72, _, _, _, 76, _, _, 77, _, 76, _, 74, _, 72, _, _] }, // Fmaj7
  { root: 40, stab: [56, 62, 67], lead: [71, _, _, _, 68, _, _, _, 71, _, 74, _, 76, _, _, _] }, // E7#9
];
const GB: Bar[] = [
  { root: 38, stab: [60, 64, 65, 69], lead: [_, _, 77, _, 76, _, 74, _, 72, _, _, _, 74, _, _, _] }, // Dm9
  { root: 43, stab: [59, 64, 65], lead: [76, _, _, 74, _, 71, _, _, 67, _, _, _, _, _, _, _] }, // G13
  { root: 48, stab: [59, 62, 64, 67], lead: [_, _, 71, 72, _, 74, _, 76, _, 79, _, _, 76, _, _, _] }, // Cmaj9
  { root: 40, stab: [56, 62, 64], lead: [74, _, _, _, 71, _, 68, _, 64, _, _, _, _, _, _, _] }, // E7
];

// Defence: the same tempo and length, in D minor, a driving pedal bass and a low, prowling riff. Tense.
const DA: Bar[] = [
  { root: 38, stab: [62, 65, 69], lead: [62, _, _, 65, _, _, 64, _, 62, _, _, _, 61, _, _, _] }, // Dm
  { root: 46, stab: [62, 65, 70], lead: [62, _, _, 65, _, _, 67, _, 65, _, _, _, 62, _, _, _] }, // Bb
  { root: 43, stab: [62, 67, 70], lead: [67, _, _, 70, _, _, 69, _, 67, _, _, _, 65, _, 67, _] }, // Gm
  { root: 45, stab: [61, 64, 67], lead: [69, _, _, _, 68, _, _, _, 67, _, _, _, 64, _, 61, _] }, // A7
];
const DB: Bar[] = [
  { root: 38, stab: [62, 65, 69], lead: [74, _, _, 72, _, _, 70, _, 69, _, _, _, _, _, _, _] }, // Dm
  { root: 41, stab: [60, 65, 69], lead: [72, _, _, 70, _, _, 69, _, 65, _, _, _, _, _, _, _] }, // F
  { root: 40, stab: [62, 64, 67, 70], lead: [70, _, _, 69, _, _, 67, _, 64, _, _, _, 67, _, _, _] }, // Em7b5
  { root: 45, stab: [61, 64, 67], lead: [69, _, 70, _, 69, _, 68, _, 69, _, _, _, _, _, _, _] }, // A7
];

// The title: a big, bright attract-mode anthem in C. I-V-vi-IV, a lead you can hum, a disco hat.
const TA: Bar[] = [
  { root: 48, stab: [60, 64, 67], lead: [72, _, 76, _, 79, _, _, 76, _, 79, 81, _, 79, _, 76, _] }, // C
  { root: 43, stab: [59, 62, 67], lead: [79, _, _, _, 74, _, 76, _, _, _, 74, _, 71, _, _, _] }, // G
  { root: 45, stab: [60, 64, 69], lead: [72, _, 76, _, 81, _, _, 79, _, 76, _, 72, _, 74, _, 76] }, // Am
  { root: 41, stab: [60, 65, 69], lead: [77, _, _, 76, _, 74, _, 72, _, _, 74, _, _, _, _, _] }, // F
];
const TB: Bar[] = [
  { root: 41, stab: [60, 65, 69], lead: [81, _, _, 79, _, 77, _, 79, _, _, 81, _, 84, _, _, _] }, // F
  { root: 43, stab: [59, 62, 67], lead: [83, _, _, _, 79, _, _, _, 74, _, 76, _, 79, _, _, _] }, // G
  { root: 40, stab: [59, 64, 67], lead: [79, _, 76, _, 71, _, 76, _, 79, _, _, 83, _, 81, _, 79] }, // Em
  { root: 43, stab: [59, 62, 65, 67], lead: [77, _, 76, _, 74, _, _, _, 71, _, 74, _, 79, _, _, _] }, // G7
];

// The menus: laid-back funk, slower and swung, a two-chord vamp and a soft lead now and then.
const MA: Bar[] = [
  { root: 38, stab: [62, 65, 69, 72], lead: [_, _, 74, _, 72, _, 69, _, _, _, 72, _, _, 74, _, _] }, // Dm7
  { root: 43, stab: [59, 65, 69], lead: [77, _, _, _, 74, _, _, 72, _, _, 71, _, _, _, _, _] }, // G9
  { root: 38, stab: [62, 65, 69, 72], lead: [_, _, 74, _, 77, _, 74, _, 72, _, _, _, 69, _, _, _] }, // Dm7
  { root: 43, stab: [59, 65, 69], lead: [71, _, _, 72, _, 74, _, _, 71, _, _, _, _, _, _, _] }, // G9
];
const MB: Bar[] = [
  { root: 46, stab: [62, 65, 69], lead: [_, _, 69, _, 72, _, 74, _, 77, _, _, _, 76, _, 74, _] }, // Bbmaj7
  { root: 45, stab: [61, 67, 69], lead: [73, _, _, _, _, _, 76, _, _, _, 73, _, 69, _, _, _] }, // A7
  { root: 46, stab: [62, 65, 69], lead: [_, _, 74, _, 72, _, 69, _, 70, _, _, _, 69, _, _, _] }, // Bbmaj7
  { root: 45, stab: [61, 67, 69], lead: [69, _, 70, _, 72, _, 73, _, 76, _, _, _, _, _, _, _] }, // A7
];

export const SONGS = {
  game: {
    bpm: 112, swing: 0.07, bars: song([[GA, false], [GA, true], [GB, true], [GA, true]]),
    bass: [[0, _, 12, 0, _, 0, 12, _, 0, _, 12, 0, 10, _, 12, _], [0, _, 12, _, 0, 12, _, 10, _, 7, _, 0, 3, _, 5, _]],
    kick: [0, 3, 8, 10], snare: [4, 12], ghost: [7, 15], openHat: [6, 14], stabs: [6, 14],
    arp: 0.045, lead: { vol: 0.13, cutoff: 3600 }, extras: true,
  },
  defence: {
    bpm: 112, swing: 0.03, bars: song([[DA, false], [DA, true], [DB, true], [DA, true]]),
    bass: [[0, _, 0, 0, _, 0, 0, _, 0, _, 0, 0, 12, _, 10, _], [0, _, 0, 0, _, 0, 3, _, 0, _, 0, 0, 1, _, 0, _]],
    kick: [0, 4, 8, 12], snare: [4, 12], ghost: [10, 14], openHat: [], stabs: [2, 10],
    arp: 0.03, lead: { vol: 0.11, cutoff: 2000 }, extras: false,
  },
  title: {
    bpm: 128, swing: 0, bars: song([[TA, false], [TA, true], [TB, true], [TA, true]]),
    bass: [[0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, 12, 7, _], [0, _, 12, _, 0, _, 12, 0, _, 0, 12, _, 7, _, 10, _]],
    kick: [0, 4, 8, 12], snare: [4, 12], ghost: [15], openHat: [2, 6, 10, 14], stabs: [6, 14],
    arp: 0.05, lead: { vol: 0.15, cutoff: 4200 }, extras: false,
  },
  menu: {
    bpm: 96, swing: 0.12, bars: song([[MA, false], [MA, true], [MB, true], [MA, false]]),
    bass: [[0, _, _, 12, _, _, 0, _, 10, _, 12, _, 0, _, 7, _], [0, _, _, 0, _, 12, _, 0, _, _, 10, _, 7, _, 5, _]],
    kick: [0, 7, 10], snare: [4, 12], ghost: [6, 9, 15], openHat: [14], stabs: [3, 10],
    arp: 0, lead: { vol: 0.1, cutoff: 2200 }, extras: false,
  },
} satisfies Record<string, Song>;
export type SongName = keyof typeof SONGS;

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private waves: Record<"lead" | "stab", PeriodicWave> | null = null;
  private timer = 0;
  private step = 0;
  private next = 0;
  private on = false;
  private name: SongName;
  private song: Song;
  private queued: SongName | null = null;
  private muffled = false;
  muted = false;

  constructor(name: SongName = "game") {
    this.name = name;
    this.song = SONGS[name];
    this.readMute();
  }

  /** The browser hasn't let the sound start yet (no tap it counts so far): a later tap should try again. */
  get blocked() {
    return !this.ctx || this.ctx.state !== "running";
  }

  /** Which song is playing (or will, after a queued change). */
  get current() {
    return this.queued ?? this.name;
  }

  start() {
    if (this.on && this.ctx?.state !== "running") void this.ctx?.resume(); // a later tap: let it out now
    if (this.on || !this.setup()) return;
    this.readMute(); // another player (the game or the menus) may have changed it
    const ctx = this.ctx!;
    void ctx.resume();
    this.on = true;
    this.next = ctx.currentTime + 0.05;
    this.master!.gain.setValueAtTime(this.level(), ctx.currentTime);
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
    this.setLevel(0.03);
    return !this.muted;
  }

  /** Change songs: at once when stopped, else on the next bar (the two game songs: the next half bar, same place). */
  setSong(name: SongName) {
    if (name === this.current) return;
    if (!this.on) {
      this.queued = null;
      this.pick(name, false);
    } else this.queued = name;
  }

  /** Dull the music behind a low-pass filter (and turn it down a bit), or bring it back clear. */
  muffle(on: boolean) {
    if (on === this.muffled) return;
    this.muffled = on;
    if (!this.ctx || !this.filter) return;
    this.filter.frequency.setTargetAtTime(on ? MUFFLED.cutoff : 20000, this.ctx.currentTime, 0.15);
    this.setLevel(0.15);
  }

  /** Dip the music for `sec` seconds under a jingle, then bring it back. */
  duck(sec: number) {
    if (!this.on || !this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime, g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.level() * 0.3, t, 0.02);
    g.setTargetAtTime(this.level(), t + sec, 0.2);
  }

  private readMute() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      // storage blocked: music stays on
    }
  }

  private level() {
    return this.muted ? 0 : VOLUME * (this.muffled ? MUFFLED.volume : 1);
  }

  private setLevel(tc: number) {
    if (this.ctx && this.master && this.on) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, tc);
  }

  private pick(name: SongName, keepPlace: boolean) {
    this.name = name;
    this.song = SONGS[name];
    if (!keepPlace) this.step = 0;
    this.step %= this.song.bars.length * 16;
  }

  private setup() {
    if (this.ctx) return true;
    const ctx = audio();
    if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // the muffle: a low-pass filter, wide open unless muffled
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.muffled ? MUFFLED.cutoff : 20000;
    // a compressor glues the mix together and makes the drums hit harder
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 4;
    glue.attack.value = 0.005;
    glue.release.value = 0.12;
    const makeUp = ctx.createGain();
    makeUp.gain.value = 1.6;
    this.master.connect(this.filter).connect(glue).connect(makeUp).connect(ctx.destination);
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

  private get stepLen() {
    return 60 / this.song.bpm / 4; // one 16th note, in seconds
  }

  private tick() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + LOOK_AHEAD) {
      if (this.queued) {
        // the game and defence songs swap on the half bar and keep their place; anything else waits for the bar
        const sister = SONGS[this.queued].bpm === this.song.bpm && SONGS[this.queued].bars.length === this.song.bars.length;
        if (this.step % (sister ? 8 : 16) === 0) {
          this.pick(this.queued, sister);
          this.queued = null;
        }
      }
      const s = this.step % 16;
      this.play(this.step, this.next + (s % 2 ? this.song.swing * this.stepLen : 0));
      this.next += this.stepLen;
      this.step = (this.step + 1) % (this.song.bars.length * 16);
    }
  }

  private play(step: number, t: number) {
    const S = this.song, STEP = this.stepLen;
    const barNo = Math.floor(step / 16), s = step % 16;
    const { bar, lead } = S.bars[barNo];
    const nextBar = S.bars[(barNo + 1) % S.bars.length].bar;

    // bass: the groove line, walking chromatically into the next chord on the last 16th
    const line = S.bass[barNo % S.bass.length];
    const off = s === 15 ? nextBar.root - 1 - bar.root : line[s];
    if (off != null) {
      const holds = s < 15 && line[s + 1] == null ? 2 : 1;
      this.tone("triangle", hz(bar.root + off), t, STEP * holds * 0.85, 0.55);
    }

    // the arcade arpeggio: up through the chord an octave higher, a note every 16th
    if (S.arp > 0) {
      const arp = [...bar.stab, ...bar.stab.slice(1, -1).reverse()]; // up and back down
      this.tone("stab", hz(arp[s % arp.length] + 12), t, STEP * 0.5, S.arp, 4200);
    }
    // chord stabs on the offbeats
    if (S.stabs.includes(s)) for (const m of bar.stab) this.tone("stab", hz(m), t, STEP * 0.6, 0.06, 2600);

    // lead melody, each note held until the next one (or 6 steps at most)
    const m = bar.lead[s];
    if (lead && m != null) {
      let len = 1;
      while (s + len < 16 && bar.lead[s + len] == null && len < 6) len++;
      this.tone("lead", hz(m), t, STEP * len * 0.9, S.lead.vol, S.lead.cutoff, true);
    }

    // drums, with a snare fill at the end of the song
    const fill = barNo === S.bars.length - 1 && s >= 12;
    if (S.kick.includes(s)) this.kick(t);
    if (fill) this.snare(t, 0.45 + (s - 12) * 0.12);
    else if (S.snare.includes(s)) this.snare(t, 0.75);
    else if (S.ghost.includes(s)) this.snare(t, 0.12);
    if (S.openHat.includes(s)) this.hat(t, 0.14, 0.12);
    else this.hat(t, s % 4 === 0 ? 0.12 : s % 2 ? 0.05 : 0.08, 0.025); // every 16th, accented on the beat

    // the hip-hop basketball bits: a record scratch closing every 4-bar phrase, a sneaker squeak now and then
    if (S.extras && barNo % 4 === 3 && (s === 12 || s === 14)) this.scratch(t);
    if (S.extras && barNo % 4 === 1 && s === 7) this.squeak(t);
  }

  /** A "wika" scratch: a noise burst through a filter sweeping up then down, like a record pushed and pulled. */
  private scratch(t: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), env = ctx.createGain(), STEP = this.stepLen;
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
    const ctx = this.ctx!, osc = ctx.createOscillator(), env = ctx.createGain(), STEP = this.stepLen;
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
