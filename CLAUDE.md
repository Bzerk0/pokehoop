# starting5pokemon — rules
- Free fan project: no ads, payments, accounts, Pokémon logos/fonts/cries/anime art. Footer disclaimer on every page.
- Owner is a beginner: explain the plan in plain words before coding. End with a numbered browser test checklist.
- Do only the requested PLAN.md phase.
- src/core never imports React or Phaser. Tuning numbers live in ratingConfig.ts and the plays data.
- Use the seeded RNG in core, never Math.random. Never call PokéAPI from the running site.
- Pixel style (PLAN.md §3): 640×360 canvas, whole-number scaling, pixelArt on, palette colours only, pixel fonts only, no gradients, blur, or rounded UI. Original art and text only.
- Run npm test and npm run build before saying a phase is done.

## Where things are
- The game is called POKéHOOP: `src/ui/name.ts` (`GAME_NAME`) for the cabinet, team card and shares; the title logo
  (Title.tsx) and index.html spell it out themselves. "STARTING 5" left in the UI is the basketball term, not the name.
- `npm run data` rebuilds `public/data/pokemon.json` and `public/sprites/` from PokéAPI (cached in `.cache/`, safe to re-run).
- Palette: `src/ui/theme/palette.ts` is the source; `src/index.css` `@theme` mirrors it (a test checks they match).
- Ratings: `src/core/ratings.ts` (formulas), `src/core/ratingConfig.ts` (numbers), `src/core/overrides.json` (hand fixes).
- Live game (Phases 5–6: 1v1, 3v3, 5v5): rules in `src/core/live/game.ts` (pure, seeded, tested; tuning in
  `ratingConfig.ts` LIVE/LIVE_AI). One engine for any team size: `g.players` is side 0 then side 1 in lineup order,
  `ball.holder` is a player index, `g.control` is the side-0 player you steer (follows the ball on offence; the
  defender nearest the ball when the CPU gets it; on defence the pass key J switches and L steals, the user's call). J passes to the teammate you face, 1–5 to a
  slot; defenders in the lane can intercept. 24 s shot clock (`LIVE.shotClock`, the user's choice over the plan's 14; resets on a change of hands or a rim hit); after a make
  or violation the team inbounds from its own baseline with a real pass. AI per player in `src/core/live/ai.ts`
  (offence spots/cuts/drive/shoot/pass, man-to-man with one helper, box out). Passes are lobbed over a defender in
  the lane. Phase 7: plays (PICK & ROLL, ISOLATION, POST UP, MOTION) and schemes (MAN, 2-3 ZONE, PRESS, DOUBLE STAR)
  are data in `src/core/live/plays.ts` (spots, timings, CPU preference from ratings); `g.calls[side]` holds each
  team's play (this possession only) and scheme; screens hold up a defender who runs into the screener. Q opens the
  play menu (with the ball) or defence menu (without), see-through, slowing the game and every animation to `menuSlow`
  (LiveView's `vt` clock); `makeCoach` is the CPU bench (calls plays
  once over half court; picks a scheme each defensive trip: press when behind, double a star, zone poor shooters).
  Phase 8: 3v3/5v5 are full timed games (`lineupGame` builds one from two saved lineups: starters by size, the rest on
  the bench): 4 × 1:30 running clock + 1:00 overtimes, energy that drains (faster sprinting) and slows/weakens players,
  auto subs at stoppages (like the sim), a box score in the sim's `stats.ts` shape (`boxes`, `liveResult`) and
  highlights. 1v1 stays first to 11, untimed. "Sim the rest" (`src/core/live/handover.ts`, 5v5 only) copies the live
  state into the sim and finishes it with `simFrom` at the live pace (`LIVE.simPace`), so the score stays on scale.
  The pause menu (ArcadePage) has subs, music, sim the rest; a full game ends on PlayPage's `Results`.
  Phase 9: ON FIRE (`LIVE.fireAfter` straight makes: type-coloured flame aura, `fireWindow` × green zone, free
  sprinting, until the other team scores). HOW TO PLAY (Play page) is a 3v3 practice game (`practice`: no shot clock,
  no winner) run by `src/game/tutorial.ts` (7 steps, each with a setup, a check and a hint); `tutorial.test.ts`
  scripts a new player through it in under 2 minutes. Events made between game steps (a Q-menu call) are handled
  at once in LiveView (`extraEvents`), since the next step clears `g.events`. Key remapping: `src/game/keys.ts`
  (action → key code, saved in localStorage; arrows, Space and right Shift always work too; Enter, Esc and 1–5 can't be
  rebound); the pause menu's CONTROLS screen rebinds; the HUD, intro and tutorial text show your own keys ({action}
  placeholders in tutorial.ts).
