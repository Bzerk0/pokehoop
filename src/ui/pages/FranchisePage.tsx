import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { allowedIn, type Difficulty } from "../../core/cpuTeam.ts";
import {
  autoSign, checkFranchise, draftLeft, draftOnClock, draftPick, finishSlate, leaders, leagueDex, lineupOf, newLeague, nextStep, opponentIn,
  openSlots, payroll, potential, evolutionsOf, release, resign, room, rookieSalary, seriesWins, sign, simPhase, simYours, standings, swap,
  winner, YOU, yourGame, type Franchise, type STAT_KEYS,
} from "../../core/franchise.ts";
import { dexOf, problems, salary, SLOTS, slotOvr, STARTERS, teamOvr, type Lineup } from "../../core/lineup.ts";
import { DIFFICULTIES, FRANCHISE } from "../../core/ratingConfig.ts";
import type { GameResult } from "../../core/sim/sim.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { clearFranchise, loadFranchise, saveFranchise } from "../../storage.ts";
import { useMusic } from "../bgm.ts";
import { Arrow } from "../components/Arrow.tsx";
import { reducedMotion } from "../components/Cabinet3D.tsx";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { teamColor } from "../components/LineupCard.tsx";
import { Modal, PlayerModal, StatsButton } from "../components/Modal.tsx";
import { Sprite } from "../components/PlayerCard.tsx";
import { CapMeter } from "../components/TeamControls.tsx";
import { TipOff } from "../components/TipOff.tsx";
import { useRated } from "../data.ts";
import { backBlip, moveBlip, selectBlip } from "../sound.ts";
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
  const { data, error } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const [f, setF] = useState<Franchise | null | undefined>(undefined); // undefined: not read yet
  const [saveFailed, setSaveFailed] = useState(false);
  const [card, setCard] = useState<RatedPokemon | null>(null);
  const [shown, setShown] = useState<{ result: GameResult; home: Lineup; away: Lineup; playback: boolean } | null>(null);
  const [quitting, setQuitting] = useState(false);

  useEffect(() => {
    if (dex) setF(checkFranchise(loadFranchise(), dex));
  }, [dex]);
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
        <Setup dex={dex} onStart={(l, level) => (selectBlip(), update(newLeague(data, dex, l, level, (Date.now() * 2654435761) >>> 0)))} />
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
            <p>This league, its seasons and its history will be gone for good.</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-btn" onClick={() => (backBlip(), clearFranchise(), setF(null), setQuitting(false))}>YES, START OVER</button>
              <button className="px-btn" onClick={() => setQuitting(false)}>KEEP PLAYING</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── a new league ─────────────────────────────────────────────────────────────
