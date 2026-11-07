# starting5pokemon — Build Plan

A free fan-made, pixel-art, real-time arcade basketball game where the players are Pokémon. Build a starting five, then play live against a CPU team or sim the game.

---

## 0. How to use this plan
**Setup (once):** install Node.js (LTS), Git, VS Code, and Claude Code. Create GitHub and Vercel accounts. Put this file in a folder called `starting5pokemon` and run `claude` there.

**For each phase:**
1. Prompt: *"Read PLAN.md and CLAUDE.md. Do Phase N only. Show me your plan and wait for my OK, then build it, run the tests, and give me a browser test checklist."*
2. Test with `npm run dev`. If something breaks, tell Claude Code what you did, what you expected, and what happened, and paste any error text.
3. When it works: *"Commit and push this phase."* Then run `/clear` before the next phase.

---

## 1. Scope

| | |
|---|---|
| Main mode | **Play:** real-time 5v5 with the keyboard. You control the ball-handler and defender and call plays |
| Alt mode | **Sim:** instant result + box score, for the same matchup |
| Opponent | Random CPU team at a chosen difficulty |
| Game length | 4 × 1:30 quarters, 5–8 min |
| Pool | Default forms of all species. **Classic** = no legendaries or mythicals. **Unlimited** = all |
| Platform | Desktop browser, keyboard |
| Saving | localStorage only. No accounts, no backend |
| Sharing | PNG lineup card + share link with the lineup encoded in the URL |

**Not in v1:** accounts, leaderboards, multiplayer, mobile controls, seasons/franchise/draft modes, fouls and free throws, real ball physics, alternate forms.

---

## 2. Fan-project rules
- Footer on every page: *"Free fan project. Not affiliated with or endorsed by Nintendo, Game Freak, Creatures, or The Pokémon Company. Pokémon names and sprites belong to their respective owners."*
- No ads, payments, or donations.
- No official logos, Pokémon fonts, cries, music, or anime art. Sprites from PokéAPI only.
- All UI, art, and popup text are original. Don't copy all22pokemon.com or NBA Jam assets or catchphrases.
- Sounds and fonts must be free or open-licence (CC0/OFL).

---

## 3. Visual style: pixel arcade on every screen
- Game canvas renders at **640×360** and scales up by **whole numbers only**, with letterboxing. Phaser `pixelArt: true`, `roundPixels: true`. CSS `image-rendering: pixelated` on all images.
- One ~32-colour palette (`src/ui/theme/palette.ts`, mirrored in Tailwind). No gradients, blur, or rounded modern UI. Use hard pixel borders, flat colours, and 1–2px shadows.
- Self-hosted pixel fonts: **Press Start 2P** (headings, scores) + **VT323** or **Pixelify Sans** (body text).
- **Sprites:** PokéAPI default front sprites, cropped to visible pixels, drawn at 1× (2× if under 24px tall). Never use fractional scaling. Motion comes from code: bounce, squash on landing, flip by direction, pixel shadow.
- **Arcade presentation:** PRESS START title screen, big popup text on highlights, screen shake + 2–3 frame hit-pause on dunks and blocks, 8-bit sound effects.
- **ON FIRE:** 3 straight makes by one Pokémon gives a type-coloured aura, a bigger shot window, and turbo that doesn't drain, until the other team scores.
- **Menus:** RPG-style dialogue boxes with typewriter text, a blinking ▶ cursor, full keyboard navigation (arrows/Enter/Esc), and a blip sound on every move.
- **Player cards:** pixel frame coloured by type, sprite, big OVR number, segmented HP-style attribute bars.

---

## 4. Tech stack
TypeScript · Vite · React + React Router (menus) · Phaser (game) · Tailwind · Vitest · html-to-image (PNG) · sharp (sprite cropping) · Vercel static hosting. Start from the official Phaser + React + TS + Vite template if there is one.

```
scripts/build-data.ts      PokéAPI → public/data/pokemon.json + public/sprites/
src/core/                  pure TS, no React/Phaser, unit-tested
  types, rng (seeded), ratings, ratingConfig, overrides.json,
  lineup (validate, encode/decode), cpuTeam, sim/, stats
src/game/                  Phaser: scenes (Boot, Match, Hud), entities, ai/, controls, bridge
src/ui/                    React pages: Title, Dex, Builder, PreGame, Play, Results, About; theme/
src/storage.ts             localStorage
```
The live game and the sim both use `src/core`, so a Pokémon has the same ratings in both.

---

