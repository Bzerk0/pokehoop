// Every tuning number for ratings (PLAN.md §6). Change numbers here, not in ratings.ts.
import type { Attribute, Position, StatKey } from "./types.ts";

/** What a formula can read, each a 0–100 percentile across the whole pool.
 *  ht/wt are height/weight; light = 100 − wt (lighter is faster). */
export type RatingInput = StatKey | "ht" | "wt" | "light";

export const ATTRIBUTE_WEIGHTS: Record<Attribute, Partial<Record<RatingInput, number>>> = {
  speed: { spe: 0.8, light: 0.2 },
  shooting: { spa: 0.55, spd: 0.25, spe: 0.2 },
  finishing: { atk: 0.5, ht: 0.25, spe: 0.25 },
  handles: { spe: 0.5, spd: 0.3, spa: 0.2 },
  passing: { spd: 0.4, spa: 0.4, spe: 0.2 },
  perimeterD: { spe: 0.5, def: 0.3, spd: 0.2 },
  interiorD: { ht: 0.4, def: 0.35, hp: 0.25 },
  rebounding: { ht: 0.4, wt: 0.25, hp: 0.2, atk: 0.15 },
  strength: { wt: 0.5, atk: 0.3, def: 0.2 },
  stamina: { hp: 1 },
};

/** Type bonuses stack (dual types get both); "all" adds to every attribute. Results cap at 99. */
export const TYPE_BONUS: Record<string, Partial<Record<Attribute | "all", number>>> = {
  electric: { speed: 5 },
  flying: { rebounding: 5, strength: -3 },
  fighting: { finishing: 5, strength: 3 },
  psychic: { passing: 5, shooting: 3 },
  steel: { interiorD: 5 },
  rock: { strength: 4 },
  ghost: { perimeterD: 5 },
  dark: { handles: 4 },
  ice: { shooting: 4 },
  fire: { finishing: 4 },
  ground: { rebounding: 4 },
  water: { stamina: 3 },
  grass: { stamina: 3 },
  bug: { speed: 4 },
  fairy: { passing: 4 },
  poison: { perimeterD: 3 },
  dragon: { all: 2 },
  normal: { handles: 2, passing: 2 },
};

export const POSITION_WEIGHTS: Record<Position, Partial<Record<Attribute, number>>> = {
  PG: { handles: 0.25, passing: 0.25, shooting: 0.2, speed: 0.15, perimeterD: 0.15 },
  SG: { shooting: 0.35, perimeterD: 0.2, speed: 0.15, handles: 0.15, finishing: 0.15 },
  SF: { finishing: 0.2, shooting: 0.2, perimeterD: 0.2, speed: 0.15, strength: 0.15, rebounding: 0.1 },
  PF: { rebounding: 0.25, interiorD: 0.2, finishing: 0.2, strength: 0.2, shooting: 0.15 },
  C: { interiorD: 0.3, rebounding: 0.3, strength: 0.2, finishing: 0.2 },
};

/** Position OVRs are rescaled so the pool's worst is OVR_MIN and its best OVR_MAX. */
/** Team OVR (PLAN.md §7): starters count this much, the bench the rest. */
export const STARTER_WEIGHT = 0.8;
/** Builder warnings: fewer than SHOOTERS_NEEDED players with Shooting ≥ SHOOTER_MIN, or average height
 *  percentile below SHORT_TEAM_HEIGHT. */
export const SHOOTER_MIN = 70;
export const SHOOTERS_NEEDED = 2;
export const SHORT_TEAM_HEIGHT = 35;

/** Salary cap (in $M): a Pokémon's salary grows steeply with its best OVR, from SALARY_MIN at OVR_MIN to
 *  SALARY_MAX at OVR_MAX (curve exponent SALARY_CURVE). All 8 salaries together must fit under SALARY_CAP. */
export const SALARY_CAP = 100;
export const SALARY_MIN = 1;
export const SALARY_MAX = 40;
export const SALARY_CURVE = 3;

