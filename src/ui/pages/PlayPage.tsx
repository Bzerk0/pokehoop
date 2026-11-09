import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { chemistry } from "../../core/chemistry.ts";
import { allowedIn, cpuTeam, type Difficulty } from "../../core/cpuTeam.ts";
import { checkDraft, isOver, toLineup } from "../../core/draft.ts";
import { autoFill, boostedOvr, dexOf, emptyLineup, problems, SLOTS, STARTERS, teamOvr, type Lineup } from "../../core/lineup.ts";
import { DIFFICULTIES } from "../../core/ratingConfig.ts";
import { simGame, type GameResult } from "../../core/sim/sim.ts";
import { clock, score, totals, type TeamBox } from "../../core/stats.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { listTeams, loadDraft, loadRun, teamLineup } from "../../storage.ts";
import { HomeLogo } from "../components/HomeLogo.tsx";
import { teamColor } from "../components/LineupCard.tsx";
import { reducedMotion } from "../components/Cabinet3D.tsx";
import { Sprite } from "../components/PlayerCard.tsx";
import { TipOff } from "../components/TipOff.tsx";
import { useRated } from "../data.ts";
import { backBlip, blip, selectBlip } from "../sound.ts";
import type { ArcadeSetup } from "./ArcadePage.tsx";
import { inkOn, PALETTE } from "../theme/palette.ts";
import { Arrow } from "../components/Arrow.tsx";
import { CharacterSelect } from "../components/CharacterSelect.tsx";
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