- Replays (`src/game/replay.ts`, no Three.js): a `Recorder` keeps the last 6 s (a snapshot per step), a `ClipSpotter`
  turns events into clips (dunk, step-back three, ankles, block, chase-down, buzzer-beater; events carry `who`/`vs`),
  `cameraFor` scripts the angles per kind (cuts numbered), `replaySpeed` the slow-mo round `keys`. LiveView films each
  step, replays the biggest clip at the next stoppage (LIVE.replay*: on/off, min hype, gap, slow-mo; dev menu REPLAYS),
  pausing the game and painting snapshots onto `g` (restored after), and plays the top `topPlays` as a reel before
  the results. Replays show your end's stands and a solid near hoop (`nearOnly`/`nearFade`), fade players in front of
  the star, and add afterimages, squash/stretch, shockwave, dust and a rim bend. Dev builds expose `window.__live`.
  Live cinematics (`LIVE.liveCine`): when a good finisher (Finishing 70+) takes off for a dunk, LiveView cuts live to
  the dunk camera script (`cine`, a framesless Clip on the game clock), slows the game itself round the slam
  (`replaySpeed`), fires the slam effects on the make, and cuts back on landing; that dunk isn't instant-replayed.
  A block during it holds the shot and shows a caption (BIG BLOCK! / BLOCKED BY X!). Dunks rise to `LIVE.dunkApex`
  over the rim, then the ball is hammered down in `dunkSlamTime` (a pure ease-in arc) and the dunker drops at `dunkSlam`.
  Alley-oops (game.ts `passBall`): a pass to a Finishing-`oopFinishing`+ teammate within `oopRange` of the rim is a
  lob (`flight.oop`) to just above the rim; the receiver takes off (`startDunk`) so the top of the leap meets it, catches
  it there (`dunkStep` hangs until it has the ball) and slams. Live cuts (`watchForCine`, gap `LIVE.cineGap`): oop
  lobs, dunk take-offs, blocks (caption via `bigBlock`) and corner threes (`cornerThree`). Flashy bits: the ball burns
  with a flame trail on slams and oop lobs (`drawBallFire`); blocks throw a shockwave, steals a dust puff, made threes
  a ring off the net (in normal play too).
  Countdown beeps: LiveView `countdown()` (last 5 s of the shot clock; higher for the quarter clock).
- Title screen (test): attract mode. `Title.tsx` runs a LiveView with `attract: true` (CPU-vs-CPU 5v5 fast-forwarded
  off screen, each spotted clip shown through the replay cameras; no HUD, sound or keys) under the logo; INSERT COIN
  (Enter/Space/click: the first press zooms in from the cabinet, the next drops the coin) opens the menu: big PLAY and DRAFT buttons, small ABOUT and POKéDEX under them (arrows move, Esc steps back), a fan-game notice along the bottom; Free Build is reached from the draft and Play pages. The previous title (arena + flaming-ball PRESS START) is
  `OldTitle.tsx`, unrouted: route "/" to it in App.tsx to switch back.
- Credits: anything someone else made goes in `src/ui/credits.ts` (for the Phase 10 About page). Sound files live in
  `public/sfx/` (the coin: Alex_Jauk on Pixabay, bitcrushed with ffmpeg `acrusher`); everything else is made in code.