## 5. Data (`scripts/build-data.ts`)
- Fetch from PokéAPI **at build time only**. Wait a little between requests, cache to disk, and make the script safe to re-run.
- Default form per species:
```ts
type PokemonData = {
  id: number; name: string; slug: string; generation: number;
  types: string[];
  heightM: number;   // API decimetres / 10
  weightKg: number;  // API hectograms / 10
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  isLegendary: boolean; isMythical: boolean;
  sprite: string; spriteW: number; spriteH: number; // cropped
};
```

---

## 6. Ratings (all numbers in `ratingConfig.ts`)
1. **Normalise:** convert each stat, log(height), and log(weight) into a percentile (0–100) across the pool.
2. **Attributes (0–99):**

| Attribute | Formula | Drives |
|---|---|---|
| Speed | .80 Spe + .20 (100−Wt) | Movement |
| Shooting | .55 SpA + .25 SpD + .20 Spe | Jump shots, shot window |
| Finishing | .50 Atk + .25 Ht + .25 Spe | Layups, dunks |
| Handles | .50 Spe + .30 SpD + .20 SpA | Steal resistance |
| Passing | .40 SpD + .40 SpA + .20 Spe | Pass speed and accuracy, AI decisions |
| Perimeter D | .50 Spe + .30 Def + .20 SpD | Steals, contests |
| Interior D | .40 Ht + .35 Def + .25 HP | Blocks, rim contests |
| Rebounding | .40 Ht + .25 Wt + .20 HP + .15 Atk | Rebounds |
| Strength | .50 Wt + .30 Atk + .20 Def | Posts, box-outs, screens |
| Stamina | HP | Fatigue |

3. **Type bonuses** (they stack, cap 99): Electric +5 Spd · Flying +5 Reb −3 Str · Fighting +5 Fin +3 Str · Psychic +5 Pass +3 Shoot · Steel +5 IntD · Rock +4 Str · Ghost +5 PerD · Dark +4 Hand · Ice +4 Shoot · Fire +4 Fin · Ground +4 Reb · Water/Grass +3 Stam · Bug +4 Spd · Fairy +4 Pass · Poison +3 PerD · Dragon +2 all · Normal +2 Hand +2 Pass.
4. **Position OVR**, rescaled to roughly 40–99:
   - PG: Hand .25, Pass .25, Shoot .20, Spd .15, PerD .15
   - SG: Shoot .35, PerD .20, Spd .15, Hand .15, Fin .15
   - SF: Fin .20, Shoot .20, PerD .20, Spd .15, Str .15, Reb .10
   - PF: Reb .25, IntD .20, Fin .20, Str .20, Shoot .15
   - C: IntD .30, Reb .30, Str .20, Fin .20

   A Pokémon's best position is its highest OVR. It can play any slot at that slot's OVR.
5. **`overrides.json`:** hand-adjust any attribute or best position per Pokémon.

Height affects jump reach and hitboxes, not how big the sprite is drawn.

**Tests:** Machamp Fin > Pikachu Fin. Snorlax Reb is in the top 10%. Alakazam's best position is PG or SG. Jolteon Spd is in the top 5%. Metagross and Tyranitar have high PF/C OVR. Every value is 0–99.

---

## 7. Lineup builder
- Slots: PG, SG, SF, PF, C + 3 bench. No duplicates. Classic/Unlimited mode is enforced.
- Show each candidate's OVR at the selected slot and its best position.
- Team OVR = 80% starters + 20% bench. Warnings: fewer than 2 players with Shooting 70+; average height percentile under 35.
- Auto-fill, Random team, team name, 2 jersey colours.
- Save up to 20 teams. Load, rename, delete.
- Share: a PNG card (whole-number scale) and a `/t/<base64>` link that loads the team.

---

## 8. CPU teams
- Difficulty by team OVR: Rookie 55–65, Pro 65–75, All-Star 75–85, Champion 85+ (Unlimited only).
- For each slot, sample ~15 eligible Pokémon and take the best fit inside the band. Name the team from a word list. Seeded.
- Difficulty also sets AI reaction delay, steal/block attempt rate, and shot selection.

---

## 9. Sim engine (`src/core/sim`)
- Seeded, possession by possession, ~50 possessions per team (±10% by team Speed).
- Each possession: pick a shooter (weighted by Shoot + Fin + Hand) → turnover check → shot type (rim/mid/3) → make chance = logistic(off − def) around base rates (rim 60%, mid 42%, 3PT 35%) → block check → rebound (offensive ~25% base) → assist credit.
- Stamina drains each possession. Bench players sub in below a threshold.
- Output: score, quarter scores, box score (PTS, REB, AST, STL, BLK, TO, FG, 3P, MIN), and 5–8 highlight lines.
- Must be able to **sim the rest** from any game state (used by the live game).

**Tests:** same seed gives the same result. Over 1,000 games, average team score is 75–110. A team +15 OVR better wins 75–90% of the time. Player points add up to the team total.

