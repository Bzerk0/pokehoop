import { useState } from "react";
import { budgetOf, isDone, onClock, standings, startFull, swapYours, totalPicks, YOU, youPick } from "../../core/fullDraft.ts";
import { chemistry } from "../../core/chemistry.ts";
import { emptyLineup, salary, SLOTS, slotOvr, STARTERS, type Mode } from "../../core/lineup.ts";
import { ChemistryList } from "./ChemistryList.tsx";
import type { RatedPokemon } from "../../core/types.ts";
import { selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { Arrow } from "./Arrow.tsx";
import { DraftRoom, useTicker } from "./DraftRoom.tsx";

/** The FULL DRAFT, like a real one: the lottery order along the top, the board of who's left, the picks coming in,
 *  and your roster (the draft room, DraftRoom.tsx, shared with the franchise's summer). CPU picks tick in one at a
 *  time; on your pick, choose a Pokémon (one you can afford) and its spot. `onDone` gets your 8 picks once every
 *  round is in. */
export function FullDraftView({ pool, dex, mode, seed, onDone }: {
  pool: RatedPokemon[]; dex: Map<number, RatedPokemon>; mode: Mode; seed: number; onDone: (ids: (number | null)[]) => void;
}) {
  const [fd, setFd] = useState(() => startFull(pool, dex, mode, seed));
  const shown = useTicker(fd.picks.length, (i) => fd.picks[i].team === YOU); // picks shown on the board so far (the rest tick in)

  const ticking = shown < fd.picks.length;
  const done = isDone(fd) && !ticking;
  const yourTurn = !ticking && !isDone(fd) && onClock(fd) === YOU;

  // the board and rosters as far as the picks shown so far
  const seen = fd.picks.slice(0, shown);
  const gone = new Set(seen.map((p) => p.id));
  const roster = SLOTS.map((_, s) => seen.find((p) => p.team === YOU && p.slot === s)?.id ?? null);
  const budget = budgetOf(fd, YOU, dex);
  const n = Math.min(shown, totalPicks(fd) - 1), round = Math.floor(n / fd.order.length) + 1, pickNo = (n % fd.order.length) + 1;
  const clock = isDone(fd) ? -1 : onClock({ ...fd, picks: seen });

  // chemistry: your roster as it stands, and what a Pokémon on the board would add at its best open spot
  const mine = { ...emptyLineup(mode), ids: roster };
  const open = roster.flatMap((id, s) => (id == null ? [s] : []));
  const bestSlot = (p: RatedPokemon) => (open.length ? open.reduce((a, b) => (slotOvr(b, p) > slotOvr(a, p) ? b : a)) : null);
  const chemFor = (p: RatedPokemon) => {
    const slot = bestSlot(p);
    if (slot == null) return { boost: 0, names: "" };
    const { links, boosts } = chemistry({ ...mine, ids: roster.map((x, i) => (i === slot ? p.id : x)) }, dex);
    return { boost: boosts[slot], names: links.filter((k) => k.slots.includes(slot)).map((k) => k.name).join(", ") };
  };

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
    <DraftRoom
      kicker={`ROUND ${round} OF ${SLOTS.length} · PICK ${pickNo} · ${mode.toUpperCase()}`}
      status={yourTurn ? "YOU'RE ON THE CLOCK!" : clock >= 0 ? `${fd.names[clock]} ARE PICKING…` : "…"}
      urgent={yourTurn}
      order={fd.order.map((t) => ({ name: fd.names[t], you: t === YOU, on: t === clock }))}
      budget={`YOUR BUDGET $${budget}M`}
      board={fd.pool.filter((id) => !gone.has(id)).map((id) => {
        const p = dex.get(id)!, chem = chemFor(p);
        return { p, price: salary(p), over: salary(p) > budget, note: chem.boost > 0 ? `+${chem.boost} CHEM` : undefined, noteTitle: chem.names };
      })}
      yourTurn={yourTurn}
      picks={seen.map((pk, k) => ({
        tag: `R${Math.floor(k / fd.order.length) + 1}.${(k % fd.order.length) + 1}`, team: fd.names[pk.team], name: dex.get(pk.id)!.name, mine: pk.team === YOU,
      }))}
      slots={SLOTS.map((label, s) => ({ label: s < STARTERS ? label : "BENCH", p: roster[s] != null ? dex.get(roster[s]!)! : null }))}
      rate={slotOvr}
      canPlace={(slot) => roster[slot] == null}
      bestSlot={bestSlot}
      onPlace={(id, slot) => setFd(youPick(fd, dex, id, slot))}
      onSwap={(a, b) => setFd(swapYours(fd, a, b))}
    >
      <section className="px-box p-3">
        <h2 className="m-0 mb-1 font-head text-[12px] text-gold">YOUR CHEMISTRY</h2>
        <ChemistryList lineup={mine} dex={dex} />
      </section>
    </DraftRoom>
  );
}
