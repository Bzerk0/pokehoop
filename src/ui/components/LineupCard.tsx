import { forwardRef } from "react";
import { chemistry } from "../../core/chemistry.ts";
import { boostedOvr, payroll, SLOTS, STARTERS, slotPosition, teamOvr, type Lineup } from "../../core/lineup.ts";
import { SALARY_CAP } from "../../core/ratingConfig.ts";
import type { RatedPokemon } from "../../core/types.ts";
import { BALL_URL } from "../art/ballLogo.ts";
import { inkOn, PALETTE, type PaletteName } from "../theme/palette.ts";
import { Sprite } from "./PlayerCard.tsx";

export const CARD_W = 640;
export const CARD_H = 360;
export const COLOR_NAMES = Object.keys(PALETTE) as PaletteName[];
export const teamColor = (i: number) => COLOR_NAMES[i] ?? "red";

/** The shareable lineup card: 640×360 art pixels, team name on a jersey-coloured band, five starters, bench.
 *  Saved as a PNG at a whole-number scale. */
export const LineupCard = forwardRef<HTMLDivElement, { lineup: Lineup; dex: Map<number, RatedPokemon> }>(function LineupCard(
  { lineup, dex },
  ref,
) {
  const [home, accent] = lineup.colors.map(teamColor);
  const ovr = teamOvr(lineup, dex);
  const { boosts } = chemistry(lineup, dex);
  const player = (slot: number) => (lineup.ids[slot] != null ? dex.get(lineup.ids[slot]!) : undefined);

  return (
    <div ref={ref} className="relative overflow-hidden bg-night" style={{ width: CARD_W, height: CARD_H }}>
      <div className="absolute inset-x-0 top-0 flex h-[64px] items-center gap-3 px-4" style={{ background: PALETTE[home] }}>
        <img src={BALL_URL} width={32} height={32} alt="" />
        <div className="min-w-0 flex-1 truncate font-head text-[16px]" style={{ color: PALETTE[inkOn(home)] }}>
          {lineup.name || "UNNAMED TEAM"}
        </div>
        <div className="border-2 border-black bg-black px-2 py-1 text-center">
          <div className="font-head text-[8px] text-cloud">TEAM OVR</div>
          <div className="font-head text-[20px] leading-[22px] text-gold">{ovr ?? "--"}</div>
        </div>
      </div>
      <div className="absolute inset-x-0 top-[64px] h-[6px]" style={{ background: PALETTE[accent] }} />

      <div className="absolute inset-x-[12px] top-[82px] flex gap-[8px]">
        {SLOTS.slice(0, STARTERS).map((slot, i) => {
          const p = player(i);
          return (
            <div key={slot} className="flex h-[176px] flex-1 flex-col border-2 border-black bg-navy p-[4px]">
              <div className="flex justify-between font-head text-[8px]">
                <span className="text-cloud">{slot}</span>
                <span className="text-gold">{p ? boostedOvr(i, p, boosts[i]) : ""}</span>
              </div>
              <div className="flex flex-1 items-end justify-center">{p && <Sprite p={p} eager />}</div>
              <div className="mt-[2px] h-[4px]" style={{ background: PALETTE[accent] }} />
              <div className="truncate pt-[2px] text-center text-[18px] leading-[18px] text-white">{p?.name ?? "—"}</div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-[12px] top-[270px] flex items-center gap-[8px]">
        <span className="w-[56px] font-head text-[8px] text-fog">BENCH</span>
        {SLOTS.slice(STARTERS).map((slot, j) => {
          const p = player(STARTERS + j);
          return (
            <div key={slot} className="flex h-[52px] flex-1 items-center gap-2 border-2 border-black bg-navy px-2">
              {/* bench sprites stay at whole-number size; a tall one shows its top half */}
              <span className="flex h-[44px] w-[52px] shrink-0 items-start justify-center overflow-hidden">{p && <Sprite p={p} eager className="max-w-none" />}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[18px] leading-[18px] text-white">{p?.name ?? "—"}</span>
                {p && <span className="font-head text-[8px] text-cloud">{slotPosition(STARTERS + j, p)} <span className="text-gold">{boostedOvr(STARTERS + j, p, boosts[STARTERS + j])}</span></span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-[24px] items-center justify-between bg-black px-4 font-head text-[8px] text-fog">
        <span>
          STARTING 5 · {lineup.mode.toUpperCase()} · PAYROLL <span className="text-lime">${payroll(lineup, dex)}M</span> / ${SALARY_CAP}M
        </span>
        <span>A FREE POKéMON HOOPS FAN GAME</span>
      </div>
    </div>
  );
});
