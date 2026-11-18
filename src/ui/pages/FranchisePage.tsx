import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { allowedIn, type Difficulty } from "../../core/cpuTeam.ts";
import {
  ageBand, autoSign, checkFranchise, draftOnClock, draftPick, efficiency, evolutionsOf, finishSlate, leaders, leagueDex, lineupOf, newLeague,
  nextStep, opponentIn, openSlots, payroll, potential, release, resign, resignPrice, room, rookieSalary, seriesWins, sign, simPhase, simYours,
  standings, swap, train, winner, YOU, yourGame, type Franchise, type STAT_KEYS, type Totals,
} from "../../core/franchise.ts";
import { dexOf, problems, salary, SLOTS, slotOvr, STARTERS, teamOvr, type Lineup } from "../../core/lineup.ts";
import { DIFFICULTIES, FRANCHISE, SALARY_CAP } from "../../core/ratingConfig.ts";
import type { GameResult } from "../../core/sim/sim.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { clearFranchise, loadFranchise, saveFranchise } from "../../storage.ts";
import { useMusic } from "../bgm.ts";
import { Arrow } from "../components/Arrow.tsx";
import { reducedMotion } from "../components/Cabinet3D.tsx";
import { ChemistryList } from "../components/ChemistryList.tsx";
import { DraftRoom, useTicker, type RoomSlot } from "../components/DraftRoom.tsx";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { teamColor } from "../components/LineupCard.tsx";
import { Modal, PlayerModal, StatsButton } from "../components/Modal.tsx";
import { Sprite } from "../components/PlayerCard.tsx";
import { RectCanvas, type Rect } from "../components/RectCanvas.tsx";
import { CapMeter } from "../components/TeamControls.tsx";
import { TipOff } from "../components/TipOff.tsx";
import { useRated } from "../data.ts";
import { backBlip, blip, moveBlip, selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import type { ArcadeSetup } from "./ArcadePage.tsx";
import { ready, Results, yourTeams } from "./PlayPage.tsx";

type Dex = Map<number, RatedPokemon>;
type Stat = (typeof STAT_KEYS)[number];
/** What every part of the page needs: the league, the ratings (plain and with development), a way to change the
 *  league (saved at once), and the stat card. */
type Ctx = { f: Franchise; dex: Dex; ld: Dex; update: (f: Franchise) => void; openCard: (p: RatedPokemon) => void };

const PLAYOFF_ROUNDS = Math.log2(FRANCHISE.playoffTeams);
const roundName = (r: number) => (r === PLAYOFF_ROUNDS - 1 ? "FINALS" : r === PLAYOFF_ROUNDS - 2 ? "SEMIFINALS" : `PLAYOFF ROUND ${r + 1}`);
const best = (p: RatedPokemon) => p.ovr[p.best];

function Panel({ title, children, className = "" }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 border-4 border-black bg-night ${className}`} style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
      <h2 className="bg-navy px-3 py-1 font-head text-[12px] leading-[20px] text-gold">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** A team's name with its jersey colour; yours in gold. */
function TeamTag({ f, t }: { f: Franchise; t: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="h-[12px] w-[12px] shrink-0 border-2 border-black" style={{ background: PALETTE[teamColor(f.teams[t].colors[0])] }} />
      <span className={`truncate ${t === YOU ? "text-gold" : "text-white"}`}>{f.teams[t].name}</span>
    </span>
  );
}

/** /franchise: start a league, then run your team through its seasons and summers. */
export function FranchisePage() {
  useMusic("menu");
  const navigate = useNavigate();
  // sent with a team (the draft's START A FRANCHISE): that team is picked at the start
  const wanted = (useLocation().state as { team?: string } | null)?.team;
  const { data, error } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const [f, setF] = useState<Franchise | null | undefined>(undefined); // undefined: not read yet
  const [saveFailed, setSaveFailed] = useState(false);
  const [card, setCard] = useState<RatedPokemon | null>(null);
  const [shown, setShown] = useState<{ result: GameResult; home: Lineup; away: Lineup; playback: boolean } | null>(null);
  const [quitting, setQuitting] = useState(false);

  useEffect(() => {
    if (!dex) return;
    const saved = checkFranchise(loadFranchise(), dex);
    setF(saved);
    if (saved && wanted) setQuitting(true); // a league's already going: ask before starting over with the new team
  }, [dex, wanted]);
  const ld = useMemo(() => (f && dex ? leagueDex(dex, f) : null), [f, dex]);
  const update = (next: Franchise) => {
    if (next === f) return;
    setF(next);
    setSaveFailed(!saveFranchise(next));
  };
  const home = () => (backBlip(), navigate("/", { state: { menu: true } }));

  // Esc goes back to the title menu (an open window closes first: it takes that Esc)
  useEffect(() => {
    if (shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && home();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (shown?.playback) return <TipOff result={shown.result} home={shown.home} away={shown.away} onDone={() => setShown({ ...shown, playback: false })} />;

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-3 font-head text-[20px] text-gold" style={{ textShadow: "2px 2px 0 var(--color-red)" }}>
        <HomeLogo />
        FRANCHISE
      </h1>
      {f && <span className="font-head text-[12px] text-cloud">SEASON {f.season} · {f.level}</span>}
      <button className="px-btn" onClick={home}><Arrow left /> BACK (ESC)</button>
    </div>
  );

  if (shown && ld) {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <Results result={shown.result} dex={ld} mine={shown.home} />
        <div className="mt-4">
          <button className="px-btn" autoFocus onClick={() => (selectBlip(), setShown(null))}>CONTINUE <Arrow /></button>
        </div>
      </div>
    );
  }

  const ctx: Ctx | null = f && dex && ld ? { f, dex, ld, update, openCard: setCard } : null;
  return (
    <div className="mx-auto max-w-[1200px] p-4">
      {header}
      {error && <div className="px-box p-3 text-red">{error}</div>}
      {!error && (!data || !dex || f === undefined) && <div className="blink font-head text-[10px] text-cloud">LOADING…</div>}
      {data && dex && f === null && (
        <Setup
          dex={dex}
          wanted={wanted}
          onStart={(l, level) => {
            selectBlip();
            update(newLeague(data, dex, l, level, (Date.now() * 2654435761) >>> 0));
            if (wanted) navigate("/franchise", { replace: true }); // done with the draft's team: a reload mustn't ask to start over
          }}
        />
      )}
      {ctx && (ctx.f.phase === "offseason" ? <Offseason ctx={ctx} /> : <Hub ctx={ctx} onShow={setShown} />)}
      {ctx && (
        <div className="mt-6 flex justify-end">
          <button className="px-btn !text-[18px]" onClick={() => (moveBlip(), setQuitting(true))}>START A NEW FRANCHISE</button>
        </div>
      )}
      {saveFailed && <p className="mt-3 text-[20px] text-red">Couldn't save: this browser is blocking storage. The league lasts until you leave this page.</p>}
      {card && <PlayerModal p={card} onClose={() => setCard(null)} />}
      {quitting && (
        <Modal title="START OVER?" onClose={() => setQuitting(false)}>
          <div className="px-box flex max-w-[460px] flex-col gap-3 p-4 text-[22px] leading-[22px] text-cloud">
            {wanted && f && <p className="text-white">You already have a league going (season {f.season}). Start a new one with your new team?</p>}
            <p>This league, its seasons and its history will be gone for good.</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-btn" onClick={() => (backBlip(), clearFranchise(), setF(null), setQuitting(false))}>YES, START OVER</button>
              <button className="px-btn" onClick={() => (setQuitting(false), wanted && navigate("/franchise", { replace: true }))}>KEEP PLAYING</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── a new league ─────────────────────────────────────────────────────────────
function Setup({ dex, wanted, onStart }: { dex: Dex; wanted?: string; onStart: (l: Lineup, level: Difficulty) => void }) {
  const navigate = useNavigate();
  const teams = useMemo(() => yourTeams(dex), [dex]);
  const sent = teams.findIndex((t) => t.key === wanted);
  const [pick, setPick] = useState(() => (sent >= 0 ? sent : Math.max(0, teams.findIndex((t) => ready(t.lineup, dex)))));
  const [using, setUsing] = useState(sent >= 0); // the list of your teams is open (USE A TEAM YOU HAVE)
  const [level, setLevel] = useState<Difficulty>("PRO");
  const team = using ? teams[pick] : undefined;
  const ok = !!team && ready(team.lineup, dex);
  const mode = team?.lineup.mode ?? "classic";
  useEffect(() => {
    if (!allowedIn(level, mode)) setLevel("ALL-STAR");
  }, [level, mode]);
  const why = (l: Lineup) => (l.ids.some((id) => id == null) ? "needs all 8 players" : problems(l, dex)[0]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="RUN A TEAM">
        <div className="flex flex-col gap-2 text-[22px] leading-[22px] text-cloud">
          <p>Take one of your teams into an {FRANCHISE.teams}-team league and run it season after season.</p>
          <p>Each season is {2 * (FRANCHISE.teams - 1)} games. The top {FRANCHISE.playoffTeams} play best-of-3 series for the title. Play any game yourself, or sim it.</p>
          <p>Every summer young Pokémon can <span className="text-gold">evolve</span>, players improve or slow down, deals run out, and you rebuild through the draft and free agency, under the ${100}M cap.</p>
        </div>
      </Panel>
      <Panel title="1. YOUR TEAM">
        <div className="flex flex-col gap-3">
          {/* the two main ways in: draft a new team, or bring one you have; Free Build is the side door */}
          {/* both big buttons look alike; gold marks the chosen one only (like the league's difficulty), so DRAFT,
              which just goes to the draft, lights up only under the pointer */}
          <button
            className="flex cursor-pointer flex-col items-start gap-1 border-4 border-white bg-navy px-3 py-3 text-left text-white hover:bg-gold hover:text-black focus-visible:bg-gold focus-visible:text-black"
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            onClick={() => (selectBlip(), navigate("/draft"))}
          >
            <span className="flex items-center gap-2 font-head text-[16px]">DRAFT A NEW TEAM <Arrow /></span>
            <span className="text-[20px] leading-[20px]">Pull or pick your squad, then bring it straight here.</span>
          </button>
          <button
            className={`flex cursor-pointer flex-col items-start gap-1 border-4 px-3 py-3 text-left disabled:cursor-not-allowed disabled:border-slate disabled:bg-black disabled:text-steel ${using ? "border-white bg-gold text-black" : "border-white bg-navy text-white hover:border-gold"}`}
            style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
            disabled={!teams.length}
            aria-pressed={using}
            onClick={() => (moveBlip(), setUsing((u) => !u))}
          >
            <span className="flex items-center gap-2 font-head text-[16px]">USE A TEAM YOU HAVE {teams.length > 0 && <Arrow />}</span>
            <span className="text-[20px] leading-[20px]">{teams.length ? "Your last draft, your Free Build team or a saved team." : "No teams yet: draft one first."}</span>
          </button>
          {using && teams.length > 0 && (
          <ul className="flex max-h-[300px] flex-col gap-2 overflow-auto">
            {teams.map((t, i) => {
              const good = ready(t.lineup, dex);
              return (
                <li key={t.key}>
                  <button
                    className={`flex w-full items-center gap-2 border-2 px-2 py-1 text-left text-[20px] leading-[20px] ${i === pick ? "border-gold bg-navy" : "border-slate bg-black"} ${good ? "" : "opacity-60"}`}
                    aria-pressed={i === pick}
                    onClick={() => (moveBlip(), setPick(i))}
                  >
                    {i === pick && <Arrow />}
                    <span className="min-w-0 flex-1 truncate text-white">{t.lineup.name}</span>
                    <span className="text-steel">{t.label}</span>
                    <span className="font-head text-[12px] text-gold">{teamOvr(t.lineup, dex) ?? "-"}</span>
                  </button>
                  {!good && i === pick && <p className="mt-1 text-[20px] text-red">Not ready: {why(t.lineup)}.</p>}
                </li>
              );
            })}
          </ul>
          )}
          <button className="px-btn self-start !text-[16px]" onClick={() => (moveBlip(), navigate("/build"))}>OR BUILD ONE IN FREE BUILD <Arrow /></button>
        </div>
      </Panel>
      <Panel title="2. THE LEAGUE">
        <div className="flex flex-col gap-2">
          {DIFFICULTIES.filter((d) => allowedIn(d.name, mode)).map((d) => (
            <button key={d.name} className="px-btn flex items-center justify-between gap-3 !text-[18px]" aria-pressed={level === d.name} onClick={() => (moveBlip(), setLevel(d.name))}>
              <span>{d.name}</span>
              <span className="text-[20px]">CPU TEAMS {d.min}-{d.max}</span>
            </button>
          ))}
          <button className="px-btn mt-2 !text-[20px]" disabled={!ok} onClick={() => team && onStart(team.lineup, level)}>
            START SEASON 1 <Arrow />
          </button>
          {!team && <span className="text-[20px] text-steel">Pick your team first.</span>}
        </div>
      </Panel>
    </div>
  );
}

// ── the season ───────────────────────────────────────────────────────────────
function Hub({ ctx, onShow }: { ctx: Ctx; onShow: (s: { result: GameResult; home: Lineup; away: Lineup; playback: boolean }) => void }) {
  const { f } = ctx;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <NextGame ctx={ctx} onShow={onShow} />
        {f.phase === "playoffs" ? <Bracket f={f} /> : f.round > 0 && <LastRound f={f} />}
        <RosterCards ctx={ctx} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Standings f={f} />
        <Leaders ctx={ctx} />
        {f.history.length > 0 && <History f={f} />}
      </div>
    </div>
  );
}

function NextGame({ ctx, onShow }: { ctx: Ctx; onShow: (s: { result: GameResult; home: Lineup; away: Lineup; playback: boolean }) => void }) {
  const { f, dex, ld, update } = ctx;
  const navigate = useNavigate();
  const mine = yourGame(f);
  const table = standings(f);
  const rec = (t: number) => {
    const s = table.find((x) => x.team === t)!;
    return `${s.w}-${s.l}`;
  };
  const round = f.playoffs.length - 1;
  const series = f.phase === "playoffs" ? f.playoffs[round].find((s) => s.top === YOU || s.bottom === YOU) : undefined;
  const label = f.phase === "season" ? `WEEK ${f.round + 1} OF ${f.schedule.length}` : roundName(round);

  const play = () => {
    if (!mine) return;
    selectBlip();
    const opp = opponentIn(mine.game);
    const home = lineupOf(f, YOU), away = lineupOf(f, opp);
    const youColor = teamColor(home.colors[0]);
    const cpuColor = teamColor(away.colors[0] === home.colors[0] ? away.colors[1] : away.colors[0]);
    const career = Object.fromEntries([...home.ids, ...away.ids].flatMap((id) => (id != null && f.career[id] ? [[id, f.career[id]]] : [])));
    navigate("/play/live", {
      state: { home, away, size: 5, youColor, cpuColor, level: f.level, franchise: { key: mine.key, season: f.season, career } } satisfies ArcadeSetup,
    });
  };
  const simMine = () => {
    if (!mine) return;
    const r = simYours(f, dex);
    if (!r) return;
    selectBlip();
    const opp = opponentIn(mine.game);
    update(finishSlate(r.f, dex));
    onShow({ result: r.result, home: lineupOf(f, YOU), away: lineupOf(f, opp), playback: !reducedMotion() });
  };
  const simOn = () => (selectBlip(), update(finishSlate(f, dex)));
  const simAll = () => (selectBlip(), update(simPhase(f, dex)));

  if (!mine) {
    // the playoffs, and you're not on: missed them, knocked out, your series waiting for the other to catch up, or
    // through and waiting
    const out = f.playoffs.some((r) => r.some((s) => (s.top === YOU || s.bottom === YOU) && winner(s) != null && winner(s) !== YOU));
    const text = !f.seeds.includes(YOU)
      ? "You missed the playoffs. Watch how it ends, then get ready for the summer."
      : out
        ? "Your season is over. Watch how it ends."
        : series && winner(series) == null
          ? `The other series catches up first. Your game ${series.games.length + 1} is next.`
          : "You're through! Waiting on the other series.";
    return (
      <Panel title={label}>
        <div className="flex flex-col gap-3 text-[22px] leading-[22px] text-cloud">
          <p>{text}</p>
          <div className="flex flex-wrap gap-2">
            <button className="px-btn" onClick={simOn}>SIM NEXT GAMES <Arrow /></button>
            <button className="px-btn" onClick={simAll}>SIM TO THE END <Arrow /></button>
          </div>
        </div>
      </Panel>
    );
  }

  const opp = opponentIn(mine.game);
  const side = (t: number) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 border-2 border-slate bg-black p-2 text-center">
      <span className="max-w-full font-head text-[12px] leading-[18px]"><TeamTag f={f} t={t} /></span>
      <span className="text-[20px] text-cloud">{rec(t)} · OVR <span className="text-gold">{teamOvr(lineupOf(f, t), ld)}</span></span>
      <span className="flex flex-wrap justify-center gap-1">
        {f.teams[t].roster.slice(0, STARTERS).map((c) => c && ld.get(c.id) && <Face key={c.id} p={ld.get(c.id)!} size={48} />)}
      </span>
    </div>
  );
  const [top, bottom] = series ? seriesWins(series) : [0, 0];
  const seriesLine = series && `GAME ${series.games.length + 1} · SERIES ${series.top === YOU ? top : bottom}-${series.top === YOU ? bottom : top}`;
  return (
    <Panel title={`${label}${seriesLine ? ` · ${seriesLine}` : ""}`}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-stretch gap-2 sm:flex-row">
          {side(YOU)}
          <span className="self-center font-head text-[12px] text-steel">{mine.game.home === YOU ? "VS" : "AT"}</span>
          {side(opp)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="px-btn !text-[20px]" autoFocus onClick={play}>PLAY IT (5 ON 5) <Arrow /></button>
          <button className="px-btn !text-[20px]" onClick={simMine}>SIM GAME</button>
          <button className="px-btn !text-[20px]" onClick={simAll}>{f.phase === "season" ? "SIM TO THE PLAYOFFS" : "SIM THE REST"}</button>
        </div>
      </div>
    </Panel>
  );
}

/** Last week's scores. */
function LastRound({ f }: { f: Franchise }) {
  return (
    <Panel title={`WEEK ${f.round} SCORES`}>
      <ul className="grid gap-1 text-[20px] leading-[22px] sm:grid-cols-2">
        {f.schedule[f.round - 1].map((g, i) => {
          const [h, a] = g.score!;
          return (
            <li key={i} className="flex items-center gap-2 border-2 border-slate bg-black px-2">
              <span className={`flex min-w-0 flex-1 ${h > a ? "" : "opacity-60"}`}><TeamTag f={f} t={g.home} /></span>
              <span className="shrink-0 text-gold">{h}-{a}</span>
              <span className={`flex min-w-0 flex-1 justify-end ${a > h ? "" : "opacity-60"}`}><TeamTag f={f} t={g.away} /></span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Bracket({ f }: { f: Franchise }) {
  return (
    <Panel title="PLAYOFFS">
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: PLAYOFF_ROUNDS }, (_, r) => (
          <div key={r} className="flex flex-col gap-2">
            <span className="font-head text-[10px] text-steel">{roundName(r)}</span>
            {(f.playoffs[r] ?? []).map((s, i) => {
              const wins = seriesWins(s), w = winner(s);
              return (
                <div key={i} className="border-2 border-slate bg-black text-[20px] leading-[22px]">
                  {([s.top, s.bottom] as const).map((t, k) => (
                    <div key={t} className={`flex items-center gap-2 px-2 ${w != null && w !== t ? "opacity-50" : ""}`}>
                      <span className="text-steel">{f.seeds.indexOf(t) + 1}</span>
                      <span className="flex min-w-0 flex-1"><TeamTag f={f} t={t} /></span>
                      <span className={w === t ? "text-gold" : "text-white"}>{wins[k]}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {!f.playoffs[r] && <span className="text-[20px] text-steel">To be decided</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Standings({ f }: { f: Franchise }) {
  const table = standings(f);
  return (
    <Panel title="STANDINGS">
      <table className="w-full border-collapse text-[20px] leading-[22px]">
        <thead>
          <tr className="text-cloud">
            <th className="px-1 text-left font-normal">#</th>
            <th className="px-1 text-left font-normal">TEAM</th>
            <th className="px-1 text-right font-normal">W</th>
            <th className="px-1 text-right font-normal">L</th>
            <th className="px-1 text-right font-normal">+/-</th>
          </tr>
        </thead>
        <tbody>
          {table.map((s, i) => (
            <tr key={s.team} className={`border-t-2 ${i === FRANCHISE.playoffTeams ? "border-gold" : "border-slate"} ${s.team === YOU ? "bg-navy" : ""}`}>
              <td className="px-1 text-steel">{i + 1}</td>
              <td className="max-w-[180px] px-1"><TeamTag f={f} t={s.team} /></td>
              <td className="px-1 text-right text-white">{s.w}</td>
              <td className="px-1 text-right text-white">{s.l}</td>
              <td className={`px-1 text-right ${s.pf - s.pa >= 0 ? "text-lime" : "text-red"}`}>{s.pf - s.pa > 0 ? "+" : ""}{s.pf - s.pa}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[18px] text-steel">The top {FRANCHISE.playoffTeams} (above the gold line) make the playoffs.</p>
    </Panel>
  );
}

const CATEGORIES: [string, Stat][] = [["POINTS", "pts"], ["REBOUNDS", "reb"], ["ASSISTS", "ast"], ["STEALS", "stl"], ["BLOCKS", "blk"]];

function Leaders({ ctx }: { ctx: Ctx }) {
  const { f, ld, openCard } = ctx;
  if (!Object.keys(f.stats).length) return null;
  return (
    <Panel title="LEAGUE LEADERS (A GAME)">
      <div className="flex flex-col gap-3 text-[20px] leading-[22px]">
        {CATEGORIES.map(([name, k]) => {
          const top = leaders(f, k, 3);
          if (!top.length) return null;
          return (
            <div key={k}>
              <span className="font-head text-[10px] text-steel">{name}</span>
              <ol>
                {top.map((t) => (
                  <li key={`${t.team}:${t.id}`} className="flex items-center gap-2">
                    <button className={`min-w-0 flex-1 truncate text-left ${t.team === YOU ? "text-gold" : "text-white"} hover:underline`} onClick={() => openCard(ld.get(t.id)!)}>
                      {ld.get(t.id)?.name ?? "?"}
                    </button>
                    <span className="max-w-[120px] truncate text-steel">{f.teams[t.team].name}</span>
                    <span className="w-[44px] text-right text-gold">{(t[k] / t.gp).toFixed(1)}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function History({ f }: { f: Franchise }) {
  return (
    <Panel title="HISTORY">
      <ul className="flex flex-col gap-1 text-[20px] leading-[22px]">
        {[...f.history].reverse().map((h) => (
          <li key={h.season} className="border-2 border-slate bg-black px-2">
            <span className="text-steel">SEASON {h.season} · </span>
            <span className={h.you.finish === "CHAMPIONS" ? "text-gold" : "text-white"}>{h.you.w}-{h.you.l}, {h.you.finish}</span>
            <br />
            <span className="text-cloud">Champions: {h.champion}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── your players, as cards ───────────────────────────────────────────────────
const AGE_COLOR = { YOUNG: "text-lime", PRIME: "text-gold", VETERAN: "text-orange" } as const;
/** Where he is in his career, and the rating points he's gained or lost since joining the league. */
function Age({ f, id }: { f: Franchise; id: number }) {
  const car = f.career[id] ?? { exp: 0, dev: 0 }, band = ageBand(car.exp);
  return (
    <span className="text-[16px] leading-[16px]">
      <span className={AGE_COLOR[band]}>{band}</span>
      {car.dev !== 0 && <span className={car.dev > 0 ? "text-lime" : "text-red"}> {car.dev > 0 ? "+" : ""}{car.dev}</span>}
    </span>
  );
}
/** A sprite in a square box (big ones are cropped). */
function Face({ p, size = 56 }: { p: RatedPokemon; size?: number }) {
  return (
    <span className="flex shrink-0 items-end justify-center overflow-hidden bg-navy" style={{ width: size, height: size }} title={p.name}>
      <Sprite p={p} eager className="max-w-none" />
    </span>
  );
}
/** A player's season numbers are under the name he played it with (before he evolved this summer). */
const statsOf = (f: Franchise, id: number) => {
  const was = f.off?.changes.find((c) => c.team === YOU && c.kind === "evolved" && c.to === id)?.id ?? id;
  return f.stats[`${YOU}:${was}`];
};
const dealText = (c: { salary: number; years: number }) => `$${c.salary}M · ${c.years}Y`;
const slotLabel = (s: number) => (s < STARTERS ? SLOTS[s] : "BENCH");

/** Your roster as cards: the five starters, then the bench. Click one card, then another, to swap their spots. In the
 *  summer the chosen player can be released. */
function RosterCards({ ctx, summer = false }: { ctx: Ctx; summer?: boolean }) {
  const { f, ld, update, openCard } = ctx;
  const [moving, setMoving] = useState<number | null>(null);
  const team = f.teams[YOU];
  const click = (slot: number) => {
    moveBlip();
    if (moving == null) return setMoving(slot);
    if (moving !== slot) update(swap(f, moving, slot));
    setMoving(null);
  };
  const held = moving != null ? team.roster[moving] : null;
  const card = (slot: number) => {
    const c = team.roster[slot], p = c && ld.get(c.id), st = c && statsOf(f, c.id);
    const per = (k: Stat) => (st ? (st[k] / st.gp).toFixed(1) : "-");
    return (
      <div key={slot} className="relative flex min-w-0">
        <button
          className={`flex w-full min-w-0 cursor-pointer flex-col items-center border-4 p-1 ${moving === slot ? "border-gold bg-navy" : moving != null ? "border-slate bg-night hover:border-gold" : "border-slate bg-night hover:bg-navy"}`}
          aria-pressed={moving === slot}
          onClick={() => click(slot)}
        >
          <span className="flex w-full justify-between text-[18px] leading-[18px]">
            <span className="text-cloud">{slotLabel(slot)}</span>
            <span className="font-head text-[12px] text-gold">{p ? slotOvr(slot, p) : ""}</span>
          </span>
          <span className="flex h-[64px] items-end">{p ? <Sprite p={p} eager className="max-w-none" /> : <span className="pb-4 font-head text-[10px] text-steel">OPEN</span>}</span>
          <span className="w-full truncate text-center text-[18px] text-white">{p?.name ?? ""}</span>
          <span className="block h-[18px] text-[16px] leading-[18px]">{c && <Age f={f} id={c.id} />}</span>
          <span className={`text-[16px] leading-[18px] ${c?.years === 0 ? "text-red" : "text-cloud"}`}>{c ? (c.years === 0 ? "DEAL IS UP" : dealText(c)) : ""}</span>
          {!summer && <span className="w-full truncate text-center text-[16px] leading-[16px] text-steel">{st ? `${per("pts")}P ${per("reb")}R ${per("ast")}A` : " "}</span>}
        </button>
        {p && <StatsButton p={p} onOpen={() => openCard(p)} className="absolute -bottom-[8px] -right-[8px]" />}
      </div>
    );
  };
  return (
    <Panel title={summer ? "YOUR ROSTER" : `${team.name} · ROSTER`}>
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">{SLOTS.slice(0, STARTERS).map((_, s) => card(s))}</div>
      <div className="my-2 flex items-center gap-2">
        <span className="h-[4px] flex-1 bg-slate" />
        <span className="font-head text-[10px] text-steel">BENCH</span>
        <span className="h-[4px] flex-1 bg-slate" />
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">{SLOTS.slice(STARTERS).map((_, s) => card(STARTERS + s))}</div>
      <div className="mt-3 flex min-h-[32px] flex-wrap items-center gap-3">
        <span className="text-[18px] text-steel">
          {moving == null ? "Click a player, then another spot, to swap them. The five start; the bench comes in when they tire." : "Now click the spot to swap with (or the same card to cancel)."}
        </span>
        {summer && held && moving != null && (
          <button className="px-btn !py-0 !text-[18px]" onClick={() => (backBlip(), update(release(f, moving)), setMoving(null))} title="He joins the free agents and his deal comes off your payroll">
            RELEASE {ld.get(held.id)?.name}
          </button>
        )}
      </div>
    </Panel>
  );
}

// ── the summer ───────────────────────────────────────────────────────────────
const STEPS = [["review", "REVIEW"], ["resign", "RE-SIGN"], ["draft", "DRAFT"], ["sign", "FREE AGENCY"]] as const;

function Offseason({ ctx }: { ctx: Ctx }) {
  const { f } = ctx;
  const step = f.off!.step;
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map(([key, name], i) => {
          const at = STEPS.findIndex(([k]) => k === step);
          return (
            <li key={key} className={`border-2 px-2 py-1 font-head text-[10px] ${key === step ? "border-gold bg-navy text-gold" : i < at ? "border-slate text-steel" : "border-slate text-cloud"}`}>
              {i + 1}. {name}
            </li>
          );
        })}
        <li className="border-2 border-slate px-2 py-1 font-head text-[10px] text-cloud">5. SEASON {f.season + 1}</li>
      </ol>
      {step === "review" && <Review ctx={ctx} />}
      {step === "resign" && <Resign ctx={ctx} />}
      {step === "draft" && <Draft ctx={ctx} />}
      {step === "sign" && <Signing ctx={ctx} />}
    </div>
  );
}

function Next({ ctx, label, disabled = false, note }: { ctx: Ctx; label: string; disabled?: boolean; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="px-btn !bg-gold !text-[24px] !text-black disabled:!bg-night disabled:!text-steel" disabled={disabled} onClick={() => (selectBlip(), ctx.update(nextStep(ctx.f, ctx.dex)))}>
        {label} <Arrow />
      </button>
      {note && <span className="text-[20px] text-cloud">{note}</span>}
    </div>
  );
}

// a pixel trophy, 16 × 16
const G = PALETTE.gold, A = PALETTE.amber, C = PALETTE.cream, B = PALETTE.brown;
const TROPHY: Rect[] = [
  [3, 1, 10, 2, G], [4, 3, 8, 5, G], [5, 8, 6, 1, G], [6, 9, 4, 1, G], [10, 3, 2, 5, A], [5, 3, 1, 4, C], [3, 1, 2, 1, C],
  [1, 2, 2, 1, G], [1, 3, 1, 3, G], [2, 6, 2, 1, G], [13, 2, 2, 1, A], [14, 3, 1, 3, A], [12, 6, 2, 1, A],
  [7, 10, 2, 2, A], [5, 12, 6, 1, G], [4, 13, 8, 2, B],
];

const EVO_GAP = 0.7; // seconds between one evolution's reveal and the next
const EVO_AT = 1.75; // seconds into its animation the new form appears (index.css evo-new)

/** The season's over: the champions, the MVP, and what the summer did to your players (who evolved, who got better or
 *  slowed down). One of them can go to training camp. */
function Review({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update, openCard } = ctx;
  const h = f.history[f.history.length - 1], off = f.off!;
  const won = h.you.finish === "CHAMPIONS";
  const mine = off.changes.filter((c) => c.team === YOU);
  const evolvedTo = (id: number) => mine.find((c) => c.kind === "evolved" && c.to === id);
  const theirs = off.changes.filter((c) => c.kind === "evolved" && c.team !== YOU);
  const star = h.mvp && dex.get(h.mvp.id);
  const team = f.teams[YOU];
  const reveals = team.roster.flatMap((c) => (c && evolvedTo(c.id) ? [c.id] : []));
  // your best player of the season, by the same measure as the MVP
  const top = Object.values(f.stats).filter((t) => t.team === YOU).reduce<Totals | null>((a, b) => (!a || efficiency(b) > efficiency(a) ? b : a), null);
  const topNow = top && (ld.get(mine.find((c) => c.kind === "evolved" && c.id === top.id)?.to ?? top.id) ?? null);

  // a rising jingle as each evolution is revealed
  useEffect(() => {
    if (reducedMotion()) return;
    const timers = reveals.map((_, k) => setTimeout(() => [523, 659, 784, 1047].forEach((hz, i) => setTimeout(() => blip(hz, 70, 0.05), i * 70)), (k * EVO_GAP + EVO_AT) * 1000));
    return () => timers.forEach(clearTimeout);
  }, []);

  const award = (title: string, p: RatedPokemon, lines: string[]) => (
    <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-4 border-slate bg-black p-2 text-left hover:border-gold" onClick={() => openCard(ld.get(p.id) ?? p)}>
      <Face p={p} size={72} />
      <span className="flex min-w-0 flex-col gap-1 text-[20px] leading-[20px]">
        <span className="font-head text-[10px] text-steel">{title}</span>
        <span className="truncate font-head text-[14px] leading-[20px] text-gold">{p.name}</span>
        {lines.map((l) => <span key={l} className="truncate text-white">{l}</span>)}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* the title: yours in your colours, flashing; someone else's plain */}
      <section
        className={`flex flex-wrap items-center gap-4 border-4 border-black px-4 py-4 ${won ? "flash-bg" : ""}`}
        style={{ background: PALETTE[won ? teamColor(team.colors[0]) : "black"], "--flash": PALETTE[teamColor(team.colors[0])], boxShadow: `2px 2px 0 ${PALETTE.black}` } as React.CSSProperties}
      >
        <RectCanvas w={16} h={16} rects={TROPHY} scale={5} className={won ? "pop" : ""} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-head text-[10px] text-white">SEASON {h.season} CHAMPIONS</span>
          <span className={`font-head text-[24px] leading-[1.3] sm:text-[32px] ${won ? "flash-win" : "text-white"}`} style={{ textShadow: `3px 3px 0 ${PALETTE.black}` }}>
            {h.champion}
          </span>
        </div>
        <div className="border-4 border-black bg-black px-3 py-2 text-center">
          <span className="block font-head text-[10px] text-steel">YOUR SEASON</span>
          <span className="block font-head text-[20px] leading-[28px] text-white">{h.you.w}-{h.you.l}</span>
          <span className={`block text-[20px] leading-[20px] ${won ? "text-gold" : "text-cloud"}`}>{h.you.finish}</span>
        </div>
      </section>

      <div className="flex flex-col gap-3 md:flex-row">
        {star && h.mvp && award("LEAGUE MVP", star, [h.mvp.team, `${h.mvp.ppg} PTS · ${h.mvp.rpg} REB · ${h.mvp.apg} AST`])}
        {top && topNow && award("YOUR BEST PLAYER", topNow, [`${(top.pts / top.gp).toFixed(1)} PTS · ${(top.reb / top.gp).toFixed(1)} REB · ${(top.ast / top.gp).toFixed(1)} AST`, `${top.gp} GAMES`])}
      </div>

      <Panel title="YOUR PLAYERS THIS SUMMER">
        <p className="mb-3 text-[20px] leading-[22px] text-cloud">
          <span className="text-gold">TRAINING CAMP: </span>
          {off.trained != null
            ? `${ld.get(off.trained)?.name} went to camp (+${FRANCHISE.campBoost}).`
            : `send one player to camp for +${FRANCHISE.campBoost} rating. Young players grow on their own; veterans slow down.`}
        </p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 lg:grid-cols-8">
          {team.roster.map((c, slot) => {
            if (!c) return null;
            const p = ld.get(c.id)!, evo = evolvedTo(c.id), delay = `${reveals.indexOf(c.id) * EVO_GAP}s`;
            const grew = mine.find((x) => x.kind !== "evolved" && (x.id === c.id || x.id === evo?.id));
            const car = f.career[c.id] ?? { exp: 0, dev: 0 };
            return (
              <div key={c.id} className="relative flex min-w-0">
                <div className={`flex w-full min-w-0 flex-col items-center gap-[2px] border-4 p-1 ${evo ? "border-gold bg-navy" : "border-slate bg-night"}`}>
                  <span className="flex w-full justify-between text-[18px] leading-[18px]">
                    <span className="text-cloud">{slotLabel(slot)}</span>
                    <span className="font-head text-[12px] text-gold">{slotOvr(slot, p)}</span>
                  </span>
                  <span className="relative flex h-[72px] w-full items-end justify-center">
                    {evo && <span className="evo-old absolute bottom-0" style={{ animationDelay: delay }}><Sprite p={dex.get(evo.id)!} eager className="max-w-none" /></span>}
                    <span className={evo ? "evo-new" : ""} style={evo ? { animationDelay: delay } : undefined}><Sprite p={p} eager className="max-w-none" /></span>
                  </span>
                  <span className="w-full truncate text-center text-[18px] leading-[18px] text-white">{p.name}</span>
                  <span className={`h-[12px] font-head text-[8px] leading-[12px] text-gold ${evo ? "evo-new" : ""}`} style={evo ? { animationDelay: delay } : undefined}>{evo ? "EVOLVED!" : ""}</span>
                  <span className="text-[18px] leading-[18px]">
                    {grew ? <span className={grew.by! > 0 ? "text-lime" : "text-red"}>{grew.by! > 0 ? "+" : ""}{grew.by} {grew.by! > 0 ? "BETTER" : "SLOWER"}</span> : <span className="text-steel">NO CHANGE</span>}
                  </span>
                  <span className={`text-[16px] leading-[16px] ${AGE_COLOR[ageBand(car.exp)]}`}>{ageBand(car.exp)}</span>
                  {off.trained === c.id ? (
                    <span className="bg-gold px-1 text-[16px] leading-[20px] text-black">CAMP +{FRANCHISE.campBoost}</span>
                  ) : (
                    <button
                      className="px-btn !px-2 !py-0 !text-[16px]"
                      disabled={off.trained != null || car.dev >= FRANCHISE.dev.max}
                      onClick={() => (selectBlip(), update(train(f, c.id)))}
                      title={car.dev >= FRANCHISE.dev.max ? "He's as good as he can get" : `Send ${p.name} to training camp`}
                    >
                      TRAIN
                    </button>
                  )}
                </div>
                <StatsButton p={p} onOpen={() => openCard(p)} className="absolute -bottom-[8px] -right-[8px]" />
              </div>
            );
          })}
        </div>
      </Panel>

      {theirs.length > 0 && (
        <Panel title="EVOLVED AROUND THE LEAGUE">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {theirs.map((c) => (
              <div key={c.id} className="flex min-w-0 items-center gap-2 border-2 border-slate bg-black p-1">
                <Face p={dex.get(c.id)!} size={48} />
                <span className="text-gold"><Arrow /></span>
                <Face p={dex.get(c.to!)!} size={48} />
                <span className="flex min-w-0 flex-col text-[18px] leading-[18px]">
                  <span className="truncate text-white">{dex.get(c.to!)!.name}</span>
                  <span className="truncate text-steel">{f.teams[c.team].name}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Next ctx={ctx} label="ON TO RE-SIGNING" note={off.trained == null ? "You haven't used training camp yet." : undefined} />
    </div>
  );
}

/** Your payroll counting only deals that carry on (expiring ones are off the books until re-signed). */
const committed = (f: Franchise) => f.teams[YOU].roster.reduce((s, c) => s + (c && c.years > 0 ? c.salary : 0), 0);

/** Deals that ran out: offer each player one, two or three more seasons (a longer deal is cheaper a season, but
 *  you're tied to him as he ages), or let him go. */
function Resign({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update, openCard } = ctx;
  const off = f.off!;
  const years = Object.keys(FRANCHISE.resign).map(Number);
  return (
    <div className="flex flex-col gap-4">
      <Panel title="DEALS THAT RAN OUT">
        <div className="flex flex-col gap-3">
          <CapMeter used={committed(f)} />
          <p className="text-[20px] leading-[22px] text-cloud">
            {off.expiring.length
              ? "Make each player an offer, or let him go. A longer deal costs less a season and locks the price in, even if he gets better; but veterans slow down."
              : "Nobody's deal ran out. You can still release a player below, then on to the draft."}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {off.expiring.map((id) => {
              const p = ld.get(id)!, slot = f.teams[YOU].roster.findIndex((c) => c?.id === id), old = f.teams[YOU].roster[slot]!.salary;
              const st = statsOf(f, id), cap = room(f, slot);
              const none = years.every((y) => resignPrice(f, dex, id, y) > cap);
              return (
                <div key={id} className="flex min-w-0 gap-3 border-4 border-slate bg-black p-2">
                  <button className="shrink-0 cursor-pointer self-start" onClick={() => openCard(p)} title={`${p.name}'s stats`}><Face p={p} size={80} /></button>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 text-[20px] leading-[20px]">
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-head text-[14px] leading-[20px] text-white">{p.name}</span>
                      <span className="text-steel">{slotLabel(slot)} · OVR <span className="text-gold">{slotOvr(slot, p)}</span></span>
                      <Age f={f} id={id} />
                    </span>
                    <span className="text-cloud">
                      {st ? `${st.gp} GAMES · ${(st.pts / st.gp).toFixed(1)} PTS · ${(st.reb / st.gp).toFixed(1)} REB · ${(st.ast / st.gp).toFixed(1)} AST` : "Didn't play this season"}
                    </span>
                    <span className="text-cloud">Was on ${old}M a season. His offers:</span>
                    <span className="flex flex-wrap gap-2">
                      {years.map((y) => {
                        const price = resignPrice(f, dex, id, y);
                        return (
                          <button key={y} className="px-btn flex flex-col items-center gap-[2px] !px-3 !py-1 !text-[18px]" disabled={price > cap} onClick={() => (selectBlip(), update(resign(f, dex, id, y)))}>
                            <span>{y} SEASON{y === 1 ? "" : "S"}</span>
                            <span className="font-head text-[12px]">${price}M</span>
                          </button>
                        );
                      })}
                      <button className="px-btn !border-red !px-3 !py-1 !text-[18px]" onClick={() => (backBlip(), update(resign(f, dex, id, 0)))}>LET HIM GO</button>
                    </span>
                    {none && <span className="text-red">No room under the cap for any of these (you have ${cap}M for this spot).</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      <RosterCards ctx={ctx} summer />
      <Next ctx={ctx} label="ON TO THE DRAFT" note={off.expiring.length ? "Anyone you haven't re-signed leaves." : undefined} />
    </div>
  );
}

/** Your roster as the draft room's spots. */
const roomSlots = (f: Franchise, ld: Dex): RoomSlot[] =>
  f.teams[YOU].roster.map((c, s) => ({ label: slotLabel(s), p: c ? ld.get(c.id)! : null, sub: c ? dealText(c) : "" }));
const capRoom = (f: Franchise) => `CAP ROOM $${SALARY_CAP - payroll(f.teams[YOU])}M`;
/** The most you could pay for a spot anywhere on your roster (an open one, or by replacing someone). */
const mostRoom = (f: Franchise) => Math.max(...SLOTS.map((_, s) => room(f, s)));
/** His best open spot that he fits under the cap in (Enter in the draft room), if any. */
const bestOpenFit = (f: Franchise, p: RatedPokemon, price: number) => {
  const fits = openSlots(f.teams[YOU]).filter((s) => price <= room(f, s));
  return fits.length ? fits.reduce((a, b) => (slotOvr(b, p) > slotOvr(a, p) ? b : a)) : null;
};
function YourChemistry({ ctx }: { ctx: Ctx }) {
  return (
    <section className="px-box p-3">
      <h2 className="m-0 mb-1 font-head text-[12px] text-gold">YOUR CHEMISTRY</h2>
      <ChemistryList lineup={lineupOf(ctx.f, YOU)} dex={ctx.ld} />
    </section>
  );
}

/** The rookie draft, in the same draft room as the FULL DRAFT: the lottery order, the class on the board (POT = the
 *  best a prospect could become), the picks ticking in, and your roster. A rookie can go on an open spot or over one
 *  of your players, who is released. */
function Draft({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update, openCard } = ctx;
  const d = f.off!.draft!;
  const evos = useMemo(() => evolutionsOf(dex), [dex]);
  const shown = useTicker(d.picks.length, (i) => d.picks[i].team === YOU);
  const ticking = shown < d.picks.length;
  const seen = d.picks.slice(0, shown);
  const clock = ticking ? d.picks[shown].team : draftOnClock(d);
  const yourTurn = !ticking && clock === YOU;
  const gone = new Set(seen.flatMap((p) => (p.id == null ? [] : [p.id])));
  const teams = d.order.length, total = teams * FRANCHISE.draftRounds;
  const n = Math.min(shown, total - 1), round = Math.floor(n / teams) + 1, pickNo = (n % teams) + 1;
  const tag = (k: number) => `R${Math.floor(k / teams) + 1}.${(k % teams) + 1}`;
  const name = (t: number) => f.teams[t].name;

  if (clock == null) {
    const yours = d.picks.filter((p) => p.team === YOU && p.id != null).map((p) => ld.get(p.id!)!.name);
    return (
      <div className="flex flex-col gap-4">
        <section className="border-4 border-black bg-red px-4 py-4" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
          <p className="m-0 font-head text-[24px] leading-[1.3] text-white">DRAFT COMPLETE</p>
          <p className="m-0 text-[24px] text-white">{yours.length ? `You drafted ${yours.join(" and ")}.` : "You passed on this class."} Anyone not picked is a free agent.</p>
        </section>
        <Panel title="THE PICKS">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {d.picks.map((pk, k) => {
              const p = pk.id != null ? ld.get(pk.id)! : null;
              return (
                <div key={k} className={`flex min-w-0 items-center gap-2 border-2 bg-black p-1 ${pk.team === YOU ? "border-gold" : "border-slate"} ${p ? "" : "opacity-50"}`}>
                  {p ? <button className="cursor-pointer" onClick={() => openCard(p)} title={`${p.name}'s stats`}><Face p={p} size={48} /></button> : <span className="h-[48px] w-[48px] shrink-0 bg-navy" />}
                  <span className="flex min-w-0 flex-col text-[18px] leading-[18px]">
                    <span className="truncate text-steel">{tag(k)} · {pk.team === YOU ? "YOU" : name(pk.team)}</span>
                    <span className="truncate text-white">{p ? p.name : "PASS"}</span>
                    {p && <span className="truncate text-lime">OVR {best(p)} · POT {potential(p.id, ld, evos)}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
        <RosterCards ctx={ctx} summer />
        <Next ctx={ctx} label="ON TO FREE AGENCY" />
      </div>
    );
  }

  const most = mostRoom(f);
  return (
    <DraftRoom
      kicker={`ROOKIE DRAFT · ROUND ${round} OF ${FRANCHISE.draftRounds} · PICK ${pickNo}`}
      status={yourTurn ? "YOU'RE ON THE CLOCK!" : `${name(clock)} ARE PICKING…`}
      urgent={yourTurn}
      order={d.order.map((t) => ({ name: name(t), you: t === YOU, on: t === clock }))}
      boardTitle="THE CLASS"
      budget={capRoom(f)}
      board={d.pool.filter((id) => !gone.has(id)).map((id) => {
        const p = ld.get(id)!, price = rookieSalary(p);
        return { p, price, over: price > most, note: `POT ${potential(id, ld, evos)}`, noteTitle: "The best he could become by evolving" };
      })}
      yourTurn={yourTurn}
      picks={seen.map((pk, k) => ({ tag: tag(k), team: name(pk.team), name: pk.id == null ? "PASS" : ld.get(pk.id)!.name, mine: pk.team === YOU }))}
      picksEmpty="The teams that missed the playoffs drew for the first picks. The champions pick last."
      slots={roomSlots(f, ld)}
      rate={slotOvr}
      canPlace={(slot, p) => rookieSalary(p) <= room(f, slot)}
      bestSlot={(p) => bestOpenFit(f, p, rookieSalary(p))}
      onPlace={(id, slot) => update(draftPick(f, dex, id, slot))}
      actions={yourTurn && <button className="px-btn !text-[20px]" onClick={() => (moveBlip(), update(draftPick(f, dex, null)))}>PASS THIS PICK</button>}
    >
      <p className="m-0 text-[20px] leading-[22px] text-cloud">
        Rookies are young Pokémon who can still evolve: <span className="text-lime">POT</span> is the best they could become. They sign for {FRANCHISE.rookieYears} seasons at half price.
        {openSlots(f.teams[YOU]).length ? "" : " Your roster is full: a rookie takes the place of the player you put him over (that player is released)."}
      </p>
      <YourChemistry ctx={ctx} />
    </DraftRoom>
  );
}

/** Free agency, in the draft room too: the market on the board, the signings ticking in (the other teams move after
 *  each of yours), and your roster. Sign onto an open spot, or over a player, who is released. */
function Signing({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update } = ctx;
  const off = f.off!;
  const shown = useTicker(off.signings.length, (i) => off.signings[i].team === YOU);
  const ticking = shown < off.signings.length;
  const open = openSlots(f.teams[YOU]).length;
  // (a CPU signing stays on the board until it ticks in)
  const pending = off.signings.slice(shown).map((s) => s.id);
  const board = [...new Set([...off.market, ...pending])].map((id) => ld.get(id)!).sort((a, b) => best(b) - best(a) || a.id - b.id);
  const most = mostRoom(f);
  const start = () => (selectBlip(), update(nextStep(f, dex)));
  return (
    <DraftRoom
      kicker={`FREE AGENCY · DEALS RUN ${FRANCHISE.signYears} SEASONS`}
      status={ticking ? "THE OTHER TEAMS MAKE THEIR MOVES…" : open ? `${open} OPEN SPOT${open === 1 ? "" : "S"} TO FILL` : `ROSTER FULL: READY FOR SEASON ${f.season + 1}`}
      urgent={!ticking && open > 0}
      boardTitle="FREE AGENTS"
      budget={capRoom(f)}
      board={board.map((p) => ({ p, price: salary(p), over: salary(p) > most, note: ageBand(f.career[p.id]?.exp ?? 0), noteTitle: "Young players improve; veterans slow down" }))}
      yourTurn={!ticking}
      picksTitle="THE SIGNINGS"
      picks={off.signings.slice(0, shown).map((s, k) => ({ tag: `#${k + 1}`, team: f.teams[s.team].name, name: ld.get(s.id)!.name, mine: s.team === YOU }))}
      picksEmpty="Nobody has signed yet. After each signing of yours, the other teams make a move."
      slots={roomSlots(f, ld)}
      rate={slotOvr}
      canPlace={(slot, p) => salary(p) <= room(f, slot)}
      bestSlot={(p) => bestOpenFit(f, p, salary(p))}
      onPlace={(id, slot) => update(sign(f, dex, id, slot))}
      actions={
        <>
          {open > 0 && <button className="px-btn !text-[20px]" disabled={ticking} onClick={() => (selectBlip(), update(autoSign(f, dex)))}>AUTO-FILL</button>}
          <button className="px-btn !bg-gold !text-[20px] !text-black disabled:!bg-night disabled:!text-steel" disabled={open > 0 || ticking} onClick={start}>START SEASON {f.season + 1} <Arrow /></button>
        </>
      }
    >
      <p className="m-0 text-[20px] leading-[22px] text-cloud">
        Everyone let go this summer, the undrafted rookies and a few others. Sign a player onto an open spot, or over one of yours to replace him (he goes back on the market).
        {open ? " Every spot must be filled before the season starts." : ""}
      </p>
      <YourChemistry ctx={ctx} />
    </DraftRoom>
  );
}