---

## 10. Live game
**Core simplification:** the make/miss, steal, block, and rebound result is decided by a probability roll when the action happens, then animated. Don't use ball physics.

**Court:** horizontal full court, slight top-down angle, camera follows the ball. Entities have x, y, and z (height for jumps and ball arcs), with shadows. A ring under the player you control.

**Rules:** 5v5, 4 × 1:30 running clock, 14s shot clock, 2s and 3s, players clamped to court bounds, automatic inbound after a make, 1:00 overtime. Fatigue builds while sprinting. Auto-subs at stoppages, plus manual subs in the pause menu.

**Controls:**
| Key | Offence | Defence |
|---|---|---|
| WASD/Arrows | Move | Move |
| Shift (hold) | Turbo | Turbo |
| J | Pass to the teammate you're facing. 1–5 passes to a specific player | Steal (a miss causes a stumble) |
| K (hold/release) | Shoot with the shot meter. Near the rim + turbo = dunk/layup | Jump/block |
| L | Crossover/spin (cooldown) | Switch to the defender nearest the ball |
| Q | Play menu (game slows) | Scheme menu |
| Esc | Pause: subs, settings, sim the rest, quit | |

- The shot-meter window gets bigger with Shooting (or Finishing near the rim). Contested shots and deep 3s get a penalty.
- Offence: your control follows the ball. Defence: control auto-switches to the defender nearest the ball when possession changes.

**Plays** (defined as data in `plays.ts`): Pick & Roll · Isolation · Post Up · Motion.
**Schemes:** Man · 2-3 Zone · Full-court Press · Double the Star.

**AI** (simple state machines): teammates run the play's spots, or keep spacing if no play is called. Defenders stay between their player and the basket, help on drives, and box out. The CPU team uses the same AI and picks plays based on its ratings.

**HUD:** score, quarter, game clock, shot clock, controlled player + stamina, current play/scheme, popups.
**End of game:** live stats use the same `stats.ts` format as the sim, so both show the same box score on the Results screen.

---

## 11. Phases

| # | Build | Done when |
|---|---|---|
| 0 | Project setup, pixel theme (palette, fonts, box/button/cursor components), title screen, footer, GitHub, Vercel, CLAUDE.md | A crisp pixel title screen is live on Vercel. `npm test` runs |
| 1 | Data script, JSON, cropped sprites | Every species is present with no missing fields. Unit conversions are tested |
| 2 | Ratings, overrides, Dex page (search, filter, sort, card view) | §6 tests pass |
| 3 | Lineup builder, save/load, PNG, share link | A team survives a page reload. A shared link opens the same team in a private window |
| 4 | CPU teams, sim engine, PreGame + Results screens | §9 tests pass. You can sim and read the box score |
| 5 | Arcade 1v1: court, camera, movement, turbo, shot meter, arcs, rebounds, steals, blocks | Movement feels responsive, the meter is learnable, blocks are timeable |
| 6 | 5v5: passing, offence/defence AI, switching, possessions, inbounds, shot clock | A possession flows naturally. If 5v5 is chaotic, add a 3v3 mode first |
| 7 | Plays + schemes, with the CPU using them | Each play visibly runs. The press creates more turnovers |
| 8 | Full game: clock, OT, fatigue, subs, pause, sim the rest, difficulty | A full game plays start to finish. Difficulty levels feel different |
| 9 | Tutorial, sounds, ON FIRE, screen shake, popups, key remap, 60fps | A new player learns the game in under 2 min |
| 10 | About page with credits (PokéAPI, fonts, sounds), domain | Live, with the disclaimer everywhere |

**Testing:** Vitest for `src/core`. Manual checklists for the game. A debug overlay (backtick key) showing hitboxes, AI states, odds, and FPS. A balance script that sims 10,000 CPU games and reports win rate by OVR gap and average score.

---

## 12. CLAUDE.md (create in Phase 0)
```md
# starting5pokemon — rules
- Free fan project: no ads, payments, accounts, Pokémon logos/fonts/cries/anime art. Footer disclaimer on every page.
- Owner is a beginner: explain the plan in plain words before coding. End with a numbered browser test checklist.
- Do only the requested PLAN.md phase.
- src/core never imports React or Phaser. Tuning numbers live in ratingConfig.ts and the plays data.
- Use the seeded RNG in core, never Math.random. Never call PokéAPI from the running site.
- Pixel style (PLAN.md §3): 640×360 canvas, whole-number scaling, pixelArt on, palette colours only, pixel fonts only, no gradients, blur, or rounded UI. Original art and text only.
- Run npm test and npm run build before saying a phase is done.
```
