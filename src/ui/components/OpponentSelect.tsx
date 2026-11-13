import { useEffect, useMemo, useState } from "react";
import { allowedIn, presetPicks, type Difficulty } from "../../core/cpuTeam.ts";
import { teamOvr, type Lineup, type Mode } from "../../core/lineup.ts";
import { DIFFICULTIES } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { backBlip, moveBlip, selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { Arrow } from "./Arrow.tsx";
import { DexBrowser } from "./DexBrowser.tsx";
import { teamColor } from "./LineupCard.tsx";
import { PlayerModal, StatsButton } from "./Modal.tsx";
import { Sprite } from "./PlayerCard.tsx";

const KIND = { 1: "SINGLE OPPONENT", 3: "OPPOSING TRIO", 5: "OPPOSING TEAM" } as const;

/** The last step before tip-off: who you're playing. A ready-made opponent (a team, a trio or a single Pokémon, by
 *  the size of the game) is already chosen at the top, with the difficulty and NEW OPPONENT; or pick your own
 *  from the Pokédex underneath (the ready-made ones fill any spots you leave). `picks` are your own choices;
 *  `onStart` gets the final players, in court order. */
export function OpponentSelect({ size, dex, cpu, level, yourMode, picks, setPicks, onDifficulty, onNew, onStart, onSim, onBack }: {
  size: 1 | 3 | 5;
  dex: Map<number, RatedPokemon>;
  cpu: Lineup; // the ready-made opponent's whole team (its bench rides along in a team game)
  level: Difficulty;
  yourMode: Mode; // Champion needs an Unlimited team
  picks: number[];
  setPicks: (ids: number[]) => void;
  onDifficulty: (d: Difficulty) => void;
  onNew: () => void;
  onStart: (ids: number[]) => void;
  onSim?: () => void;
  onBack: () => void;
}) {
  const [stats, setStats] = useState<RatedPokemon | null>(null);
  const preset = useMemo(() => presetPicks(cpu, size, dex), [cpu, size, dex]);
  // your choices first, the ready-made opponent fills the rest
  const final = useMemo(() => [...picks, ...preset.filter((id) => !picks.includes(id))].slice(0, size), [picks, preset, size]);
  const [home, accent] = cpu.colors.map(teamColor);
  const all = useMemo(() => [...dex.values()], [dex]);

  const toggle = (id: number) => {
    moveBlip();
    // clicking a chosen one drops it; past the size, the oldest choice makes room
    setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id].slice(-size));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stats || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Enter") (e.preventDefault(), selectBlip(), onStart(final));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stats, final, onStart]);

  // the rating badge follows who's actually playing: the final players first, then the rest of its team (as the game builds it)
  const shown = useMemo(() => ({ ...cpu, ids: [...final, ...cpu.ids.filter((id): id is number => id != null && !final.includes(id))].slice(0, 8) }), [cpu, final]);
  const bench = cpu.ids.filter((id): id is number => id != null && !final.includes(id)).slice(0, 8 - size);

  return (
    <div className="flex flex-col gap-4">
      {/* the opponent, already chosen */}
      <section className="border-4 border-black bg-night" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2" style={{ background: PALETTE[home] }}>
          <span className="min-w-0 bg-black px-2 py-1">
            <span className="block text-[20px] leading-[20px] text-cloud">{KIND[size]} · CPU {level}</span>
            <span className="block truncate font-head text-[16px] leading-[24px] text-white">{picks.length ? "YOUR PICKS" : cpu.name || "CPU"}</span>
          </span>
          <span className="border-4 border-black bg-black px-2 pt-1 font-head text-[24px] text-gold" title="The opponent's overall rating (it updates as you pick)">{teamOvr(shown, dex)}</span>
        </div>
        <div className="h-[6px]" style={{ background: PALETTE[accent] }} />
        <div className="mx-auto grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, maxWidth: size * 210 }}>
          {final.map((id) => {
            const p = dex.get(id)!, mine = picks.includes(id);
            return (
              <div key={id} className="relative flex min-w-0 flex-col items-center bg-navy px-1 pb-1" style={{ outline: mine ? `4px solid ${PALETTE.gold}` : undefined }}>
                <span className="flex w-full justify-between text-[20px] leading-[22px]">
                  <span className="text-cloud">{p.best}</span>
                  <span className="text-gold">{p.ovr[p.best]}</span>
                </span>
                <span className="flex h-[96px] max-w-full items-end justify-center overflow-hidden">
                  <Sprite p={p} eager className="max-w-none" />
                </span>
                <span className="w-full truncate text-center text-[20px] leading-[22px] text-white">{p.name}</span>
                <StatsButton p={p} onOpen={() => setStats(p)} className="absolute -bottom-[10px] -right-[10px] z-10" />
              </div>
            );
          })}
        </div>
        {size === 5 && bench.length > 0 && (
          <p className="m-0 px-3 pb-2 text-[20px] text-cloud">BENCH: {bench.map((id) => dex.get(id)?.name).join(" · ")}</p>
        )}
      </section>

      {/* difficulty, a new draw, and off we go */}
      <div className="px-box flex flex-wrap items-center gap-3 p-3">
        <span className="flex flex-wrap gap-1" role="group" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.name}
              className="px-btn"
              aria-pressed={level === d.name}
              disabled={!allowedIn(d.name, yourMode)}
              title={!allowedIn(d.name, yourMode) ? "Champion needs an Unlimited team" : `${d.min}–${d.max} OVR`}
              onClick={() => (selectBlip(), onDifficulty(d.name))}
            >
              {d.name}
            </button>
          ))}
        </span>
        <button className="px-btn" onClick={() => (selectBlip(), onNew())}>NEW OPPONENT</button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button className="px-btn" onClick={() => (backBlip(), onBack())}><Arrow left /> BACK<span className="hidden sm:inline"> (ESC)</span></button>
          {onSim && <button className="px-btn" onClick={() => (selectBlip(), onSim())} title="The CPU plays it out and shows you the result">SIM GAME</button>}
          <button className="px-btn !bg-gold !text-black" onClick={() => (selectBlip(), onStart(final))}>START <Arrow /></button>
        </span>
      </div>

      {/* or pick your own */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 font-head text-[16px] text-gold">OR PICK YOUR OWN FROM THE POKéDEX{size > 1 ? ` (UP TO ${size})` : ""}</h2>
        {picks.length > 0 && <button className="px-btn !py-0 !text-[20px]" onClick={() => (backBlip(), setPicks([]))}>CLEAR PICKS</button>}
      </div>
      <DexBrowser
        data={all}
        onCard={(p) => toggle(p.id)}
        onStats={setStats}
        tagOf={(p) => (picks.includes(p.id) ? `OPP ${picks.indexOf(p.id) + 1}` : undefined)}
      />
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