/** The draft tiers (best position OVR, high to low). Each offer in a tier is drawn from the DRAFT_DEPTH best free,
 *  affordable players in it. */
export const DRAFT_TIERS = [
  { name: "STAR", min: 90 },
  { name: "STARTER", min: 78 },
  { name: "ROLE", min: 64 },
  { name: "SLEEPER", min: 0 },
] as const;
/** The ARCADE DRAFT's slot machine: each pull spins `reels` reels, each landing on a tier drawn by `weights` (higher
 *  = more often, so keep the better tiers rarer). After the pull, if no STAR landed, one reel is swapped for a STAR
 *  with chance `starChance` (`firstStar` on the very first pull). The dev menu (` on the draft page) edits these. */
export const ARCADE = {
  reels: 3,
  weights: { STAR: 1, STARTER: 3, ROLE: 6, SLEEPER: 5 },
  starChance: 0.9,
  firstStar: 1,
  /** Contract prices (lineup.ts salary): each Pokémon's price is its rating's price ± up to `vary` (0.12 = 12%), a
   *  fixed tweak per Pokémon from `seed`. `perDraft` 1 = a new seed (new tweaks) at the start of every draft. */
  price: { vary: 0.12, perDraft: 0, seed: 0 },
};
export const DRAFT_REROLLS = 2;
/** The FULL DRAFT (fullDraft.ts): teams in the draft, the class size (× the picks there are), its ratings' bell curve
 *  (best-position OVR mean and spread), and how much the CPU teams' boards disagree (± OVR). */
export const FULL = { teams: 8, classSize: 1.5, mean: 70, sd: 10, cpuNoise: 3 };
export const DRAFT_DEPTH = 40;
/** Unrounded team rating (chemistry included) needed for each draft grade, best first. Calibrated by simulating
 *  600 drafts per strategy with free placement: random picks on random spots land around 68.7 (D), always taking
 *  the best player around 70 (D), spending sensibly and placing well around 78.3 (B), and 79.5+ (A+) is that
 *  sensible drafter's top 10%. */
export const DRAFT_GRADES: [string, number][] = [
  ["A+", 79.5],
  ["A", 78.5],
  ["B", 77],
  ["C", 73],
  ["D", 68],
  ["F", 0],
];

/** Chemistry (chemistry.ts): OVR points each player in a link gets. Links stack, up to CHEM_MAX per player,
 *  and a boosted OVR never passes ATTR_MAX. */
export const CHEM = {
  family: 2, // 2+ from one evolution family
  starterTrio: 3, // the three starter lines of one region
  typeTrio: 1, // 3 sharing a type
  typeMore: [2, 2, 3, 3, 4], // 4, 5, 6, 7 and all 8 (the whole squad) sharing a type
  pair: 3, // rivals and partners (Nidoking + Nidoqueen …)
  squad: 2, // 3+ of a famous group (the legendary birds, Ash's partners …)
  region: 2, // whole team: all five starters from one region
  monoType: 3, // whole team: all five starters share a type
};
export const CHEM_MAX = 6;

/** CPU opponents (PLAN.md §8): a team OVR band per difficulty. For each spot the CPU samples CPU_SAMPLE Pokémon who
 *  rate near the band there and signs the one closest to its target. CPU teams ignore the salary cap. */
export const DIFFICULTIES = [
  { name: "ROOKIE", min: 55, max: 65, unlimitedOnly: false },
  { name: "PRO", min: 65, max: 75, unlimitedOnly: false },
  { name: "ALL-STAR", min: 75, max: 85, unlimitedOnly: false },
  { name: "CHAMPION", min: 85, max: 95, unlimitedOnly: true },
] as const;
export const CPU_SAMPLE = 15;

/** The game simulator (PLAN.md §9). Make chances are logistic around the base rates: each point the shooter's
 *  rating beats the defender's moves the odds by 1/SLOPE in log-odds. Tuned with scripts/balance.ts. */