function Setup({ dex, onStart }: { dex: Dex; onStart: (l: Lineup, level: Difficulty) => void }) {
  const navigate = useNavigate();
  const teams = useMemo(() => yourTeams(dex), [dex]);
  const [pick, setPick] = useState(() => Math.max(0, teams.findIndex((t) => ready(t.lineup, dex))));
  const [level, setLevel] = useState<Difficulty>("PRO");
  const team = teams[pick];
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
        {teams.length === 0 ? (
          <div className="flex flex-col gap-3 text-[22px] leading-[22px] text-cloud">
            <p>No teams yet. Draft one or build one first.</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-btn" onClick={() => navigate("/draft")}>DRAFT <Arrow /></button>
              <button className="px-btn" onClick={() => navigate("/build")}>FREE BUILD <Arrow /></button>
            </div>
          </div>
        ) : (
          <ul className="flex max-h-[360px] flex-col gap-2 overflow-auto">
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
      </Panel>
      <Panel title="2. THE LEAGUE">
        <div className="flex flex-col gap-2">
          {DIFFICULTIES.filter((d) => allowedIn(d.name, mode)).map((d) => (
            <button key={d.name} className="px-btn !justify-between gap-3 !text-[18px]" aria-pressed={level === d.name} onClick={() => (moveBlip(), setLevel(d.name))}>
              <span>{d.name}</span>
              <span className="text-[20px]">CPU TEAMS {d.min}-{d.max}</span>
            </button>
          ))}
          <button className="px-btn mt-2 !text-[20px]" disabled={!ok} onClick={() => team && onStart(team.lineup, level)}>
            START SEASON 1 <Arrow />
          </button>
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
        <Roster ctx={ctx} />
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
    </div>
  );
  const [top, bottom] = series ? seriesWins(series) : [0, 0];
  const seriesLine = series && `GAME ${series.games.length + 1} · SERIES ${series.top === YOU ? top : bottom}-${series.top === YOU ? bottom : top}`;
  return (
    <Panel title={`${label}${seriesLine ? ` · ${seriesLine}` : ""}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-stretch gap-2">
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

/** Your roster: who plays where (MOVE swaps two spots), ratings, this season's numbers and deals. In the summer each
 *  player can be let go. */
function Roster({ ctx, summer = false }: { ctx: Ctx; summer?: boolean }) {
  const { f, ld, update, openCard } = ctx;
  const [moving, setMoving] = useState<number | null>(null);
  const team = f.teams[YOU];
  const move = (slot: number) => {
    moveBlip();
    if (moving == null) return setMoving(slot);
    update(swap(f, moving, slot));
    setMoving(null);
  };
  const per = (id: number, k: Stat) => {
    const t = f.stats[`${YOU}:${id}`];
    return t ? (t[k] / t.gp).toFixed(1) : "-";
  };
  return (
    <Panel title={summer ? "YOUR ROSTER" : `${team.name} · ROSTER`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[20px] leading-[24px]">
          <thead>
            <tr className="text-cloud">
              <th className="px-1 text-left font-normal">SPOT</th>
              <th className="px-1 text-left font-normal">POKéMON</th>
              <th className="px-1 text-right font-normal">OVR</th>
              {!summer && <><th className="px-1 text-right font-normal">GP</th><th className="px-1 text-right font-normal">PTS</th><th className="px-1 text-right font-normal">REB</th><th className="px-1 text-right font-normal">AST</th></>}
              <th className="px-1 text-right font-normal">DEAL</th>
              <th className="px-1" />
            </tr>
          </thead>
          <tbody>
            {team.roster.map((c, slot) => {
              const p = c && ld.get(c.id);
              const dev = c ? (f.career[c.id]?.dev ?? 0) : 0;
              return (
                <tr key={slot} className={`border-t-2 border-slate ${moving === slot ? "bg-navy" : ""} ${slot === STARTERS ? "border-t-4" : ""}`}>
                  <td className="px-1 text-steel">{slot < STARTERS ? SLOTS[slot] : "BN"}</td>
                  <td className="px-1">
                    {p ? (
                      <span className="flex items-center gap-2">
                        <StatsButton p={p} onOpen={() => openCard(p)} />
                        <span className="truncate text-white">{p.name}</span>
                        {c!.years === 0 && <span className="text-[18px] text-red">EXPIRING</span>}
                      </span>
                    ) : (
                      <span className="text-steel">OPEN</span>
                    )}
                  </td>
                  <td className="px-1 text-right">
                    {p && (
                      <>
                        <span className="text-gold">{slotOvr(slot, p)}</span>
                        {dev !== 0 && <span className={`ml-1 text-[18px] ${dev > 0 ? "text-lime" : "text-red"}`}>{dev > 0 ? "+" : ""}{dev}</span>}
                      </>
                    )}
                  </td>
                  {!summer && (
                    <>
                      <td className="px-1 text-right text-white">{c ? (f.stats[`${YOU}:${c.id}`]?.gp ?? 0) : ""}</td>
                      <td className="px-1 text-right text-white">{c ? per(c.id, "pts") : ""}</td>
                      <td className="px-1 text-right text-white">{c ? per(c.id, "reb") : ""}</td>
                      <td className="px-1 text-right text-white">{c ? per(c.id, "ast") : ""}</td>
                    </>
                  )}
                  <td className="whitespace-nowrap px-1 text-right text-cloud">{c ? `$${c.salary}M · ${c.years}Y` : ""}</td>
                  <td className="whitespace-nowrap px-1 text-right">
                    <span className="inline-flex gap-1">
                      <button className="px-btn !px-2 !py-0 !text-[16px]" aria-pressed={moving === slot} onClick={() => move(slot)} title="Swap two spots: press MOVE on both">
                        {moving == null ? "MOVE" : moving === slot ? "CANCEL" : "HERE"}
                      </button>
                      {summer && c && (
                        <button className="px-btn !px-2 !py-0 !text-[16px]" onClick={() => (backBlip(), update(release(f, slot)))} title="Let him go: the spot opens and his deal comes off your payroll">
                          RELEASE
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[18px] text-steel">PG to C start; the bench comes in when they tire. MOVE two spots to swap them.</p>
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
      <button className="px-btn !text-[20px]" disabled={disabled} onClick={() => (selectBlip(), ctx.update(nextStep(ctx.f, ctx.dex)))}>
        {label} <Arrow />
      </button>
      {note && <span className="text-[20px] text-cloud">{note}</span>}
    </div>
  );
}

function Review({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, openCard } = ctx;
  const h = f.history[f.history.length - 1];
  const won = h.you.finish === "CHAMPIONS";
  const changes = f.off!.changes;
  const evolved = changes.filter((c) => c.kind === "evolved");
  const mineEvolved = evolved.filter((c) => c.team === YOU);
  const theirs = evolved.filter((c) => c.team !== YOU);
  const growth = changes.filter((c) => c.team === YOU && c.kind !== "evolved");
  const star = h.mvp && dex.get(h.mvp.id);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={`SEASON ${h.season} IS OVER`} className="lg:col-span-2">
        <div className={`flex flex-wrap items-center gap-4 ${won ? "flash-bg" : ""}`} style={{ "--flash": PALETTE[teamColor(f.teams[YOU].colors[0])] } as React.CSSProperties}>
          <span className={`font-head text-[24px] leading-[1.3] sm:text-[32px] ${won ? "flash-win" : "text-white"}`} style={{ textShadow: `3px 3px 0 ${PALETTE[won ? "red" : "black"]}` }}>
            {won ? "CHAMPIONS!" : `${h.champion} WIN IT ALL`}
          </span>
          <span className="text-[22px] text-cloud">Your season: {h.you.w}-{h.you.l} · {h.you.finish}</span>
        </div>
      </Panel>
      {star && h.mvp && (
        <Panel title="MVP">
          <button className="flex w-full items-center gap-4 text-left" onClick={() => openCard(ld.get(star.id) ?? star)}>
            <Sprite p={star} />
            <span className="flex flex-col gap-1 text-[22px] leading-[22px]">
              <span className="font-head text-[14px] text-gold">{star.name}</span>
              <span className="text-cloud">{h.mvp.team}</span>
              <span className="text-white">{h.mvp.ppg} PTS · {h.mvp.rpg} REB · {h.mvp.apg} AST</span>
            </span>
          </button>
        </Panel>
      )}
      <Panel title="YOUR SUMMER">
        <div className="flex flex-col gap-3 text-[22px] leading-[22px]">
          {mineEvolved.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-2 border-gold bg-black p-2">
              <Sprite p={dex.get(c.id)!} />
              <Arrow />
              <Sprite p={dex.get(c.to!)!} />
              <span className="font-head text-[12px] leading-[18px] text-gold">{dex.get(c.id)!.name} EVOLVED INTO {dex.get(c.to!)!.name}!</span>
            </div>
          ))}
          {growth.length > 0 && (
            <ul className="flex flex-col gap-1">
              {growth.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className={c.kind === "up" ? "text-lime" : "text-red"}>{c.by! > 0 ? "+" : ""}{c.by}</span>
                  <span className="text-white">{(ld.get(c.id) ?? dex.get(c.id))?.name}</span>
                  <span className="text-steel">{c.kind === "up" ? "got better" : "slowed down"}</span>
                </li>
              ))}
            </ul>
          )}
          {!mineEvolved.length && !growth.length && <p className="text-cloud">A quiet summer: nobody changed.</p>}
        </div>
      </Panel>
      {theirs.length > 0 && (
        <Panel title="AROUND THE LEAGUE">
          <ul className="flex flex-col gap-1 text-[20px] leading-[22px]">
            {theirs.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2">
                <span className="text-white">{dex.get(c.id)!.name} <span className="text-gold">evolved into</span> {dex.get(c.to!)!.name}</span>
                <span className="text-steel">({f.teams[c.team].name})</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="lg:col-span-2">
        <Next ctx={ctx} label="ON TO RE-SIGNING" />
      </div>
    </div>
  );
}

/** Your payroll counting only deals that carry on (expiring ones are off the books until re-signed). */
const committed = (f: Franchise) => f.teams[YOU].roster.reduce((s, c) => s + (c && c.years > 0 ? c.salary : 0), 0);

function Resign({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update } = ctx;
  const off = f.off!;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="DEALS THAT RAN OUT">
        <div className="flex flex-col gap-3 text-[22px] leading-[22px]">
          <CapMeter used={committed(f)} />
          {off.expiring.length === 0 && <p className="text-cloud">Nobody's deal ran out. On to the draft.</p>}
          {off.expiring.map((id) => {
            const p = ld.get(id)!, slot = f.teams[YOU].roster.findIndex((c) => c?.id === id), old = f.teams[YOU].roster[slot]!.salary;
            const price = salary(p), fits = price <= room(f, slot);
            return (
              <div key={id} className="flex flex-col gap-2 border-2 border-slate bg-black p-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-white">{p.name}</span>
                  <span className="text-steel">{p.best} · OVR</span>
                  <span className="text-gold">{best(p)}</span>
                </span>
                <span className="text-cloud">Was ${old}M. Asks ${price}M a season for {FRANCHISE.resignYears} seasons.</span>
                <span className="flex flex-wrap gap-2">
                  <button className="px-btn !text-[18px]" disabled={!fits} onClick={() => (selectBlip(), update(resign(f, dex, id, true)))}>RE-SIGN</button>
                  <button className="px-btn !text-[18px]" onClick={() => (backBlip(), update(resign(f, dex, id, false)))}>LET HIM GO</button>
                  {!fits && <span className="text-red">Not enough room under the cap.</span>}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
      <Roster ctx={ctx} summer />
      <div className="lg:col-span-2">
        <Next ctx={ctx} label="ON TO THE DRAFT" note={off.expiring.length ? "Anyone you haven't re-signed leaves." : undefined} />
      </div>
    </div>
  );
}

function Draft({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update, openCard } = ctx;
  const d = f.off!.draft!;
  const clock = draftOnClock(d);
  const yours = clock === YOU;
  const open = openSlots(f.teams[YOU]);
  const evos = useMemo(() => evolutionsOf(dex), [dex]);
  const left = new Set(draftLeft(d));
  const pickNo = d.picks.length + 1;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title={yours ? `YOU'RE ON THE CLOCK · PICK ${pickNo}` : clock == null ? "THE DRAFT IS OVER" : `PICK ${pickNo}`}>
        <div className="flex flex-col gap-3 text-[20px] leading-[22px]">
          <p className="text-cloud">Young Pokémon who can still evolve. POT is the best they could become. Rookies sign for {FRANCHISE.rookieYears} seasons at half price.</p>
          {yours && !open.length && <p className="text-red">Your roster's full: release someone to make room, or pass.</p>}
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-cloud">
                  <th className="px-1 text-left font-normal">POKéMON</th>
                  <th className="px-1 text-right font-normal">POS</th>
                  <th className="px-1 text-right font-normal">OVR</th>
                  <th className="px-1 text-right font-normal">POT</th>
                  <th className="px-1 text-right font-normal">$</th>
                  <th className="px-1" />
                </tr>
              </thead>
              <tbody>
                {d.pool.map((id) => {
                  const p = ld.get(id)!, taken = d.picks.find((x) => x.id === id);
                  const cost = rookieSalary(p), can = yours && left.has(id) && open.length > 0 && cost <= room(f, open[0]);
                  return (
                    <tr key={id} className={`border-t-2 border-slate ${taken ? "opacity-50" : ""}`}>
                      <td className="px-1">
                        <span className="flex items-center gap-2">
                          <StatsButton p={p} onOpen={() => openCard(p)} />
                          <span className="truncate text-white">{p.name}</span>
                        </span>
                      </td>
                      <td className="px-1 text-right text-steel">{p.best}</td>
                      <td className="px-1 text-right text-gold">{best(p)}</td>
                      <td className="px-1 text-right text-lime">{potential(id, ld, evos)}</td>
                      <td className="px-1 text-right text-cloud">{cost}</td>
                      <td className="whitespace-nowrap px-1 text-right">
                        {taken ? (
                          <span className={`text-[18px] ${taken.team === YOU ? "text-gold" : "text-steel"}`}>{taken.team === YOU ? "YOU" : f.teams[taken.team].name.split(" ").pop()}</span>
                        ) : (
                          yours && <button className="px-btn !px-2 !py-0 !text-[16px]" disabled={!can} onClick={() => (selectBlip(), update(draftPick(f, dex, id)))}>PICK</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {yours && <button className="px-btn self-start !text-[18px]" onClick={() => (moveBlip(), update(draftPick(f, dex, null)))}>PASS THIS PICK</button>}
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-4">
        <Roster ctx={ctx} summer />
        <Panel title="THE PICKS">
          <ol className="flex flex-col gap-1 text-[20px] leading-[22px]">
            {d.picks.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-[28px] text-steel">{i + 1}.</span>
                <span className="flex min-w-0 flex-1"><TeamTag f={f} t={x.team} /></span>
                <span className="text-white">{x.id == null ? "PASS" : (ld.get(x.id)?.name ?? "?")}</span>
              </li>
            ))}
            {!d.picks.length && <li className="text-steel">You pick first: worst record goes first.</li>}
          </ol>
        </Panel>
      </div>
      <div className="lg:col-span-2">
        <Next ctx={ctx} label="ON TO FREE AGENCY" note={yours ? "Moving on passes your remaining picks." : undefined} />
      </div>
    </div>
  );
}

function Signing({ ctx }: { ctx: Ctx }) {
  const { f, dex, ld, update, openCard } = ctx;
  const open = openSlots(f.teams[YOU]);
  const market = f.off!.market.map((id) => ld.get(id)!);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="FREE AGENTS">
        <div className="flex flex-col gap-3 text-[20px] leading-[22px]">
          <CapMeter used={payroll(f.teams[YOU])} />
          <p className="text-cloud">
            {open.length ? `${open.length} open spot${open.length === 1 ? "" : "s"} to fill. Deals run ${FRANCHISE.signYears} seasons.` : "Your roster is full. Ready for the season!"}
          </p>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-cloud">
                  <th className="px-1 text-left font-normal">POKéMON</th>
                  <th className="px-1 text-right font-normal">POS</th>
                  <th className="px-1 text-right font-normal">OVR</th>
                  <th className="px-1 text-right font-normal">$</th>
                  <th className="px-1" />
                </tr>
              </thead>
              <tbody>
                {market.map((p) => {
                  const price = salary(p), can = open.length > 0 && price <= room(f, open[0]);
                  return (
                    <tr key={p.id} className="border-t-2 border-slate">
                      <td className="px-1">
                        <span className="flex items-center gap-2">
                          <StatsButton p={p} onOpen={() => openCard(p)} />
                          <span className="truncate text-white">{p.name}</span>
                        </span>
                      </td>
                      <td className="px-1 text-right text-steel">{p.best}</td>
                      <td className="px-1 text-right text-gold">{best(p)}</td>
                      <td className="px-1 text-right text-cloud">{price}</td>
                      <td className="px-1 text-right">
                        <button className="px-btn !px-2 !py-0 !text-[16px]" disabled={!can} onClick={() => (selectBlip(), update(sign(f, dex, p.id)))}>SIGN</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {open.length > 0 && <button className="px-btn self-start !text-[18px]" onClick={() => (selectBlip(), update(autoSign(f, dex)))}>AUTO-FILL THE OPEN SPOTS</button>}
        </div>
      </Panel>
      <Roster ctx={ctx} summer />
      <div className="lg:col-span-2">
        <Next ctx={ctx} label={`START SEASON ${f.season + 1}`} disabled={open.length > 0} note={open.length ? "Fill every spot first." : undefined} />
      </div>
    </div>
  );
}
