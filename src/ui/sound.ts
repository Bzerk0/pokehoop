// 8-bit blips made on the fly with Web Audio (no sound files, nothing to license).
let ctx: AudioContext | null = null;

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

export const moveBlip = () => blip(660, 35);
export const selectBlip = () => blip(990, 70);
export const backBlip = () => blip(330, 60);
