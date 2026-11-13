import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { allowedIn, cpuTeam, presetPicks, type Difficulty } from "../../core/cpuTeam.ts";
import { checkDraft, isOver, toLineup } from "../../core/draft.ts";
import { autoFill, dexOf, emptyLineup, problems, SLOTS, STARTERS, type Lineup } from "../../core/lineup.ts";
import { simGame, type GameResult } from "../../core/sim/sim.ts";
import { clock, score, totals, type Line, type TeamBox } from "../../core/stats.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { listTeams, loadDraft, loadRun, teamLineup } from "../../storage.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { teamColor } from "../components/LineupCard.tsx";
import { reducedMotion } from "../components/Cabinet3D.tsx";
import { TipOff } from "../components/TipOff.tsx";
import { useRated } from "../data.ts";
import { backBlip, blip, selectBlip } from "../sound.ts";
import type { ArcadeSetup } from "./ArcadePage.tsx";
import { PALETTE } from "../theme/palette.ts";
import { Arrow } from "../components/Arrow.tsx";
import { CharacterSelect } from "../components/CharacterSelect.tsx";
import { ModeSelect } from "../components/ModeSelect.tsx";
import { OpponentSelect } from "../components/OpponentSelect.tsx";
import { useMusic } from "../bgm.ts";

type Dex = Map<number, RatedPokemon>;
type Choice = { key: string; label: string; lineup: Lineup };

/** A new player's first team: the five on the title screen start (in the order they stood), the bench is
 *  auto-filled under the cap. */
function titleTeam(starters: unknown, pool: RatedPokemon[], dex: Dex): Choice | null {
  if (!Array.isArray(starters) || starters.length !== STARTERS || !starters.every((id) => dex.has(id))) return null;
  const legend = starters.some((id) => dex.get(id)!.isLegendary || dex.get(id)!.isMythical);
  const base = { ...emptyLineup(legend ? "unlimited" : "classic"), name: "STREET BALLERS", ids: SLOTS.map((_, i) => (i < STARTERS ? starters[i] : null)) };
  return { key: "title", label: "QUICK TEAM", lineup: autoFill(base, pool) };
}

/** Every team you could play with: your last finished draft, your Free Build team, your saved teams. */
function yourTeams(dex: Dex): Choice[] {
  const out: Choice[] = [];
  const run = loadRun() as { draft?: unknown; name?: string; colors?: [number, number] } | null;
  const draft = run && checkDraft(run.draft, dex);
  if (draft && isOver(draft)) out.push({ key: "draft", label: "LAST DRAFT", lineup: { ...toLineup(draft), name: String(run!.name ?? "MY DRAFT"), colors: run!.colors ?? [9, 12] } });
  const build = loadDraft();
  if (build) out.push({ key: "build", label: "FREE BUILD", lineup: build });
  for (const t of listTeams()) out.push({ key: t.id, label: "SAVED", lineup: teamLineup(t) });
  return out;
}

const ready = (l: Lineup, dex: Dex) => l.ids.every((id) => id != null) && problems(l, dex).length === 0;

/** Someone who got on the court or did anything (the bench players who never played are left off). */
const played = (l: Line) => l.sec > 0 || l.fga > 0 || l.pts + l.reb + l.ast + l.stl + l.blk + l.to > 0;

