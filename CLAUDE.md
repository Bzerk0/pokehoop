# starting5pokemon — rules
- Free fan project: no ads, payments, accounts, Pokémon logos/fonts/cries/anime art. Footer disclaimer on every page.
- Owner is a beginner: explain the plan in plain words before coding. End with a numbered browser test checklist.
- Do only the requested PLAN.md phase.
- src/core never imports React or Phaser. Tuning numbers live in ratingConfig.ts and the plays data.
- Use the seeded RNG in core, never Math.random. Never call PokéAPI from the running site.
- Pixel style (PLAN.md §3): 640×360 canvas, whole-number scaling, pixelArt on, palette colours only, pixel fonts only, no gradients, blur, or rounded UI. Original art and text only.
- Run npm test and npm run build before saying a phase is done.

## Where things are
- `npm run data` rebuilds `public/data/pokemon.json` and `public/sprites/` from PokéAPI (cached in `.cache/`, safe to re-run).
- Palette: `src/ui/theme/palette.ts` is the source; `src/index.css` `@theme` mirrors it (a test checks they match).
- Ratings: `src/core/ratings.ts` (formulas), `src/core/ratingConfig.ts` (numbers), `src/core/overrides.json` (hand fixes).
- Phaser is not installed yet: add it in Phase 5.
- Teams: `src/core/lineup.ts` (rules, salary cap, team OVR, warnings, auto-fill, random, share codes; cap and
  salary curve numbers in `ratingConfig.ts`), `src/core/rng.ts` (seeded),
  `src/storage.ts` (Free Build's working team, up to 20 saved teams stored as share codes, the draft in progress).
  Pages: `/draft` (DraftPage, the main way to build a team), `/build` (Builder, shown as FREE BUILD), `/t/<code>`
  (SharedTeam). The PNG card is `LineupCard`, saved by html-to-image at pixelRatio 2. Shared team bits (payroll
  meter, colour pickers, share link, PNG) live in `src/ui/components/TeamControls.tsx`.
- The draft: `src/core/draft.ts` (dealing offers by tier, pick then place on any open spot, rerolls, grades). Tiers,
  offers per round, rerolls and grade cut-offs are in `ratingConfig.ts`; the grades were calibrated by simulating
  600 drafts per strategy, so re-simulate if you change the cap, salaries, tiers or chemistry.
- Chemistry: `src/core/chemistry.ts` (links: evolution line via `chain` in the data, starter trio, type trio, rival
  pairs, famous squads, whole-team region/type). Boost sizes in `ratingConfig.ts` (CHEM, CHEM_MAX); the pair and
  squad lists are data in chemistry.ts (a test checks every slug exists). Team OVR and draft grades include it.
- Shared UI: `Modal.tsx` (pop-up window, PlayerModal stat card, the "i" StatsButton), `ProfOak.tsx` (warnings in a
  speech bubble from the left edge; sprite `public/art/oak.png`, cropped from `public/art/oak-sheet.png`), `ChemistryList.tsx`. Free Build's page doesn't
  scroll on desktop: only the picker list does.
- Arcade cabinet: `src/ui/components/ArcadeCabinet.tsx` shows the 3D cabinet (`Cabinet3D.tsx`, shape and camera numbers at the top; front pieces in `cabinetParts.tsx`) on the title, and just the screen panel (bezel and side trim), as big as it goes, once you press Start. Both share one screen-sized stage; the 3D screen's front pose must land on the bare screen's spot, so keep FRONT_SHIFT if you change the shape.
- Whole-number scaling counts real screen pixels (`PixelStage`: devicePixelRatio), so on a 1.5× display the art is 2× or 3×, never 1.5×.
