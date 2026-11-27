// The moves, in the order a new player needs them: one list for the intro card (short labels, drawn on the canvas)
// and the CONTROLS screen (longer how-tos, in HTML). Pure data: no React, no Three.js.
import { keyName, type KeyMap } from "./keys.ts";

/** 8×8 pixel icons ('#' = lit). */
export const ICONS = {
  move: ["...##...", "..####..", "...##...", "##.##.##", "##.##.##", "...##...", "..####..", "...##..."],
  ball: ["..####..", ".##..##.", "#..##..#", "########", "#..##..#", ".##..##.", "..####..", "........"],
  bolt: ["....##..", "...##...", "..##....", ".######.", "....##..", "...##...", "..##....", "..#....."],
  dunk: ["########", "#......#", ".#....#.", "..####..", "...##...", "..####..", "..####..", "...##..."],
  floater: ["..####..", ".#....#.", "#......#", "........", "....##..", "....##..", "........", "######.."],
  pass: ["........", "....#...", "....##..", "#######.", "#######.", "....##..", "....#...", "........"],
  sprint: ["#..#....", ".#..#...", "..#..#..", "...#..#.", "..#..#..", ".#..#...", "#..#....", "........"],
  swap: ["....#...", ".#####..", "....#...", "........", "..#.....", "..#####.", "..#.....", "........"],
  hand: ["#.#.#...", "#.#.#.#.", "#######.", "#######.", ".######.", ".######.", "..####..", "..####.."],
  up: ["...##...", "..####..", ".######.", "...##...", "...##...", "...##...", "...##...", "........"],
  plays: ["..####..", "########", "#......#", "#.####.#", "#......#", "#.####.#", "#......#", "########"],
  screen: ["########", "#......#", "#.####.#", "#.####.#", "#.####.#", "#.####.#", "#......#", "########"],
} as const;
export type IconName = keyof typeof ICONS;

export type Move = {
  icon: IconName;
  key: string; // the key cap text
  short: string; // for the intro card
  title: string;
  how: string; // the whole story, for the CONTROLS screen
};
export type Guide = { offence: Move[]; defence: Move[]; game: Move[] };

/** The moves for your keys (or the phone's on-screen buttons). `team` adds the passing and calling moves. */
export function guide(keys: KeyMap, team: boolean, touch: boolean): Guide {
  const n = (a: keyof KeyMap) => keyName(keys[a]);
  const dbl = (k: string) => (k.length === 1 ? k + k : `${k}x2`);
  const shoot = touch ? "SHOOT" : `${n("shoot")}/SPC`, turbo = touch ? "TURBO" : n("turbo"), pass = touch ? "PASS" : n("pass"), plays = touch ? "PLAYS" : n("plays");
  const dub = touch ? "TURBOx2" : dbl(n("turbo"));
  const offence: Move[] = [
    { icon: "move", key: touch ? "STICK" : `${n("up")}${n("left")}${n("down")}${n("right")}`, short: "MOVE", title: "MOVE", how: "Run around the court. The arrow keys work too." },
    { icon: "ball", key: shoot, short: "HOLD, RELEASE: SHOOT", title: "SHOOT", how: "Hold the shoot button and let go when the meter is in the green. A perfect release is the best shot." },
    { icon: "bolt", key: shoot, short: "TAP: QUICK SHOT", title: "QUICK SHOT", how: "Tap shoot instead of holding it: no meter. Near the rim it is a layup. It is poor from far out, and there are no quick threes." },
    { icon: "dunk", key: `${turbo}+${touch ? "SHOOT" : n("shoot")}`, short: "NEAR RIM: DUNK", title: "DUNK", how: "Hold sprint and press shoot close to the rim. Good finishers throw down fancier dunks." },
    { icon: "floater", key: shoot, short: "RUN + TAP: FLOATER", title: "FLOATER", how: "Drive toward the rim and tap shoot from just outside the layup spot: a soft, high shot over the defence." },
    ...(team ? [{ icon: "pass" as const, key: pass, short: "PASS", title: "PASS", how: "Pass to the teammate you are facing (yellow ring). Keys 1-5 pass to a lineup spot. A pass near the rim to a big finisher can be an alley-oop." }] : []),
    { icon: "sprint", key: turbo, short: "HOLD: SPRINT", title: "SPRINT", how: "Hold to run faster. It drains the turbo bar, which refills when you ease off." },
    { icon: "swap", key: dub, short: "DOUBLE-TAP: CROSSOVER", title: "CROSSOVER", how: "Double-tap sprint with the ball to cross over. Do it while driving at the rim for a eurostep." },
    ...(team ? [
      { icon: "plays" as const, key: plays, short: "CALL A PLAY", title: "CALL A PLAY", how: "Open the play menu to call a pick and roll, isolation, post up or motion for this possession." },
      { icon: "screen" as const, key: touch ? "SCREEN" : `${n("left")}+${n("right")}`, short: "HOLD: SET A SCREEN", title: "SET A SCREEN", how: "Without the ball, hold left and right together to plant a screen. Defenders who run into you are held up." },
    ] : []),
  ];
  const defence: Move[] = [
    ...(team ? [{ icon: "swap" as const, key: pass, short: "SWITCH PLAYER", title: "SWITCH PLAYER", how: "On defence, tap pass to take over the teammate nearest the ball. It works wherever you are facing." }] : []),
    { icon: "hand", key: dub, short: "DOUBLE-TAP: STEAL", title: "STEAL", how: "Double-tap sprint near the ball handler to reach for the ball. Miss and you stumble." },
    { icon: "up", key: shoot, short: "JUMP / BLOCK", title: "BLOCK", how: "Press shoot as a shot goes up to jump and block it. The red bar by a shooter shows the best moment (the 0.8 line)." },
    ...(team ? [{ icon: "plays" as const, key: plays, short: "PICK A DEFENCE", title: "PICK A DEFENCE", how: "Open the defence menu: man-to-man, 2-3 zone, press or double the star." }] : []),
  ];
  const game: Move[] = [
    { icon: "ball", key: touch ? "II" : n("music"), short: touch ? "PAUSE" : "MUSIC", title: touch ? "PAUSE" : "MUSIC", how: touch ? "Pause, subs, controls." : "Turn the music on and off. Esc pauses." },
    { icon: "bolt", key: "i", short: "TYPE ABILITIES", title: "TYPE ABILITIES", how: "In live games, each Pokémon gets one ability from its first type. Open its stat card to see what it does." },
  ];
  return { offence, defence, game };
}