- Title screen performance: big static pixel art is painted once into canvases (`RectCanvas.tsx`), never SVG rects,
  and every animated title piece (`.t-anim`) is its own compositor layer (will-change). Keep it that way: SVG art
  re-rasterises on every animation step, worst inside the 3D cabinet.
- Gameplay aids (LIVE in ratingConfig.ts): quick shot (K tapped under `quickTap`: no meter, no air ball, accuracy
  falls off with distance, `quickChance`); your block jump drifts toward a nearby shot (`blockNudge`, the player you
  steer only: on the CPU it swatted too many of your shots); chase-down blocks (sprinting in from behind:
  `chaseRange`/`chaseSpeed`); a block meter (LiveView: red bar by a winding shooter, jump at the 0.8 line); passes
  hand you the receiver on the catch, not the throw, and an AI receiver steps toward the ball.
- HUD/arena extras: scoreboard top centre (names, scores, period clock, shot clock); a shot clock sprite above each
  backboard (your end's small and faint so it never hides the play) and a red board glow + double buzzer on a
  violation; clear blue rings under your teammates, yellow under whoever J would pass to (the CPU's players get only a shadow); a "P1" ▼ over you.
  A quick tap of sprint with the ball is a crossover (`LIVE.sprintTap`; test option `sprintOnL` = 1 in the dev
  menu: L sprints and a double tap of L, `doubleTap`, is the crossover/steal); a crossover pushing away from the hoop is a
  step-back (`stepBackBoost`).
- Long shots: past `longFrom` (× court size) the make chance × `longShotFactor` (exponential falloff over a distance
  set by 0.6 Shooting + 0.4 Strength to the power `longPower`). Special abilities (prototype): Flying/Dragon types
  double jump (`canDoubleJump`, `LIVE.doubleJump`; the stick redirects it, `doubleSteer`; the CPU doesn't use it yet). Game over: a beat (ENDING in
  LiveView), then losers tip over, winners hop, womp womp / fanfare (sound.ts), then the menu. The near hoop has no
  shot clock (the far one and the scoreboard do).
- Dev menu (` in a live game, or DEV in the pause menu): `src/game/dev.ts` + `src/ui/components/DevPanel.tsx` edit
  any number in LIVE live (grouped list with notes in DEV_GROUPS; the rest under EVERYTHING ELSE), saved in
  localStorage `s5p-dev-v1` (only changed values) and applied when ArcadePage loads. COURT uses getters so court size
  can change too (on the next game). New LIVE numbers show up automatically; add a note in DEV_GROUPS if useful.
- Court size: `LIVE.courtScale` (1.15 = the user's "15% bigger" test; 1 = a real court) scales `COURT` (size, lines,
  three-point arc), the spots, zones, play spots and play timings; players, rim height and pass/shot physics don't.
- Editing on Windows: change files with the Edit/Write tools, not PowerShell Get-Content/Set-Content (PowerShell 5.1
  reads UTF-8 as ANSI and mangles é, …, ◀ and the like).
  `npm run balance:live [size] [level] [games] [scheme]` plays full CPU-vs-CPU games (with coaches) and reports
  possession flow, calls, subs and margins; re-run it after tuning. The court runs up the screen
  and you ALWAYS attack the top hoop, in 3D (the user's choice, unlike NBA Jam's side view). Three.js draws it
  (`src/game/LiveView.ts`, loaded on demand, replaces the plan's Phaser): a camera behind your end looking up the
  court, rendered at 640×360 and scaled by a whole number, keeping the player you steer in shot; Pokémon are flat
  sprites in the 3D world (they shrink with distance, the one exception to whole-number sprite scaling) on team-colour
  rings (yours gold); a 2D canvas on top draws the HUD, shot clock, meters and teammate numbers. Your own hoop is
  see-through so it never hides the play. Music: `src/game/music.ts`. Page `/play/live` (ArcadePage), started from
  Play's ONES / THREES / FIVES buttons via `CharacterSelect.tsx` (pick a team, then the players: `ArcadeSetup.picks` =
  lineup slots → `lineupGame`'s `homePicks`; the rest are the bench; FIVES' ENTIRE TEAM = starters + bench). SIM GAME
  sits apart below. SOLO (test) = 5v5 as one Pokémon: `g.solo` keeps `g.control` fixed (no switch on a catch or on
  defence), the pass key without the ball calls for it, the
  inbound always comes to you, a red ring marks your man on defence, and LiveView opens the (slowing) play menu on
  each quarter's first possession; later ones get a side list for `LIVE.sidePlays` s where Q steps to the next play.
  Character select's Pokédex is `DexBrowser.tsx` (shared with the Pokédex page; picks may be any Pokémon: they go
  first in the home lineup, the rest of your team is the bench). Arrowheads in the UI are the pixel `Arrow` component, not the ▶ ◀ glyphs (they render smooth).
- Teams: `src/core/lineup.ts` (rules, salary cap, team OVR, warnings, auto-fill, random, share codes; cap and
  salary curve numbers in `ratingConfig.ts`), `src/core/rng.ts` (seeded),
  `src/storage.ts` (Free Build's working team, up to 20 saved teams stored as share codes, the draft in progress).
  Pages: `/draft` (DraftPage, the main way to build a team), `/build` (Builder, shown as FREE BUILD), `/t/<code>`
  (SharedTeam). The PNG card is `LineupCard`, saved by html-to-image at pixelRatio 2. Shared team bits (payroll
  meter, colour pickers, share link, PNG) live in `src/ui/components/TeamControls.tsx`.
- The draft: `src/core/draft.ts` (dealing offers by tier, pick then place on any open spot, rerolls, grades). Tiers,
  offers per round, rerolls and grade cut-offs are in `ratingConfig.ts`; the grades were calibrated by simulating
  600 drafts per strategy, so re-simulate if you change the cap, salaries, tiers or chemistry.
- Chemistry: `src/core/chemistry.ts` (links: evolution line via `chain` in the data, starter trio, same type (trio, ×4–×7, all 8: `CHEM.typeTrio`/`typeMore`), rival
  pairs, famous squads, whole-team region/type). Boost sizes in `ratingConfig.ts` (CHEM, CHEM_MAX); the pair and
  squad lists are data in chemistry.ts (a test checks every slug exists). Team OVR and draft grades include it.
- Games: `src/core/cpuTeam.ts` (CPU teams by difficulty band, ignore the cap), `src/core/sim/sim.ts` (possession
  sim, `simRest` finishes a game from any state), `src/core/stats.ts` (box score shape shared with the live game).
  All tuning in `ratingConfig.ts` (DIFFICULTIES, SIM). `npm run balance` sims 10,000 games; keep a 15-OVR favourite
  at 75–90% wins and team scores at 75–110 (sim.test.ts checks both). Page: `/play` (PlayPage: Pre-Game + Results).
- Shared UI: `Modal.tsx` (pop-up window, PlayerModal stat card, the "i" StatsButton), `ProfOak.tsx` (warnings in a
  speech bubble from the left edge; sprite `public/art/oak.png`, cropped from `public/art/oak-sheet.png`), `ChemistryList.tsx`. Free Build's page doesn't
  scroll on desktop: only the picker list does.
- Arcade cabinet: `src/ui/components/ArcadeCabinet.tsx` shows the 3D cabinet (`Cabinet3D.tsx`, shape and camera numbers at the top; front pieces in `cabinetParts.tsx`) on the title, and just the screen panel (bezel and side trim), as big as it goes, once you press Start. Both share one screen-sized stage; the 3D screen's front pose must land on the bare screen's spot, so keep FRONT_SHIFT if you change the shape.
- Whole-number scaling counts real screen pixels (`PixelStage`: devicePixelRatio), so on a 1.5× display the art is 2× or 3×, never 1.5×.
