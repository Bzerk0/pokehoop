import { useEffect, useState, type ReactNode } from "react";
import type { RatedPokemon } from "../../core/types.ts";
import { blip, moveBlip, selectBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { PlayerModal, StatsButton } from "./Modal.tsx";
import { Sprite } from "./PlayerCard.tsx";

const best = (p: RatedPokemon) => p.ovr[p.best];
const PICK_MS = 280; // how fast the other teams' picks tick by on the board

/** A card on the board: the Pokémon, what he costs, a note under the price (chemistry, potential…), and whether
 *  he's out of your reach (greyed out). */
export type RoomCard = { p: RatedPokemon; price: number; over: boolean; note?: string; noteTitle?: string };
/** A line in the picks list. */
export type RoomPick = { tag: string; team: string; name: string; mine: boolean };
/** One of your roster spots: its label, who's in it, and a line under the name (a deal, say). */
export type RoomSlot = { label: string; p: RatedPokemon | null; sub?: string };

/** Picks tick onto the board one at a time (yours at once): how many of `total` are shown so far. */
export function useTicker(total: number, mine: (i: number) => boolean) {
  const [shown, setShown] = useState(0);
  const ticking = shown < total;
  useEffect(() => {
    if (!ticking) return;
    const quick = mine(shown);
    const t = setTimeout(() => {
      setShown((n) => n + 1);
      blip(quick ? 990 : 520, 40, 0.03);
    }, quick ? 0 : PICK_MS);
    return () => clearTimeout(t);
  }, [ticking, shown, total]);
  return Math.min(shown, total);
}

/**
 * The draft room, shared by the FULL DRAFT, the franchise's rookie draft and its free agency so they look and work
 * alike: a status bar (with the pick order, when there is one), the board of who's available, the picks coming in,
 * and your roster. On your turn, choose a card (one you can afford), then a roster spot for it (Enter = best fit).
 * A spot that's taken can be offered too (`canPlace`): it shows REPLACE.
 */
export function DraftRoom({
  kicker, status, urgent, order, boardTitle = "THE BOARD", budget, board, yourTurn, picksTitle = "THE PICKS", picks, picksEmpty,
  slots, rate, canPlace, bestSlot, onPlace, onSwap, actions, children,
}: {
  kicker: string; // the small line: ROUND 1 OF 8 · PICK 3 · CLASSIC
  status: string; // the big line: who's picking
  urgent: boolean; // it's on you: the big line blinks gold
  order?: { name: string; you: boolean; on: boolean }[]; // the pick order, whoever's on the clock lit
  boardTitle?: string;
  budget: string;
  board: RoomCard[];
  yourTurn: boolean; // cards can be chosen
  picksTitle?: string;
  picks: RoomPick[]; // oldest first (shown newest first)
  picksEmpty?: string;
  slots: RoomSlot[];
  rate: (slot: number, p: RatedPokemon) => number; // how he'd rate in that spot
  canPlace: (slot: number, p: RatedPokemon) => boolean;
  bestSlot: (p: RatedPokemon) => number | null; // where Enter puts him
  onPlace: (id: number, slot: number) => void;
  onSwap?: (a: number, b: number) => void; // click two roster cards (or a card and an open spot) to swap their positions
  actions?: ReactNode; // buttons in the status bar (PASS, AUTO-FILL…)
  children?: ReactNode; // under the roster (chemistry)
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState<RatedPokemon | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const sel = (yourTurn && board.find((c) => c.p.id === selected)?.p) || null;

  const swapClick = (slot: number) => {
    if (!onSwap) return;
    moveBlip();
    if (moving == null) return setMoving(slot);
    if (moving !== slot) onSwap(moving, slot);
    setMoving(null);
  };
  const place = (slot: number) => {
    if (!sel || !canPlace(slot, sel)) return;
    selectBlip();
    setSelected(null);
    onPlace(sel.id, slot);
  };
  useEffect(() => {
    if (urgent) [659, 880, 1175].forEach((f, k) => setTimeout(() => blip(f, 60, 0.05), k * 70)); // you're on the clock
  }, [urgent, picks.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && moving != null) return void (e.stopImmediatePropagation(), setMoving(null));
      if (!sel) return;
      if (e.key === "Enter") {
        const slot = bestSlot(sel);
        if (slot != null) (e.preventDefault(), place(slot));
      } else if (e.key === "Escape") (e.stopImmediatePropagation(), setSelected(null));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="flex flex-col gap-3">
      {/* the status bar: what's happening, and the order (whoever is on the clock lit) */}
      <section className="border-4 border-black bg-navy p-3" style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[24px] text-cloud">{kicker}</p>
            <p className={`m-0 font-head text-[24px] leading-[1.3] ${urgent ? "blink text-gold" : "text-white"}`}>{status}</p>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {order && (
          <div className="mt-2 flex flex-wrap gap-1">
            {order.map((t, i) => (
              <span key={i} className={`border-2 px-2 text-[18px] ${t.on ? "border-gold bg-gold text-black" : t.you ? "border-gold text-gold" : "border-slate text-cloud"}`}>
                {i + 1}. {t.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* the board: who's left, best first; the ones out of your reach are greyed out */}
        <section className="px-box flex max-h-[520px] flex-col p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="m-0 font-head text-[16px] text-gold">{boardTitle}</h2>
            <span className="text-[22px] text-lime">{budget}</span>
          </div>
          {/* (room on the right and below for the "i" buttons, which hang off their cards' corners) */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-x-hidden overflow-y-auto pb-[10px] pr-[10px] sm:grid-cols-4">
            {board.map(({ p, price, over, note, noteTitle }) => {
              const on = sel?.id === p.id;
              return (
                <div key={p.id} className="relative flex">
                  <button
                    className={`flex w-full flex-col items-center border-4 p-1 ${on ? "border-gold bg-navy" : "border-slate bg-night"} ${over ? "grayscale" : ""}`}
                    disabled={!yourTurn || over}
                    onClick={() => (moveBlip(), setSelected(on ? null : p.id))}
                  >
                    <span className="flex w-full justify-between text-[18px] leading-[18px]">
                      <span className="text-cloud">{p.best}</span>
                      <span className="font-head text-[12px] text-gold">{best(p)}</span>
                    </span>
                    <span className="flex h-[64px] items-end"><Sprite p={p} className="max-w-none" /></span>
                    <span className="w-full truncate text-center text-[18px] text-white">{p.name}</span>
                    <span className={`text-[18px] ${over ? "text-red" : "text-lime"}`}>${price}M</span>
                    <span className="h-[16px] w-full truncate text-center text-[16px] leading-[16px] text-lime" title={noteTitle}>{note ?? ""}</span>
                  </button>
                  <StatsButton p={p} onOpen={() => setStats(p)} className="absolute -bottom-[8px] -right-[8px]" />
                </div>
              );
            })}
          </div>
        </section>

        {/* the picks coming in, newest first */}
        <section className="px-box flex max-h-[520px] flex-col p-3">
          <h2 className="m-0 mb-2 font-head text-[16px] text-gold">{picksTitle}</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!picks.length && picksEmpty && <p className="m-0 text-[18px] leading-[18px] text-steel">{picksEmpty}</p>}
            {[...picks].reverse().map((pk, i) => (
              <div key={picks.length - i} className={`flex items-center gap-2 border-b-2 border-slate py-1 text-[18px] leading-[18px] ${pk.mine ? "text-gold" : "text-cloud"}`}>
                <span className="w-[54px] shrink-0">{pk.tag}</span>
                <span className="min-w-0 flex-1 truncate">{pk.team}</span>
                <span className="truncate text-white">{pk.name}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* your roster: with a Pokémon chosen, the spots it can go show how it'd rate there */}
      <section>
        <h2 className="m-0 mb-2 font-head text-[16px] text-cloud">
          {sel ? `PLACE ${sel.name.toUpperCase()}: CLICK A SPOT${bestSlot(sel) != null ? " (ENTER = BEST FIT)" : ""}` : moving != null ? "CLICK ANOTHER CARD OR OPEN SPOT TO SWAP (ESC = CANCEL)" : onSwap && slots.some((x) => x.p) ? "YOUR ROSTER · CLICK A CARD, THEN ANOTHER, TO SWAP POSITIONS" : "YOUR ROSTER"}
        </h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {slots.map((slot, s) => {
            const can = !!sel && canPlace(s, sel);
            const swap = !sel && !!onSwap && (slot.p != null || moving != null); // a filled card to pick up, or somewhere to put it down
            return (
              <div key={s} className="relative flex min-w-0">
              <button
                className={`flex w-full min-w-0 flex-col items-center border-4 p-1 ${moving === s ? "border-gold bg-navy" : `bg-night ${can ? (slot.p ? "border-red" : "border-gold") : swap && moving != null ? "border-white" : "border-slate"}`}`}
                disabled={!can && !swap}
                aria-pressed={swap ? moving === s : undefined}
                onClick={() => (can ? place(s) : swapClick(s))}
              >
                <span className="text-[18px] text-cloud">{slot.label}</span>
                <span className="relative flex h-[56px] w-full items-end justify-center">
                  {slot.p && <Sprite p={slot.p} className={`max-w-none ${can ? "opacity-30" : ""}`} />}
                  {can && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-black px-[4px] py-[2px] font-head text-[12px] text-gold">{rate(s, sel)}</span>
                    </span>
                  )}
                </span>
                <span className={`w-full truncate text-center text-[16px] ${can && slot.p ? "text-red" : "text-white"}`}>{can && slot.p ? "REPLACE" : (slot.p?.name ?? "")}</span>
                {slot.sub != null && <span className="h-[16px] w-full truncate text-center text-[16px] leading-[16px] text-cloud">{slot.sub}</span>}
              </button>
              {slot.p && <StatsButton p={slot.p} onOpen={() => setStats(slot.p)} className="absolute -bottom-[8px] -right-[8px]" />}
              </div>
            );
          })}
        </div>
      </section>
      {children}
      {stats && <PlayerModal p={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