export const SIM = {
  // PLAN.md §9 says "~50 possessions" but also "average score 75–110"; 50 can't score that much, so the score wins
  possessions: 80, // per team per game, before pace
  paceSwing: 0.1, // ± by the two teams' average speed
  turnover: 0.13,
  stealShare: 0.55, // share of turnovers that are steals
  rim: 0.6,
  mid: 0.42,
  three: 0.35,
  slope: 120,
  block: 0.07,
  offRebound: 0.25,
  assist: 0.6,
  drain: 1.3, // energy lost per possession on court (less with high stamina)
  recover: 3, // energy regained per possession on the bench
  subBelow: 55, // a starter this tired goes to the bench if a fresher sub is there
  tiredFloor: 0.85, // ratings at zero energy, as a share of fresh
  quarterSec: 90, // 4 × 1:30, overtime 1:00
  overtimeSec: 60,
};

/** The live arcade game (PLAN.md §10; Phase 5 is 1v1). Metres and seconds. The court runs up the screen and you
 *  always attack the top hoop. Each make/miss/steal/block is a dice roll when it happens, then animated. */
export const LIVE = {
  // the court's size × a real one (28.65 × 15.24 m): lines, three-point arc and where players stand all scale with
  // it; the players don't, so a bigger court means more room. Trying 15% bigger (the user's test); 1 = real size
  courtScale: 1.15,
  midCut: 5, // metres taken out of the middle of the court's length (less running between the ends; the halves stay as
  // they were: hoops, arcs and spots are measured from the baselines)
  targetScore: 11, // first to this wins (1v1)
  targetBySize: { 1: 11, 3: 15, 5: 21 } as Record<number, number>, // first to this, by players a side
  shotClock: 24, // seconds (the user's call; PLAN.md said 14); resets when the ball changes hands
  reboundClock: 14, // seconds on the shot clock when the shooting team gets its own miss back (off the rim)
  spriteScale: 1, // × the Pokémon sprites' size on the court in 1v1 (the dev menu: bigger reads better, smaller shows more court)
  spriteScaleTeam: 0.8, // ... in team games (3v3, 5v5, SOLO, HOW TO PLAY, the title's)
  // gameplay aids
  quickTap: 0.12, // let go of K this fast: a quick shot, no meter
  quickClose: 0.15, // a quick shot's make chance gained right at the rim, fading out by quickCloseTo metres
  quickCloseTo: 4,
  quickSlope: 0.035, // a quick shot's make chance lost per metre beyond 1.5 m (little close in, a lot from deep)
  quickMax: 0.4, // ... at most
  blockNudge: 2.5, // a block jump drifts toward a shot going up nearby, up to this fast (m/s)
  nudgeRange: 3.5, // ... if it's this close
  chaseRange: 1.2, // a defender sprinting in from behind reaches this far for a block (a chase-down)
  chaseBonus: 0, // ... and gets this much more block chance (more made a quarter of drives get swatted)
  chaseSpeed: 4, // ... if moving at least this fast (m/s): a real sprint, not a jog back
  // passing (Phase 6): J passes to the teammate you face, 1–5 to a spot
  passMin: 9, // pass speed m/s at Passing 0
  passMax: 15, // ... at Passing 99
  passError: 0.1, // a Passing-0 pass lands up to this share of its length off target
  catchRange: 1.2, // the receiver catches it within this of where it arrives
  interceptRange: 0.8, // a defender this close to a pass in flight can pick it off
  interceptBase: 0.14,
  interceptSlope: 0.005, // per point of Perimeter D over the passer's Passing
  // screens (Phase 7): a defender who runs into a screener is held up
  screenRange: 0.85,
  screenTime: 0.7, // seconds held up
  screenSlow: 0.3, // speed share while held up
  menuSlow: 0.08,
  // instant replays and the top plays reel (src/game/replay.ts)
  replays: 1, // 1 = instant replays on, 0 = off (the top plays reel still runs)
  liveCine: 1, // 1 = live cinematic cuts (dunks, alley-oops, blocks, corner threes), 0 = off
  cineGap: 2, // game seconds after one live cut before the next can start
  cineHold: 0.5, // seconds a live dunk cut stays on after the dunker lands
  posterRange: 1.6, // metres: a dunk over a defender this close posterizes him (he turns into a trading card)
  posterHold: 1.2, // extra game seconds a live dunk cut stays on for the card
  oopCut: 0.35, // seconds before the catch an alley-oop's live cut starts (the lob itself stays in the normal view)
  cornerEase: 1.4, // seconds a corner three's live cut takes to speed up from full slow-mo to normal
  /** Which live cuts play (1 = on, 0 = off), each on its own (the dev menu's LIVE CINE SHOTS). */
  cineShots: { dunk: 1, special: 1, oop: 1, block: 1, corner: 1, eurostep: 1, floater: 1 },
  replayMin: 3, // hype a play needs for an instant replay
  replayGap: 30, // game seconds between instant replays
  replaySlow: 0.25, // slow-motion speed at the key moment
  replaySlowSpan: 0.3, // seconds either side of the key moment at full slow-mo (it eases back over the same again)
  topPlays: 3, // plays in the end-of-game reel
  replayHype: {
    oop: 4.5, dunk: 3, stepback: 3, ankles: 3, block: 3, chase: 4, buzzer: 3, // buzzer: added to whatever it was
    special: 5.5, eurostep: 3, floater: 2.5, screen: 2, perimeter: 1, perimeterThree: 2, // perimeterThree: added when the swing ends in a three
  },
  perimeterPasses: 3, // passes in a row round the arc (both ends outside the three-point line) that make a ball-movement clip
  perimeterWindow: 4.5, // ...within this many seconds
  specialSlow: 1.8, // × the slow-motion span for a special dunk (360, windmill...)
  sidePlays: 6, // seconds the one-character mode's side play list shows at the start of a possession // game speed while the play / scheme menu is open
  // the full game (Phase 8): 4 × 1:30 running clock, 1:00 overtimes (SIM.quarterSec / SIM.overtimeSec)
  periodBreak: 2.5, // seconds between periods
  drain: 0.11, // energy (0–100) lost per second on court, at Stamina 50; ×1.5 at Stamina 0, ×0.5 at 99
  sprintDrain: 2.5, // × while sprinting (turbo)
  recover: 0.6, // energy back per second on the bench
  tiredSpeed: 0.85, // top speed share at zero energy (ratings use SIM.tiredFloor)
  // SIM THE REST plays at the live game's pace: about 46 possessions in a live game (npm run balance:live) against
  // the sim's ~160, so the score stays on the same scale after the hand-over
  simPace: 0.29,
  // ON FIRE (Phase 9, PLAN.md §3): this many straight makes by one Pokémon, until the other team scores
  fireAfter: 3,
  fireWindow: 1.5, // × the green zone while on fire
  // moving
  speedMin: 4.2, // m/s at Speed 0
  speedMax: 7.2, // m/s at Speed 99
  accel: 30, // m/s² toward the direction held: high = snappy
  dribbleSlow: 0.92, // speed share with the ball
  turboBoost: 1.35,
  turboDrain: 0.45, // tank per second of turbo (tank is 0–1)
  turboRegen: 0.2,
  bump: 0.7, // players closer than this push apart
  // shooting: hold K, release at the top of the meter
  meterTime: 0.75, // seconds to fill the meter to the top: the perfect release
  meterOver: 1.3, // held past this, the shot goes up late by itself
  airballBelow: 2, // let go more than this many green-zone widths under the line: too weak, it falls short
  // long range (half and full court): past longFrom metres (× court size) the make chance falls off exponentially,
  // over a distance set by Shooting + Strength on a steep curve: weak players can't, elite ones sometimes can
  longFrom: 8.5,
  longFallMin: 1, // metres the chance takes to fall to about a third, for the weakest
  longFallMax: 7, // ... for the best
  longPower: 3, // how steep the curve from weakest to best is (higher: only the very best get far)
  doubleSteer: 0.7, // the double jump turns you toward the stick, at least this × top speed
  doubleJump: 0.75, // Flying and Dragon types: a second jump in the air, this strong (× their first)
  windowMin: 0.07, // half-width of the green zone at rating 0 (share of the meter)
  windowMax: 0.17, // ... at rating 99
  perfectShare: 0.35, // the middle of the green zone that counts as PERFECT
  contestRange: 1.6, // a defender this close contests
  contestShrink: 0.45, // a full contest shrinks the green zone by this share
  deepFrom: 8.5, // shots from past this are deep
  deepShrink: 0.025, // green zone lost per metre past deepFrom
  rimRange: 2.6, // closer than this is a finish (Finishing, not Shooting)
  threeAt: 6.75,
  timing: { perfect: 0.3, good: 0.12, miss: -0.25 }, // added to the base make chance (SIM rim/mid/three)
  ratingSlope: 0.004, // make chance per rating point above 60
  shotFloor: 35, // shooting/finishing ratings are lifted toward the middle in live games: 0 counts as this, 99 stays 99
  // (low-rated Pokémon still make a fair share of good, open shots; the order of who's better doesn't change)
  contestPenalty: 0.22, // make chance lost to a full contest
  dunkRange: 2.4, // turbo + K this close goes to the rim
  dunkTime: 0.45,
  layupRange: 2.2, // metres from the rim: a quick tap this close is a layup (soft, off the glass, finishing-rated)
  layupBonus: 0.08, // make chance a layup adds over a plain shot at the rim
  oopRange: 3.4, // metres from the rim a receiver can be for a pass to become an alley-oop
  oopFinishing: 60, // Finishing a receiver needs to catch and slam one
  ballCallRoom: 4.5, // metres of clear floor round a teammate before he calls BALL! BALL! (wide open only)
  oopPassMax: 12, // metres: a longer pass than this is never an alley-oop (no lobs from near full court)
  coachLearnAfter: 3, // CPU defence: defensive trips with a scheme before it judges it...
  coachBadPpp: 1.3, // ...and points a trip it gives up that make it switch to its best other scheme
  dunkApex: 0.55, // metres the ball rises above the rim before the slam
  dunkSlamTime: 0.08, // seconds for the ball to be hammered down through the rim (speeding up all the way)
  dunkSlam: 6, // m/s the dunker is pulled down with the slam
  // jumping and blocking
  gravity: 14,
  jumpMin: 4.2, // take-off speed m/s (from Finishing + Rebounding)
  jumpMax: 5.6,
  reachMin: 2.0, // standing reach in metres (from height percentile)
  reachMax: 2.9,
  blockRange: 1.0, // hand to ball, across the floor
  blockWindow: 0.35, // seconds after release a shot can still be blocked
  blockBase: 0.35,
  blockSlope: 0.006, // per point of the defender's Interior D over the shooter's rating
  // steals and crossovers
  stealRange: 1.4,
  stealBase: 0.22,
  stealSlope: 0.006, // per point of Perimeter D over Handles
  stealCool: 0.5,
  stumble: 0.55, // seconds frozen after a missed steal
  crossTime: 0.3,
  crossCool: 1.4,
  crossBoost: 1.5,
  stepBackBoost: 0.8, // × the crossover burst for a step-back (crossover while pushing away from the hoop)
  doubleTap: 0.3, // seconds: two sprint presses this close are a double tap (the crossover / steal)
  ankles: 0.4, // seconds a beaten defender stumbles
  anklesChance: 0.35, // plus 0.005 per point of Handles over Perimeter D
  // 1v1: a beat for you to set up, and no smothering at the start of a possession
  halfKeepAt: 3, // half-court: a side with this many points keeps the ball after it scores (make it, take it); below it,
  // and after any miss, the ball goes to the other side (a check at the top)
  halfPause: 0.7, // half-court: seconds the CPU ball handler holds (a stationary dribble) after taking it back or a check
  pickupGap: 3, // metres most CPU defenders sit off a handler still in his backcourt (half court: taking it back)
  pressWhiff: 2.2, // × the stumble for a missed steal out in the handler's backcourt (half court: past the arc)
  stealGrace: 0.8, // seconds after getting the ball before a CPU defender tries a steal
  // CPU screens outside called plays: the teammate nearest the ball comes up beside it, plants, then rolls to the rim
  aiScreenRate: 0.15, // tries per second (for the teammate nearest the ball)
  aiScreenHold: 1.5,
  screenAsk: 4.5, // metres: the ball handler running straight at a teammate standing still makes him set a screen // seconds it stays planted
  // floaters and eurosteps: moving toward the hoop faster than driveSpeed counts as driving
  driveSpeed: 2, // m/s toward the hoop
  floaterRange: 3.6, // a quick tap while driving, between layupRange and this from the rim, is a floater
  floaterBonus: 0.05, // make chance a floater adds (Finishing + Shooting; contests count half: it goes over the big)
  floaterAi: 0.6, // CPU floaters per second driving at the rim 2.5–4.5 m out with a man close (× its style's drive)
  euroAi: 0.8, // CPU eurosteps per second driving inside eurostepRange with a man close (× its style's drive)
  eurostepRange: 5.5, // the crossover while driving this close to the rim is a eurostep
  euroTime: 0.45, // seconds for its two plants
  euroPass: { from: 0.3, max: 0.8 }, // team games: a eurostep's finish is a pass instead, more likely the tighter the
  // contest (none below `from`, up to `max` when smothered)
  euroSlow: 0.35, // seconds a defender in front is held up (lighter than ankles)
  specialDunk: { onFire: 0.35, breakaway: 0.15, base: 0.02 }, // chance a dunk is a 360 / windmill / tomahawk / eastbay
  // loose balls
  grabBase: 0.55, // grab radius in metres at Rebounding 0
  grabSlope: 0.006,
  deadBall: 1.0, // pause after a make before the inbound
};

