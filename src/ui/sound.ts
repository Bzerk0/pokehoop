// 8-bit blips made on the fly with Web Audio (no sound files, nothing to license).
let ctx: AudioContext | null = null;

/** The page's one audio context (made on first use), or null if audio isn't available. */
export function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

export function blip(freq = 660, ms = 45, volume = 0.05) {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000 + 0.01);
  } catch {
    // no audio (blocked or unsupported): stay silent
  }
}

/** A run of notes [hz, seconds], brassy (a filtered sawtooth); `wobble` adds a sad vibrato to the last one. */
function tune(notes: [number, number][], volume = 0.08, wobble = false) {
  const ctx = audio();
  if (!ctx) return;
  let t = ctx.currentTime + 0.02;
  notes.forEach(([hz, len], i) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(hz, t);
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    if (wobble && i === notes.length - 1) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = hz * 0.03;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + len);
      osc.frequency.linearRampToValueAtTime(hz * 0.94, t + len); // and sag at the end
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.03);
    gain.gain.setValueAtTime(volume, t + len - 0.08);
    gain.gain.linearRampToValueAtTime(0, t + len);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
    t += len;
  });
}

/** Womp womp womp wommmp: you lost. */
export const womp = () => tune([[196, 0.32], [185, 0.32], [175, 0.32], [165, 1.1]], 0.09, true);
/** Ta-da: you won. */
export const fanfare = () => tune([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.5]], 0.06);

/** The instant-replay whoosh: a quick falling sweep. */
export function swoosh() {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.3);
  gain.gain.setValueAtTime(0.05, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.32);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.34);
}
/** The coin going in on the title screen: a bitcrushed recording (Alex_Jauk on Pixabay: see credits.ts). */
export function coin() {
  try {
    const a = new Audio("/sfx/coin.mp3");
    a.volume = 0.6;
    void a.play().catch(() => {}); // blocked or unsupported: stay silent
  } catch {
    // no audio
  }
}
/** A low boom for a slam in a replay. */
export const boom = () => blip(70, 180, 0.14);

// --- Jingles: short chiptune stingers for the big moments of a live game. Each returns how long it rings (seconds)
// so the music can duck under it.

const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Notes [MIDI, seconds] one after another on a chip voice; a third value slides the note to that pitch. */
function chip(notes: ([number, number] | [number, number, number])[], wave: OscillatorType = "square", volume = 0.06, gap = 0.9) {
  const ctx = audio();
  if (!ctx) return 0;
  const t0 = ctx.currentTime + 0.01;
  let t = t0;
  for (const [m, len, to] of notes) {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(midi(m), t);
    if (to != null) osc.frequency.exponentialRampToValueAtTime(midi(to), t + len);
    env.gain.setValueAtTime(volume, t);
    env.gain.setValueAtTime(volume, t + len * gap - 0.01);
    env.gain.linearRampToValueAtTime(0, t + len * gap);
    osc.connect(env).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
    t += len;
  }
  return t - t0;
}

/** A low thud: a sine dropping fast (slams, blocks). */
function thud(volume = 0.18, from = 150) {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator(), env = ctx.createGain(), t = ctx.currentTime;
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  env.gain.setValueAtTime(volume, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(env).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.32);
}

/** `ours`: our team did it (bright), or the CPU (a darker, minor turn). */
export const jingle = {
  dunk: (ours: boolean) => (thud(), chip(ours ? [[60, 0.06], [64, 0.06], [67, 0.06], [72, 0.22]] : [[60, 0.06], [63, 0.06], [67, 0.06], [70, 0.22]])),
  special: (ours: boolean) => (thud(0.22, 180), chip(
    ours
      ? [[60, 0.05], [64, 0.05], [67, 0.05], [72, 0.05], [76, 0.05], [79, 0.05], [84, 0.4]]
      : [[60, 0.05], [63, 0.05], [67, 0.05], [72, 0.05], [75, 0.05], [79, 0.05], [82, 0.4]], "square", 0.07)),
  oop: () => chip([[67, 0.18, 86], [84, 0.08], [88, 0.2]], "square", 0.05),
  make: (ours: boolean) => chip(ours ? [[76, 0.07], [81, 0.16]] : [[69, 0.07], [64, 0.16]], "square", 0.05),
  three: (ours: boolean) => chip(ours ? [[72, 0.07], [76, 0.07], [79, 0.07], [84, 0.3]] : [[69, 0.07], [72, 0.07], [76, 0.07], [81, 0.3]], "square", 0.055),
  miss: () => chip([[67, 0.09], [62, 0.16]], "triangle", 0.12),
  missThree: () => chip([[64, 0.12], [63, 0.12], [62, 0.45, 50]], "triangle", 0.12),
  block: () => (thud(0.2), chip([[95, 0.12, 60]], "square", 0.05)),
  steal: () => chip([[83, 0.05], [88, 0.12]], "square", 0.05),
  flourish: () => chip([[79, 0.04], [84, 0.04], [79, 0.04], [88, 0.1]], "square", 0.04),
  fire: () => chip([[60, 0.06], [64, 0.06], [67, 0.06], [72, 0.06], [76, 0.06], [79, 0.06], [84, 0.06], [88, 0.06], [84, 0.06], [88, 0.25]], "square", 0.05),
};

/** The slot machine spinning: a fast chiptune whirl climbing for `sec` seconds (the reels' stops play over it). */
export function slotSpin(sec: number) {
  const run = [72, 76, 79, 84, 79, 76], notes: [number, number][] = [];
  for (let i = 0, t = 0; t < sec; i++, t += 0.055) notes.push([run[i % run.length] + Math.floor(t / 0.66) * 2, 0.055]); // up a step each beat
  chip(notes, "square", 0.025, 0.6);
}

export const moveBlip = () => blip(660, 35);
export const selectBlip = () => blip(990, 70);
export const backBlip = () => blip(330, 60);
