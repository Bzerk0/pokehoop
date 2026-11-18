# all22pokemon.com teardown (2026-11-06)

Mirror: `C:\Users\hudso\AppData\Local\Temp\claude\898b1bc241fa30f0\821ac4a5-5ec1-4a47-b80b-b41df1d240a9\scratchpad\mirror` (≈350 text files, 10 MB, no images).
REA evidence: `ev_fc7ea2385f6cf46d8d1ce035d704f8bef534e2c030d06e87b2e80c65c248b8cd` (332 JS files parsed, 0 failures).

## Stack (observed)
- Static site on **Vercel**, plain HTML + **native ES modules**, no framework, no bundler, no minification. Files are full of design comments.
- Cache busting via `?v=<hash>` written by an offline tool (`tools/site/shell.mjs`, referenced in comments, not shipped).
- Strict CSP: only self, Google Fonts, `pbs.twimg.com` images, two Cloudflare Workers, Vercel Blob.
- Vercel Web Analytics (`/_vercel/insights/script.js`). No cookies set on a signed-out visit.
- Credit: `@ColeThereum` (twitter:creator).

## Products / code areas
| Path | What |
|---|---|
| `/build` → `app.js`, `pokemon.js`, `pokedata.js` | The All-22 builder: 1025 Pokémon (names + PokéAPI stats packed as `"types|stats|weight"` strings), sprites self-hosted under `/sprites/{style}/{id}.png` |
| `/baseball` → `baseball.js` | Baseball diamond builder |
| `/challenges`, `/draft`, `indigo/` | Challenge/draft runs; `indigo/` = "Indigo Series" league |
| `/play` → `game/` | "Bowl" pixel-art football game (canvas, synth audio) |
| `/pro` → `allpro/` | ALL-22 PRO: full football sim with physics, AI, Mode-7 camera, 47-play playbook, online play |
| `/slugger` → `allslugger/` | Baseball arcade game, own online mode |
| `/franchise` → `franchise/` (engine) + `franchise-ui/` (UI) | GM/franchise mode for both sports; sport profiles in `franchise/sports/{football,baseball}.js`; runs sims in Web Workers |
| `fantasy.js` | Fantasy leagues |

## Backend surface (observed in source; server code not shipped)
- `/api/app?a=` — `me, claim, roll, logout, name, resetname, age, delete, export, unlink, shiny, beta, saves, remove, ibstart, shinytest`
- `/api/franchise?a=` — `sololist, soloload, solosave, solodelete, soloname, solopend, submit, replay` + league routes (`franchise-ui/league/api.js`)
- `/api/fantasy?a=` — `create, join, lobbies`
- OAuth: `/api/auth/{x,google,discord}/start?return=…&link=1`; session cookie `a22in` (per `ds/shell.js`).
- **Shiny rolls are server-side** (`POST /api/app?a=roll` with `{game, variant, p, round}`); client only displays the result.

## Online multiplayer
- Cloudflare Workers (Durable-Object style rooms): `wss://all22-online.all22pokemon.workers.dev/ws?code=…&room=…` (PRO) and `all22-slugger-online…` (Slugger).
- Server-authoritative 60 Hz sim, 30 Hz binary snapshots; client sends binary stick input (~30 Hz) + JSON `cmd` messages. Protocol versioned (`PROTO = 6`, `allpro/net/proto.js`); players addressed by pid (home 0–22, away 32–54). Server picks best region for both players.

## Local storage
- IndexedDB `all22-franchise`: stores `slots`, `cores`, `archive`, `tickets` (ver-checked transactions to guard multi-tab writes).
- localStorage keys prefixed `pokemon-all22-*` / `all22-*` / `all22bowl-*` (lineups, style, formation, controls, volume, notes-seen).

## Runtime check
Loaded `/build` signed-out: 35 requests, all same-origin (scripts + 22 sprites) + Google Fonts + Vercel insights. No `/api` calls, no cookies.

## Unknowns
- Server code (`api/app.mjs`, Workers `online/src/room.js`) is not public; endpoint behavior inferred from client calls only.
- Pages behind sign-in and online matches were not exercised.
