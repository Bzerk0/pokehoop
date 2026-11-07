// Pieces shared by Free Build and the Draft: the payroll meter, jersey colour pickers, share link and PNG card.
import { toPng } from "html-to-image";
import { useEffect, useRef, useState } from "react";
import { encodeLineup, type Lineup } from "../../core/lineup.ts";
import { SALARY_CAP } from "../../core/ratingConfig.ts";
import { PALETTE } from "../theme/palette.ts";
import { COLOR_NAMES, teamColor } from "./LineupCard.tsx";

export const shareUrl = (l: Lineup) => `${location.origin}/t/${encodeLineup(l)}`;

/** Save the lineup card as a PNG. pixelRatio 2: every art pixel becomes exactly 2×2 image pixels (1280×720). */
export async function downloadCard(card: HTMLElement, teamName: string) {
  const url = await toPng(card, { pixelRatio: 2, cacheBust: false });
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(teamName || "starting-5").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  a.click();
}

/** Payroll against the cap: a 20-segment bar ($5M a segment), green, then gold near the cap, red over it. */
export function CapMeter({ used }: { used: number }) {
  const over = used > SALARY_CAP;
  const color = over ? PALETTE.red : used > SALARY_CAP * 0.85 ? PALETTE.gold : PALETTE.lime;
  const segments = 20;
  const lit = Math.min(segments, Math.ceil((used / SALARY_CAP) * segments));
  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-1">
      <span className="flex justify-between gap-3 text-[20px] leading-[20px]">
        <span className="text-cloud">PAYROLL ${used}M OF ${SALARY_CAP}M</span>
        <span style={{ color }}>{over ? `OVER BY $${used - SALARY_CAP}M` : `$${SALARY_CAP - used}M LEFT`}</span>
      </span>
      <span className="flex gap-[2px] border-2 border-black bg-black p-[2px]" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={SALARY_CAP} aria-label="Payroll">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className="h-[16px] flex-1" style={{ background: i < lit ? color : PALETTE.slate }} />
        ))}
      </span>
    </div>
  );
}

/** A jersey colour: a swatch that opens the palette. Esc or a click elsewhere closes it. */
export function ColorPick({ label, value, onChange }: { label: string; value: number; onChange: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation(); // close the palette, don't leave the page
      setOpen(false);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, { capture: true });
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc, { capture: true });
    };
  }, [open]);
  const name = teamColor(value);
  return (
    <div ref={box} className="relative flex items-center gap-2">
      <span className="text-[20px] text-cloud">{label}</span>
      <button
        className="h-[28px] w-[44px] cursor-pointer border-2 border-white"
        style={{ background: PALETTE[name], boxShadow: `2px 2px 0 ${PALETTE.black}` }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label} colour: ${name}`}
      />
      {open && (
        <div className="px-box absolute left-0 top-[36px] z-20 grid w-max grid-cols-[repeat(8,20px)] gap-[4px] p-2">
          {COLOR_NAMES.map((c, i) => (
            <button
              key={c}
              className="h-[20px] w-[20px] cursor-pointer border-2"
              style={{ background: PALETTE[c], borderColor: i === value ? PALETTE.gold : PALETTE.black }}
              onClick={() => (onChange(i), setOpen(false))}
              aria-label={c}
              aria-pressed={i === value}
              title={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