function BoxScore({ box, dex }: { box: TeamBox; dex: Dex }) {
  const t = totals(box.lines);
  const cols = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3P"];
  const row = (s: typeof t) => [clock(s.sec), s.pts, s.reb, s.ast, s.stl, s.blk, s.to, `${s.fgm}-${s.fga}`, `${s.tpm}-${s.tpa}`];
  return (
    <div className="overflow-x-auto border-4 border-black bg-night">
      <table className="w-full border-collapse text-[20px] leading-[22px]">
        <caption className="bg-navy px-2 py-1 text-left font-head text-[16px] text-gold">{box.name}</caption>
        <thead>
          <tr className="text-cloud">
            <th className="px-2 text-left font-normal">PLAYER</th>
            {cols.map((c) => <th key={c} className="px-2 text-right font-normal">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {box.lines.filter(played).map((l) => (
            <tr key={l.slot} className="border-t-2 border-slate text-white">
              <td className="whitespace-nowrap px-2">
                <span className="mr-2 text-cloud">{l.slot < STARTERS ? SLOTS[l.slot] : "BN"}</span>
                {dex.get(l.id)!.name}
              </td>
              {row(l).map((v, i) => <td key={i} className={`px-2 text-right ${i === 1 ? "text-gold" : ""}`}>{v}</td>)}
            </tr>
          ))}
          <tr className="border-t-4 border-slate text-cloud">
            <td className="px-2">TEAM</td>
            {row(t).map((v, i) => <td key={i} className="px-2 text-right">{i === 0 ? "" : v}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The final: scoreboard, quarters, highlights and box scores. Simmed and live games both end here. */
export function Results({ result, dex, mine }: { result: GameResult; dex: Dex; mine: Lineup }) {
  const [you, cpu] = result.teams;
  const won = score(you) > score(cpu);
  // (an untimed game, 1v1, has the one column)
  const periods = you.periods.length === 1 ? ["GAME"] : you.periods.map((_, i) => (i < 4 ? `Q${i + 1}` : i === 4 ? "OT" : `${i - 3}OT`));
  const home = teamColor(mine.colors[0]);
  return (
    <div className="flex flex-col gap-4">
      <section
        className={`flex flex-wrap items-center gap-4 border-4 border-black bg-black px-4 py-3 ${won ? "flash-bg" : ""}`}
        style={{ "--flash": PALETTE[home], boxShadow: `2px 2px 0 ${PALETTE.black}` } as React.CSSProperties}
      >
        <span
          role="status"
          className={`font-head text-[32px] leading-[1.2] sm:text-[48px] ${won ? "flash-win" : "flash-lose"}`}
          style={{ color: PALETTE[won ? "gold" : "red"], textShadow: `4px 4px 0 ${PALETTE[won ? "red" : "white"]}` }}
        >
          {won ? "YOU WIN!" : "YOU LOSE"}
        </span>
        <span className="ml-auto flex items-center gap-3 border-4 border-black bg-black px-3 py-2 font-head text-[24px] sm:text-[32px]">
          <span className={won ? "text-gold" : "text-white"}>{score(you)}</span>
          <span className="text-steel">-</span>
          <span className={won ? "text-white" : "text-gold"}>{score(cpu)}</span>
        </span>
      </section>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="overflow-x-auto border-4 border-black bg-night">
          <table className="border-collapse text-[22px]">
            <thead>
              <tr className="text-cloud">
                <th className="px-3 text-left font-normal">TEAM</th>
                {periods.map((p) => <th key={p} className="px-3 font-normal">{p}</th>)}
                <th className="px-3 font-normal">F</th>
              </tr>
            </thead>
            <tbody>
              {result.teams.map((t) => (
                <tr key={t.name + score(t)} className="border-t-2 border-slate text-white">
                  <td className="max-w-[200px] truncate px-3">{t.name}</td>
                  {t.periods.map((p, i) => <td key={i} className="px-3 text-center">{p}</td>)}
                  <td className="px-3 text-center text-gold">{score(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="border-4 border-black bg-night p-3">
          <h2 className="m-0 mb-2 font-head text-[16px] text-gold">HIGHLIGHTS</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[22px] leading-[22px] text-white">
            {result.highlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </section>
      </div>
      <BoxScore box={you} dex={dex} />
      <BoxScore box={cpu} dex={dex} />
    </div>
  );
}

/** /play: Pre-Game (pick your team and an opponent), then the result of a simmed game. */
export function PlayPage() {
  useMusic("menu");
  const navigate = useNavigate();
  const { data, error } = useRated();
  const dex = useMemo(() => (data ? dexOf(data) : null), [data]);
  const navState = useLocation().state as
    | {
      team?: string; starters?: number[]; select?: 1 | 3 | 5 | "solo" | "half" | null; difficulty?: Difficulty; oppSeed?: number;
      chosen?: number[] | "team"; oppPicks?: number[]; // back from a game: straight to the opponent select
    }
    | null;
  // a brand-new player (no teams yet) gets the five from the title screen
  const teams = useMemo(() => {
    if (!dex || !data) return [];
    const mine = yourTeams(dex);
    const quick = mine.length ? null : titleTeam(navState?.starters, data, dex);
    return quick ? [quick] : mine;
  }, [dex, data, navState?.starters]);
  const [pick, setPick] = useState(0);
  // start on the team we were sent with (a finished draft), else the first team that's ready to play
  const wanted = navState?.team;
  useEffect(() => {
    if (!dex) return;
    const sent = teams.findIndex((t) => t.key === wanted);
    setPick(sent >= 0 ? sent : Math.max(0, teams.findIndex((t) => ready(t.lineup, dex))));
  }, [dex, teams, wanted]);
  // (back from a live game: the same difficulty, opponent and character select)
  const [difficulty, setDifficulty] = useState<Difficulty>(navState?.difficulty ?? "PRO");
  const [oppSeed, setOppSeed] = useState(() => navState?.oppSeed ?? Date.now());
  const [result, setResult] = useState<GameResult | null>(null);
  const [playing, setPlaying] = useState(false);
  // the steps: the game mode (selecting null), your players (selecting set), then your opponent (chosen set)
  const [selecting, setSelecting] = useState<1 | 3 | 5 | "solo" | "half" | null>(navState?.select ?? null);
  const [chosen, setChosen] = useState<number[] | "team" | null>(navState?.select ? navState.chosen ?? null : null); // your players
  const [oppPicks, setOppPicks] = useState<number[]>(navState?.oppPicks ?? []); // the opponents you picked yourself

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      backBlip();
      if (result) setResult(null);
      else if (chosen) setChosen(null); // opponent select → your players
      else if (!selecting) navigate("/", { state: { menu: true } });
      // (the character select takes its own Esc)
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, navigate, chosen, selecting]);

  const mine = teams[pick]?.lineup;
  const level = mine && !allowedIn(difficulty, mine.mode) ? "ALL-STAR" : difficulty; // Champion needs Unlimited
  const cpu = useMemo(() => (data && mine ? cpuTeam(data, level, mine.mode, oppSeed) : null), [data, mine, level, oppSeed]);
  const playable = !!(mine && dex && ready(mine, dex));
  // how many a side this game has (the opponent select picks that many)
  const oppSize: 1 | 3 | 5 = selecting === "solo" ? 5 : selecting === "half" || selecting === null ? 1 : selecting;
  /** Who plays for the opponent: the ones you picked, the ready-made fill the rest. */
  const finalOpp = () => [...oppPicks, ...presetPicks(cpu!, oppSize, dex!).filter((id) => !oppPicks.includes(id))].slice(0, oppSize);
  /** The opponent's eight in court order: the ones you picked (the ready-made fill the rest), then its bench. */
  const oppLineup = (ids: number[]) => {
    const rest = cpu!.ids.filter((id): id is number => id != null && !ids.includes(id));
    return [...ids, ...rest].slice(0, 8);
  };

  const sim = () => {
    if (!mine || !cpu || !dex || !playable) return;
    const away = chosen && selecting ? { ...cpu, ids: oppLineup(finalOpp()) } : cpu;
    const r = simGame(mine, away, dex, Date.now() >>> 0);
    setResult(r);
    if (reducedMotion()) blip(score(r.teams[0]) > score(r.teams[1]) ? 1320 : 220, 200);
    else setPlaying(true); // the tip-off playback shows the result
    document.querySelector("main")?.scrollTo(0, 0);
  };

  /** The live game, with the players you picked on the select screen (none picked: the five starters and bench). */
  const live = (size: 1 | 3 | 5, tutorial = false, picks?: number[], solo = false, ids?: number[], half = false, opp?: number[]) => {
    if (!mine || !cpu || !dex || !playable) return;
    const youColor = teamColor(mine.colors[0]);
    const cpuColor = teamColor(cpu.colors[0] === mine.colors[0] ? cpu.colors[1] : cpu.colors[0]);
    selectBlip();
    const back = {
      team: teams[pick].key, select: tutorial ? null : half ? "half" as const : solo ? "solo" as const : size, difficulty, oppSeed,
      chosen: tutorial ? undefined : (chosen ?? undefined), oppPicks: tutorial ? undefined : oppPicks,
    };
    // the opponent you settled on: its eight (your picks first) and which of them play
    const away = opp ? { ...cpu, ids: oppLineup(opp) } : cpu, awayPicks = opp ? opp.map((_, i) => i) : undefined;
    navigate("/play/live", {
      state: { home: { ...mine, ids: ids ?? mine.ids, name: mine.name || "YOU" }, away, awayPicks, size, picks, solo, half, youColor, cpuColor, level, tutorial, back } satisfies ArcadeSetup,
    });
  };

  const header = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h1 className="m-0 flex items-center gap-2 font-head text-[16px] text-gold">
        <HomeLogo />
        {result ? "FINAL" : chosen ? "CHOOSE YOUR OPPONENT" : selecting ? "CHARACTER SELECT" : "GAME MODE"}
      </h1>
      <button
        className="px-btn"
        onClick={() => (result ? setResult(null) : chosen ? setChosen(null) : selecting ? (setSelecting(null), setOppPicks([])) : navigate("/", { state: { menu: true } }))}
      >
        <Arrow left /> BACK<span className="hidden sm:inline"> (ESC)</span>
      </button>
    </div>
  );

  if (error) return <div className="mx-auto max-w-[1200px] p-4">{header}<div className="px-box p-3 text-red">{error}</div></div>;
  if (!dex || !data) return <div className="mx-auto max-w-[1200px] p-4">{header}<div className="blink font-head text-[16px] text-cloud">LOADING…</div></div>;

  if (!teams.length || !mine) {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <div className="px-box flex flex-col gap-3 p-4 text-[24px]">
          You need a team first. Draft one, or build one in Free Build.
          <span className="flex gap-2">
            <button className="px-btn" onClick={() => navigate("/draft")}>DRAFT</button>
            <button className="px-btn" onClick={() => navigate("/build")}>FREE BUILD</button>
          </span>
        </div>
      </div>
    );
  }

  if (result && cpu && playing) {
    return <TipOff result={result} home={mine} away={cpu} onDone={() => setPlaying(false)} />;
  }

  if (result && cpu) {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <Results result={result} dex={dex} mine={mine} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="px-btn" onClick={sim}>REMATCH</button>
          <button className="px-btn" onClick={() => (setOppSeed(Date.now()), setResult(null))}>NEW OPPONENT</button>
          <button className="px-btn" onClick={() => navigate("/", { state: { menu: true } })}>MAIN MENU</button>
        </div>
      </div>
    );
  }

  /** Tip-off from the opponent select: your players (or the whole team), against the opponent you settled on. */
  const startGame = (opp: number[]) => {
    if (chosen === "team") return live(5, false, undefined, false, undefined, false, opp); // ENTIRE TEAM
    if (!chosen || !selecting) return;
    // your chosen Pokémon (from your team or the Pokédex) come first; the rest of your team is the bench.
    // SOLO: 5 on 5 as your one pick, with your team's first four starters (other than you) beside you
    const size = selecting === "solo" ? 5 : selecting === "half" ? 1 : selecting;
    const ids8 = [...chosen, ...mine.ids.filter((id): id is number => id != null && !chosen.includes(id))].slice(0, 8);
    live(size, false, ids8.slice(0, size).map((_, i) => i), selecting === "solo", ids8, selecting === "half", opp);
  };

  // step 3: the opponent
  if (selecting && chosen && cpu) {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <OpponentSelect
          size={oppSize}
          dex={dex}
          cpu={cpu}
          level={level}
          yourMode={mine.mode}
          picks={oppPicks}
          setPicks={setOppPicks}
          onDifficulty={setDifficulty}
          onNew={() => (setOppSeed(Date.now()), setOppPicks([]))}
          onSim={selecting === 5 ? sim : undefined}
          onStart={startGame}
          onBack={() => setChosen(null)}
        />
      </div>
    );
  }

  // step 2: your players
  if (selecting) {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        {header}
        <CharacterSelect
          size={selecting === "solo" || selecting === "half" ? 1 : selecting}
          solo={selecting === "solo"}
          teams={teams.map((t) => ({ ...t, ready: ready(t.lineup, dex) }))}
          team={pick}
          setTeam={setPick}
          dex={dex}
          onStart={(ids) => (setChosen(ids ?? "team"), document.querySelector("main")?.scrollTo(0, 0))} // (no ids: ENTIRE TEAM)
          onBack={() => (setSelecting(null), setOppPicks([]))}
        />
      </div>
    );
  }

  // step 1: the game mode, and only that
  return (
    <div className="mx-auto max-w-[1200px] p-4">
      {header}
      {!playable && <p className="px-box mb-4 p-3 text-[22px] text-red">This team can't play yet: it needs all 8 players and no rule broken (check it in Free Build).</p>}
      <ModeSelect playable={playable} onPick={(m) => (setSelecting(m), setChosen(null), setOppPicks([]))} onTutorial={() => live(3, true)} />
    </div>
  );
}
