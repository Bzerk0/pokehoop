import { useEffect, useMemo, useState } from "react";
import { SLOTS, slotOvr, slotPosition, STARTERS, type Lineup } from "../../core/lineup.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { backBlip, moveBlip, selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { Arrow } from "./Arrow.tsx";
import { teamColor } from "./LineupCard.tsx";
import { DexBrowser } from "./DexBrowser.tsx";
import { PlayerModal, StatsButton } from "./Modal.tsx";
import { Sprite } from "./PlayerCard.tsx";

type Team = { key: string; label: string; lineup: Lineup; ready: boolean };
const MODE = { 1: "ONES", 3: "THREES", 5: "FIVES" } as const;

/** Before a live game: your team on the court (like Free Build) with the whole Pokédex under it. Click the 1, 3 or 5
 *  Pokémon you'll take on court, from either (in the order you click them). In FIVES, ENTIRE TEAM plays your starting
 *  five with the bench behind them. `onStart` gets the chosen Pokémon ids. */
export function CharacterSelect({ size, solo = false, teams, team, setTeam, dex, onStart, onBack }: {
  size: 1 | 3 | 5;
  solo?: boolean;
  teams: Team[];
  team: number;
  setTeam: (i: number) => void;
  dex: Map<number, RatedPokemon>;
  onStart: (ids?: number[]) => void;
  onBack: () => void;
}) {
  const [picks, setPicks] = useState<number[]>([]);
  const [stats, setStats] = useState<RatedPokemon | null>(null);
  useEffect(() => setPicks([]), [team]);
  const lineup = teams[team].lineup;
  const full = picks.length === size;
  const [home, accent] = lineup.colors.map(teamColor);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stats) return; // the stats window takes Esc and Enter first
      if (e.key === "Escape") (e.stopImmediatePropagation(), backBlip(), onBack());
      else if (e.key === "Enter" && full && !(e.target instanceof HTMLInputElement)) (selectBlip(), onStart(picks));
    };
    window.addEventListener("keydown", onKey, true); // before the Play page's own Esc handler
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full, picks, onBack, onStart, stats]);

  const toggle = (id: number) => {
    moveBlip();
    setPicks((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : size === 1 ? [id] : ps.length < size ? [...ps, id] : ps));
  };
  const tag = (id: number) => {
    const n = picks.indexOf(id);
    return <span className={`text-[20px] leading-[20px] ${n >= 0 ? "text-gold" : "invisible"}`}>P{n + 1}</span>;
  };

  const all = useMemo(() => [...dex.values()], [dex]);

  /** One of your team's 8 spots, drawn like Free Build's. */
  const tile = (slot: number, color: string) => {
    const p = dex.get(lineup.ids[slot] ?? -1);
    if (!p) return <div className="h-full border-4 border-black bg-night" />;
    const on = picks.includes(p.id);
    return (
      <div className="relative">
      <button
        className={`flex w-full cursor-pointer flex-col border-4 bg-night px-[6px] pb-[4px] pt-[2px] text-left hover:bg-navy ${on ? "bg-navy" : ""}`}
        style={{ borderColor: on ? PALETTE.gold : color, boxShadow: `2px 2px 0 ${PALETTE.black}` }}
        aria-pressed={on}
        onClick={() => toggle(p.id)}
      >
        <span className="flex items-center justify-between">
          <span className={`text-[20px] ${on ? "text-gold" : "text-cloud"}`}>{slot < STARTERS ? SLOTS[slot] : slotPosition(slot, p)}</span>
          <span className="font-head text-[16px] text-gold">{slotOvr(slot, p)}</span>
        </span>
        <span className="flex h-[100px] items-end justify-center overflow-hidden">
          <Sprite p={p} eager className="max-w-none" />
        </span>
        <span className="line-clamp-2 min-h-[36px] break-words text-center text-[20px] leading-[18px] text-white">{p.name}</span>
        <span className="text-center">{tag(p.id)}</span>
      </button>
      <StatsButton p={p} onOpen={() => setStats(p)} className="absolute -bottom-[12px] -right-[12px]" />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="px-box flex flex-wrap items-center gap-2 p-3">
        <span className="text-[20px] text-cloud">YOUR TEAM</span>
        {teams.map((t, i) => (
          <button key={t.key} className="px-btn !text-[20px]" aria-pressed={i === team} disabled={!t.ready} onClick={() => (selectBlip(), setTeam(i))}>
            {t.lineup.name || t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <h2 className="m-0 font-head text-[16px] text-gold">
          {solo ? "SOLO: CHOOSE YOUR POKÉMON" : `${MODE[size]}: CHOOSE ${size} (${picks.length}/${size})`}
        </h2>
        <button className="px-btn" onClick={() => (backBlip(), onBack())}><Arrow left /> BACK</button>
        {size === 5 && !solo && (
          <button className="px-btn" onClick={() => (selectBlip(), onStart())} title="Your starting five, with the bench to sub in">
            ENTIRE TEAM <Arrow />
          </button>
        )}
        <button className="px-btn !bg-gold !text-black disabled:!bg-night disabled:!text-steel" disabled={!full} onClick={() => (selectBlip(), onStart(picks))}>
          START <Arrow />
        </button>
      </div>
      <p className="m-0 text-center text-[20px] text-cloud">
        {solo
          ? "You play only as them. The CPU runs your teammates; your pass key calls for the ball, and you call a play every time you get it."
          : "Pick from your team or from the Pokédex below. Whoever's left on your team waits on the bench."}
      </p>

      {/* your team on the court: starters up top, the bench below the sideline (as in Free Build) */}
      <div className="relative border-4 border-black bg-wood px-4 pb-4 pt-5">
        <div className="pointer-events-none absolute inset-[6px] border-2 border-white" />
        <div className="relative grid grid-cols-3 gap-3 sm:grid-cols-5">
          {SLOTS.slice(0, STARTERS).map((_, i) => <div key={i}>{tile(i, PALETTE[home])}</div>)}
        </div>
        <div className="relative mb-2 mt-4 flex items-center gap-2">
          <span className="h-[4px] flex-1" style={{ background: PALETTE[accent] }} />
          <span className="text-[24px] leading-[20px] text-black">BENCH</span>
          <span className="h-[4px] flex-1" style={{ background: PALETTE[accent] }} />
        </div>
        <div className="relative grid grid-cols-3 gap-3 sm:grid-cols-5">
          {SLOTS.slice(STARTERS).map((_, j) => (
            <div key={j} className={j === 0 ? "sm:col-start-2" : ""}>{tile(STARTERS + j, PALETTE[accent])}</div>
          ))}
        </div>
      </div>

      {/* the whole Pokédex (as on the Pokédex page): anyone can play */}
      <h2 className="m-0 mt-2 font-head text-[16px] text-gold">OR PICK FROM THE POKéDEX</h2>
      <div>
        <DexBrowser
          data={all}
          onCard={(p) => toggle(p.id)}
          onStats={setStats}
          tagOf={(p) => (picks.includes(p.id) ? `P${picks.indexOf(p.id) + 1}` : undefined)}
        />
      </div>
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
