import { useEffect, useState } from "react";
import { budgetOf, isDone, onClock, standings, startFull, totalPicks, YOU, youPick } from "../../core/fullDraft.ts";
import { chemistry } from "../../core/chemistry.ts";
import { emptyLineup, salary, SLOTS, slotOvr, STARTERS, type Mode } from "../../core/lineup.ts";
import { ChemistryList } from "./ChemistryList.tsx";
import type { RatedPokemon } from "../../core/types.ts";
import { blip, moveBlip, selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { Arrow } from "./Arrow.tsx";
import { PlayerModal, StatsButton } from "./Modal.tsx";
import { Sprite } from "./PlayerCard.tsx";

const best = (p: RatedPokemon) => p.ovr[p.best];
const PICK_MS = 280; // how fast the CPU picks tick by on the board

/** The FULL DRAFT, like a real one: the lottery order along the top, the board of who's left, the picks coming in,
 *  and your roster. CPU picks tick in one at a time; on your pick, choose a Pokémon (one you can afford) and its spot.
 *  `onDone` gets your 8 picks once every round is in. */
export function FullDraftView({ pool, dex, mode, seed, onDone }: {
  pool: RatedPokemon[]; dex: Map<number, RatedPokemon>; mode: Mode; seed: number; onDone: (ids: (number | null)[]) => void;
}) {
  const [fd, setFd] = useState(() => startFull(pool, dex, mode, seed));
  const [shown, setShown] = useState(0); // picks shown on the board so far (the rest tick in)
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState<RatedPokemon | null>(null);

  const ticking = shown < fd.picks.length;
  const done = isDone(fd) && !ticking;
  const yourTurn = !ticking && !isDone(fd) && onClock(fd) === YOU;
  useEffect(() => {
    if (!ticking) return;
    const t = setTimeout(() => {
      setShown((n) => n + 1);
      blip(fd.picks[shown].team === YOU ? 990 : 520, 40, 0.03);
    }, fd.picks[shown].team === YOU ? 0 : PICK_MS);
    return () => clearTimeout(t);
  }, [ticking, shown, fd]);
  useEffect(() => {
    if (yourTurn) [659, 880, 1175].forEach((f, k) => setTimeout(() => blip(f, 60, 0.05), k * 70)); // you're on the clock
  }, [yourTurn, fd.picks.length]);

  // the board and rosters as far as the picks shown so far
  const seen = fd.picks.slice(0, shown);
  const gone = new Set(seen.map((p) => p.id));
  const board = fd.pool.filter((id) => !gone.has(id)).map((id) => dex.get(id)!);
  const roster = SLOTS.map((_, s) => seen.find((p) => p.team === YOU && p.slot === s)?.id ?? null);
  const budget = budgetOf(fd, YOU, dex);
  const n = Math.min(shown, totalPicks(fd) - 1), round = Math.floor(n / fd.order.length) + 1, pickNo = (n % fd.order.length) + 1;
  const clock = isDone(fd) ? -1 : onClock({ ...fd, picks: seen });

  const place = (slot: number, id = selected) => {
    if (!yourTurn || id == null || roster[slot] != null) return;
    selectBlip();
    setSelected(null);
    setFd(youPick(fd, dex, id, slot));
  };
  // chemistry: your roster as it stands, and what a Pokémon on the board would add at its best open spot
  const mine = { ...emptyLineup(mode), ids: roster };
  const chemFor = (p: RatedPokemon) => {
    const open = roster.flatMap((id, s) => (id == null ? [s] : []));
    if (!open.length) return { boost: 0, names: "" };
    const slot = open.reduce((a, b) => (slotOvr(b, p) > slotOvr(a, p) ? b : a));
    const { links, boosts } = chemistry({ ...mine, ids: roster.map((x, i) => (i === slot ? p.id : x)) }, dex);
    return { boost: boosts[slot], names: links.filter((k) => k.slots.includes(slot)).map((k) => k.name).join(", ") };
  };
  const bestSlot = (p: RatedPokemon) => roster.flatMap((id, s) => (id == null ? [s] : [])).reduce((a, b) => (slotOvr(b, p) > slotOvr(a, p) ? b : a));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selected != null) (e.preventDefault(), place(bestSlot(dex.get(selected)!)));
      else if (e.key === "Escape" && selected != null) (e.stopImmediatePropagation(), setSelected(null));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (done) {
    const table = standings(fd, dex);
    const rank = table.findIndex((r) => r.team === YOU) + 1;
    return (
      <div className="flex flex-col gap-4">
        <section className="border-4 border-black bg-red px-4 py-4" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
          <p className="m-0 font-head text-[24px] leading-[1.3] text-white">DRAFT COMPLETE</p>
          <p className="m-0 text-[24px] text-white">Your draft ranks #{rank} of {table.length}.</p>
        </section>
        <section className="px-box p-3">
          <h2 className="m-0 mb-2 font-head text-[16px] text-gold">DRAFT RANKINGS</h2>
          {table.map((r, i) => (
            <div key={r.team} className={`flex justify-between border-b-2 border-slate py-1 text-[22px] ${r.team === YOU ? "text-gold" : "text-white"}`}>
              <span>#{i + 1} {r.name}</span>
              <span>{r.rating.toFixed(1)}</span>
            </div>
          ))}
        </section>
        <button className="px-btn self-start !bg-gold !text-[24px] !text-black" onClick={() => (selectBlip(), onDone(fd.rosters[YOU]))}>
          SEE YOUR TEAM <Arrow />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* the order: the lottery, the same every round; whoever is on the clock lit */}
      <section className="border-4 border-black bg-navy p-3" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
        <p className="m-0 text-[24px] text-cloud">ROUND {round} OF {SLOTS.length} · PICK {pickNo} · {mode.toUpperCase()}</p>
        <p className={`m-0 font-head text-[24px] leading-[1.3] ${yourTurn ? "blink text-gold" : "text-white"}`}>
          {yourTurn ? "YOU'RE ON THE CLOCK!" : clock >= 0 ? `${fd.names[clock]} ARE PICKING…` : "…"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {fd.order.map((t, i) => (
            <span
              key={t}
              className={`border-2 px-2 text-[18px] ${t === clock ? "border-gold bg-gold text-black" : t === YOU ? "border-gold text-gold" : "border-slate text-cloud"}`}
            >
              {i + 1}. {fd.names[t]}
            </span>
          ))}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* the board: who's left, best first; the ones over your budget are greyed out */}
        <section className="px-box flex max-h-[520px] flex-col p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="m-0 font-head text-[16px] text-gold">THE BOARD</h2>
            <span className="text-[22px] text-lime">YOUR BUDGET ${budget}M</span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
            {board.map((p) => {
              const tooMuch = salary(p) > budget, on = selected === p.id, chem = chemFor(p);
              return (
                <div key={p.id} className="relative flex">
                  <button
                    className={`flex w-full flex-col items-center border-4 p-1 ${on ? "border-gold bg-navy" : "border-slate bg-night"} ${tooMuch ? "grayscale" : ""}`}
                    disabled={!yourTurn || tooMuch}
                    onClick={() => (moveBlip(), setSelected(on ? null : p.id))}
                  >
                    <span className="flex w-full justify-between text-[18px] leading-[18px]">
                      <span className="text-cloud">{p.best}</span>
                      <span className="font-head text-[12px] text-gold">{best(p)}</span>
                    </span>
                    <span className="flex h-[64px] items-end"><Sprite p={p} className="max-w-none" /></span>
                    <span className="w-full truncate text-center text-[18px] text-white">{p.name}</span>
                    <span className={`text-[18px] ${tooMuch ? "text-red" : "text-lime"}`}>${salary(p)}M</span>
                    <span className="h-[16px] w-full truncate text-center text-[16px] leading-[16px] text-lime" title={chem.names}>
                      {chem.boost > 0 ? `+${chem.boost} CHEM` : ""}
                    </span>
                  </button>
                  <StatsButton p={p} onOpen={() => setStats(p)} className="absolute -bottom-[8px] -right-[8px]" />
                </div>
              );
            })}
          </div>
        </section>

        {/* the picks coming in, newest first */}
        <section className="px-box flex max-h-[520px] flex-col p-3">
          <h2 className="m-0 mb-2 font-head text-[16px] text-gold">THE PICKS</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {[...seen].reverse().map((pk, i) => {
              const k = seen.length - 1 - i, p = dex.get(pk.id)!;
              return (
                <div key={k} className={`flex items-center gap-2 border-b-2 border-slate py-1 text-[18px] leading-[18px] ${pk.team === YOU ? "text-gold" : "text-cloud"}`}>
                  <span className="w-[54px] shrink-0">R{Math.floor(k / fd.order.length) + 1}.{(k % fd.order.length) + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{fd.names[pk.team]}</span>
                  <span className="truncate text-white">{p.name}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* your roster: with a Pokémon chosen, the open spots show how it'd rate there */}
      <section>
        <h2 className="m-0 mb-2 font-head text-[16px] text-cloud">
          {selected != null ? `PLACE ${dex.get(selected)!.name.toUpperCase()}: CLICK A SPOT (ENTER = BEST FIT)` : "YOUR ROSTER"}
        </h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {SLOTS.map((label, s) => {
            const p = roster[s] != null ? dex.get(roster[s]!)! : null, sel = selected != null ? dex.get(selected)! : null;
            return (
              <button
                key={s}
                className={`flex flex-col items-center border-4 bg-night p-1 ${sel && !p ? "border-gold" : "border-slate"}`}
                disabled={!sel || !!p}
                onClick={() => place(s)}
              >
                <span className="text-[18px] text-cloud">{s < STARTERS ? label : "BENCH"}</span>
                <span className="flex h-[56px] items-end">{p ? <Sprite p={p} className="max-w-none" /> : sel ? <span className="font-head text-[12px] text-gold">{slotOvr(s, sel)}</span> : null}</span>
                <span className="w-full truncate text-center text-[16px] text-white">{p?.name ?? ""}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="px-box p-3">
        <h2 className="m-0 mb-1 font-head text-[12px] text-gold">YOUR CHEMISTRY</h2>
        <ChemistryList lineup={mine} dex={dex} />
      </section>
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
