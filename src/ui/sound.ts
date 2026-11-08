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

export const moveBlip = () => blip(660, 35);
export const selectBlip = () => blip(990, 70);
export const backBlip = () => blip(330, 60);