/** How the CPU plays in the live game, by difficulty (PLAN.md §8). */
/** CPU play styles (ai.ts styleOf picks one per Pokémon from its ratings). Multipliers on how often it pulls up
 *  (shoot), passes, drives and crosses over (drive), likes the three (three) and gambles for steals (steal), and how
 *  many seconds it holds the ball, stuck, before it forces a shot or a drive (patience). */
export const AI_STYLES = {
  BALANCED: { shoot: 1, pass: 1, drive: 1, three: 1, steal: 1, patience: 2.6 },
  AGGRESSIVE: { shoot: 1.3, pass: 0.7, drive: 1.8, three: 0.8, steal: 1.6, patience: 1.6 },
  "PASS FIRST": { shoot: 0.6, pass: 2.2, drive: 0.8, three: 1, steal: 1, patience: 2.4 },
  "BALL HOG": { shoot: 1.7, pass: 0.2, drive: 1.3, three: 1.2, steal: 1, patience: 1.8 },
  SHARPSHOOTER: { shoot: 1.4, pass: 1, drive: 0.6, three: 2.4, steal: 0.8, patience: 2.6 },
};
export type StyleName = keyof typeof AI_STYLES;

export const LIVE_AI: Record<(typeof DIFFICULTIES)[number]["name"], {
  react: number; // seconds before it sees where you moved
  aim: number; // spread of its shot release (share of the meter)
  steal: number; // steal tries per second when in range
  block: number; // chance it tries to block a shot
  pullUp: number; // open jump shots per second
  pass: number; // passes looked for per second with the ball (team games)
}> = {
  ROOKIE: { react: 0.45, aim: 0.16, steal: 0.5, block: 0.35, pullUp: 0.5, pass: 0.6 },
  PRO: { react: 0.3, aim: 0.11, steal: 0.8, block: 0.55, pullUp: 0.7, pass: 0.8 },
  "ALL-STAR": { react: 0.2, aim: 0.07, steal: 1.1, block: 0.75, pullUp: 0.9, pass: 1.0 },
  CHAMPION: { react: 0.12, aim: 0.04, steal: 1.4, block: 0.9, pullUp: 1.1, pass: 1.2 },
};

export const OVR_MIN = 40;
export const OVR_MAX = 99;
export const ATTR_MAX = 99;
