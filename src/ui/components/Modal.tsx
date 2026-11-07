import { useEffect, type ReactNode } from "react";
import type { RatedPokemon } from "../../core/types.ts";
import { backBlip } from "../sound.ts";
import { PALETTE } from "../theme/palette.ts";
import { PlayerCard } from "./PlayerCard.tsx";

/** A window over the page: a click outside or Esc closes it (and Esc goes no further, so the page stays). */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      e.stopImmediatePropagation();
      backBlip();
      onClose();
    };
    window.addEventListener("keydown", esc, { capture: true });
    return () => window.removeEventListener("keydown", esc, { capture: true });
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-full max-w-full flex-col gap-2 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-head text-[16px] text-gold">{title}</span>
          <button className="px-btn" onClick={onClose} autoFocus>
            CLOSE (ESC)
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PlayerModal({ p, onClose }: { p: RatedPokemon; onClose: () => void }) {
  return (
    <Modal title="STATS" onClose={onClose}>
      <PlayerCard p={p} />
    </Modal>
  );
}

/** The small "i" button that opens a Pokémon's stat card. */
export function StatsButton({ p, onOpen, className = "" }: { p: RatedPokemon; onOpen: () => void; className?: string }) {
  return (
    <button
      className={`flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center border-2 border-black bg-navy font-head text-[16px] leading-none text-white hover:bg-gold hover:text-black ${className}`}
      style={{ boxShadow: `2px 2px 0 ${PALETTE.black}` }}
      onClick={(e) => (e.stopPropagation(), onOpen())}
      aria-label={`Stats for ${p.name}`}
      title={`${p.name}'s stats`}
    >
      i
    </button>
  );
}