/** One side of the matchup: the team's colours, name and OVR, its starting five and bench. */
function TeamPanel({ lineup, dex, tag }: { lineup: Lineup; dex: Dex; tag: string }) {
  const [home, accent] = lineup.colors.map(teamColor);
  const { boosts } = chemistry(lineup, dex);
  return (
    <section className="flex min-w-0 flex-col border-4 border-black bg-night" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
      <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: PALETTE[home], color: PALETTE[inkOn(home)] }}>
        <span className="min-w-0">
          <span className="block text-[20px] leading-[20px]">{tag}</span>
          <span className="block truncate font-head text-[16px] leading-[24px]">{lineup.name || "UNNAMED TEAM"}</span>
        </span>
        <span className="border-4 border-black bg-black px-2 pt-1 font-head text-[24px] text-gold">{teamOvr(lineup, dex)}</span>
      </div>
      <div className="h-[6px]" style={{ background: PALETTE[accent] }} />
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-1 p-2">
        {SLOTS.slice(0, STARTERS).map((slot, i) => {
          const p = dex.get(lineup.ids[i] ?? -1);
          if (!p) {
            return (
              <div key={slot} className="flex flex-col items-center bg-navy px-1 pb-1 text-[20px] text-steel">
                <span className="w-full text-cloud">{slot}</span>
                <span className="flex h-[64px] items-center">EMPTY</span>
              </div>
            );
          }
          return (
            <div key={slot} className="flex min-w-0 flex-col items-center bg-navy px-1 pb-1">
              <span className="flex w-full flex-wrap justify-between text-[20px] leading-[20px]">
                <span className="text-cloud">{slot}</span>
                <span className="text-gold">{boostedOvr(i, p, boosts[i])}</span>
              </span>
              <span className="flex h-[64px] max-w-full items-end justify-center overflow-hidden">
                <Sprite p={p} eager className="max-w-none" />
              </span>
              <span className="w-full truncate text-center text-[18px] leading-[18px] text-white">{p.name}</span>
            </div>
          );
        })}
      </div>
      <p className="m-0 px-3 pb-2 text-[20px] text-cloud">
        BENCH: {lineup.ids.slice(STARTERS).map((id) => dex.get(id ?? -1)?.name ?? "EMPTY").join(" · ")}
      </p>
    </section>
  );
}

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
          {box.lines.map((l) => (
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
  const periods = you.periods.map((_, i) => (i < 4 ? `Q${i + 1}` : i === 4 ? "OT" : `${i - 3}OT`));
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
    | { team?: string; starters?: number[]; select?: 1 | 3 | 5 | "solo" | "half" | null; difficulty?: Difficulty; oppSeed?: number }
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
  const [selecting, setSelecting] = useState<1 | 3 | 5 | "solo" | "half" | null>(navState?.select ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      backBlip();
      if (result) setResult(null);
      else navigate("/", { state: { menu: true } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, navigate]);

  const mine = teams[pick]?.lineup;
  const level = mine && !allowedIn(difficulty, mine.mode) ? "ALL-STAR" : difficulty; // Champion needs Unlimited
  const cpu = useMemo(() => (data && mine ? cpuTeam(data, level, mine.mode, oppSeed) : null), [data, mine, level, oppSeed]);
  const playable = !!(mine && dex && ready(mine, dex));

  const sim = () => {
    if (!mine || !cpu || !dex || !playable) return;
    const r = simGame(mine, cpu, dex, Date.now() >>> 0);
    setResult(r);
    if (reducedMotion()) blip(score(r.teams[0]) > score(r.teams[1]) ? 1320 : 220, 200);
    else setPlaying(true); // the tip-off playback shows the result
    document.querySelector("main")?.scrollTo(0, 0);
  };

  /** The live game, with the players you picked on the select screen (none picked: the five starters and bench). */
  const live = (size: 1 | 3 | 5, tutorial = false, picks?: number[], solo = false, ids?: number[], half = false) => {
    if (!mine || !cpu || !dex || !playable) return;
    const youColor = teamColor(mine.colors[0]);
    const cpuColor = teamColor(cpu.colors[0] === mine.colors[0] ? cpu.colors[1] : cpu.colors[0]);
    selectBlip();
    const back = { team: teams[pick].key, select: tutorial ? null : half ? "half" as const : solo ? "solo" as const : size, difficulty, oppSeed };
    navigate("/play/live", {
      state: { home: { ...mine, ids: ids ?? mine.ids, name: mine.name || "YOU" }, away: cpu, size, picks, solo, half, youColor, cpuColor, level, tutorial, back } satisfies ArcadeSetup,
    });
  };

  const header = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h1 className="m-0 flex items-center gap-2 font-head text-[16px] text-gold">
        <HomeLogo />
        {result ? "FINAL" : selecting ? "CHARACTER SELECT" : "PRE-GAME"}
      </h1>
      <button className="px-btn" onClick={() => (result ? setResult(null) : selecting ? setSelecting(null) : navigate("/", { state: { menu: true } }))}>
        <Arrow left /> {result || selecting ? "PRE-GAME" : "BACK"}<span className="hidden sm:inline"> (ESC)</span>
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
          onStart={(ids) => {
            if (!ids) return live(5); // ENTIRE TEAM
            // the chosen Pokémon (from your team or the Pokédex) come first; the rest of your team is the bench.
            // SOLO: 5 on 5 as your one pick, with your team's first four starters (other than you) beside you
            const size = selecting === "solo" ? 5 : selecting === "half" ? 1 : selecting;
            const ids8 = [...ids, ...mine.ids.filter((id): id is number => id != null && !ids.includes(id))].slice(0, 8);
            live(size, false, ids8.slice(0, size).map((_, i) => i), selecting === "solo", ids8, selecting === "half");
          }}
          onBack={() => setSelecting(null)}
        />
      </div>
    );
  }

  const modes = [
    [1, "ONES", "One on one, first to 11"],
    [3, "THREES", "3 on 3, a full timed game"],
    [5, "FIVES", "5 on 5, the real thing"],
    ["solo", "SOLO", "5 on 5 as one Pokémon (test)"],
    ["half", "HALF 1V1", "Half-court 1 on 1, streetball (test)"],
  ] as const;

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      {header}
      {!playable && <p className="px-box mb-4 p-3 text-[22px] text-red">This team can't play yet: it needs all 8 players and no rule broken (check it in Free Build).</p>}
      {/* the live game modes first: they're what most people came for */}
      <h2 className="mb-2 mt-0 text-center font-head text-[16px] text-gold">PLAY LIVE</h2>
      <div className="grid gap-3 sm:grid-cols-5">
        {modes.map(([size, name, blurb]) => (
          <button key={size} className="px-btn flex flex-col items-center gap-2 !py-4" onClick={() => (selectBlip(), setSelecting(size))} disabled={!playable}>
            <span className="font-head text-[24px] leading-[32px]">{name} <Arrow /></span>
            <span className="text-[20px] normal-case">{blurb}</span>
          </button>
        ))}
      </div>
      <div className="mb-5 mt-2 flex justify-center">
        <button className="px-btn !text-[20px]" onClick={() => live(3, true)} disabled={!playable} title="Learn the controls in a quick practice">HOW TO PLAY</button>
      </div>

      <div className="px-box mb-4 flex flex-wrap items-center gap-4 p-3">
        <label className="flex min-w-0 max-w-full items-center gap-2">
          <span className="shrink-0 text-[20px] text-cloud">YOUR TEAM</span>
          <select className="px-input min-w-0 max-w-[360px]" value={pick} onChange={(e) => (selectBlip(), setPick(Number(e.target.value)))}>
            {teams.map((t, i) => (
              <option key={t.key} value={i}>
                {t.label}: {t.lineup.name || "UNNAMED"}{ready(t.lineup, dex) ? "" : " (NOT READY)"}
              </option>
            ))}
          </select>
        </label>
        <span className="flex flex-wrap gap-1" role="group" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.name}
              className="px-btn"
              aria-pressed={level === d.name}
              disabled={!allowedIn(d.name, mine.mode)}
              title={!allowedIn(d.name, mine.mode) ? "Champion needs an Unlimited team" : `${d.min}–${d.max} OVR`}
              onClick={() => (selectBlip(), setDifficulty(d.name))}
            >
              {d.name}
            </button>
          ))}
        </span>
        <button className="px-btn" onClick={() => (selectBlip(), setOppSeed(Date.now()))}>NEW OPPONENT</button>
      </div>


      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <TeamPanel lineup={mine} dex={dex} tag="YOU" />
        <span className="text-center font-head text-[32px] text-gold">VS</span>
        {cpu && <TeamPanel lineup={cpu} dex={dex} tag={`CPU · ${level}`} />}
      </div>

      <div className="px-box mt-6 flex flex-wrap items-center justify-center gap-3 p-3">
        <span className="text-[20px] text-cloud">NO TIME? THE CPU PLAYS IT OUT AND SHOWS YOU THE RESULT.</span>
        <button className="px-btn" onClick={sim} disabled={!playable}>SIM GAME <Arrow /></button>
      </div>
    </div>
  );
}
